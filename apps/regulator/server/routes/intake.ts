import { Router } from "express";
import { createHash } from "node:crypto";
import * as jose from "jose";
import { z } from "zod";
import { query, withTransaction } from "../db.ts";
import { recordAuditTx, recordAudit } from "../audit.ts";
import { appendVersion, enqueueEvaluation } from "../services/notifications.ts";

export const intakeRouter = Router();

const submissionPayload = z.object({
  submissionId: z.string().min(4).max(128),
  orgRef: z.string().min(1).max(40),
  category: z.string().min(1).max(120),
  narrative: z.string().min(1).max(8000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  priority: z.enum(["routine", "urgent", "immediate"]).default("routine"),
  affectedCount: z.number().int().min(0).nullable().default(null),
  revision: z.number().int().min(1).default(1),
});

// Signed intake. The body is a JWS compact string. Verification runs
// over the exact bytes before anything is parsed.
intakeRouter.post(
  "/intake/v1/submissions",
  expressRaw(),
  async (req, res) => {
    const raw = (req as unknown as { rawBody: string }).rawBody;
    if (!raw || typeof raw !== "string") {
      res.status(400).json({ error: "expected a signed submission" });
      return;
    }
    const header = safeHeader(raw);
    if (!header || header.alg !== "ES256" || typeof header.kid !== "string") {
      await recordAudit({ actor: "unknown-sender", action: "intake.rejected", resource: "intake", result: "denied", meta: { why: "bad header" } });
      res.status(401).json({ error: "unknown sender" });
      return;
    }
    const keyRow = await query("select sender_id, org_id, public_jwk from sender_keys where sender_id = $1 and active", [header.kid]);
    if (keyRow.rows.length === 0) {
      await recordAudit({ actor: header.kid, action: "intake.rejected", resource: "intake", result: "denied", meta: { why: "unregistered sender" } });
      res.status(401).json({ error: "unknown sender" });
      return;
    }
    let verified: jose.CompactVerifyResult;
    try {
      const key = await jose.importJWK(keyRow.rows[0].public_jwk, "ES256");
      verified = await jose.compactVerify(raw, key);
    } catch {
      await recordAudit({ actor: header.kid, action: "intake.rejected", resource: "intake", result: "denied", meta: { why: "bad signature" } });
      res.status(401).json({ error: "bad signature" });
      return;
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.from(verified.payload).toString("utf8"));
    } catch {
      res.status(400).json({ error: "submission is not JSON" });
      return;
    }
    const parsed = submissionPayload.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "submission fails validation" });
      return;
    }
    const senderId = header.kid as string;
    const payloadHash = createHash("sha256").update(raw).digest("hex");
    try {
      const receipt = await withTransaction(async (client) => {
        const prior = await client.query(
          "select payload_hash, response from intake_receipts where sender_id = $1 and submission_id = $2",
          [senderId, parsed.data.submissionId]
        );
        if (prior.rows.length > 0) {
          if (prior.rows[0].payload_hash !== payloadHash) {
            await recordAuditTx(client, {
              actor: senderId, action: "intake.conflict", resource: parsed.data.submissionId, result: "denied",
            });
            return { conflict: true, stored: prior.rows[0].response };
          }
          return { retry: true, stored: prior.rows[0].response };
        }
        const org = await client.query("select id from organisations where reference = $1", [parsed.data.orgRef]);
        if (org.rows.length === 0) {
          throw Object.assign(new Error("unknown organisation"), { status: 422 });
        }
        const count = await client.query("select count(*)::int as n from cases");
        const reference = `BR-2026-${String(100 + count.rows[0].n).padStart(4, "0")}`;
        const kase = await client.query(
          "insert into cases (reference, org_id, state, severity, priority) values ($1, $2, 'Pending', $3, $4) returning id",
          [reference, org.rows[0].id, parsed.data.severity, parsed.data.priority]
        );
        const caseId = kase.rows[0].id as string;
        await client.query(
          `insert into case_facts (case_id, discovery_source, breach_status, category, affected_count, count_precision, narrative)
           values ($1, 'org_portal', 'reported', $2, $3, $4, $5)`,
          [caseId, parsed.data.category, parsed.data.affectedCount,
           parsed.data.affectedCount === null ? "unknown" : "exact", parsed.data.narrative]
        );
        const note = await client.query(
          "insert into notifications (case_id, sender_org_id, channel) values ($1, $2, 'org_portal') returning id",
          [caseId, org.rows[0].id]
        );
        await appendVersion(client, note.rows[0].id, { ...parsed.data, senderId });
        const response = {
          caseRef: reference,
          notificationId: note.rows[0].id,
          receivedAt: new Date().toISOString(),
          destination: "test_receiver",
        };
        await client.query(
          "insert into intake_receipts (sender_id, submission_id, payload_hash, response) values ($1, $2, $3, $4::jsonb)",
          [senderId, parsed.data.submissionId, payloadHash, JSON.stringify(response)]
        );
        await enqueueEvaluation(client, caseId);
        await recordAuditTx(client, {
          actor: senderId, action: "intake.accepted", resource: caseId, result: "ok",
          meta: { reference, submissionId: parsed.data.submissionId },
        });
        return { receipt: response };
      });
      if ("conflict" in receipt) {
        res.status(409).json({ error: "same identity, different bytes", receipt: receipt.stored });
        return;
      }
      if ("retry" in receipt) {
        res.json({ ...receipt.stored, retried: true });
        return;
      }
      res.status(201).json(receipt.receipt);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      res.status(status).json({ error: (err as Error).message });
    }
  }
);

function safeHeader(raw: string): { alg?: string; kid?: string } | null {
  try {
    const first = raw.split(".")[0];
    return JSON.parse(Buffer.from(first, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function expressRaw(): import("express").RequestHandler {
  return (req, _res, next) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      (req as unknown as { rawBody: string }).rawBody = Buffer.concat(chunks).toString("utf8");
      next();
    });
  };
}
