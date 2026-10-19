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
          `insert into case_facts (case_id, discovery_source, breach_status, category, affected_count, count_precision, narrative, triaged_at)
           values ($1, 'org_portal', 'reported', $2, $3, $4, $5, now())`,
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

const affectedNoticePayload = z.object({
  draftPublicId: z.string().min(4).max(128),
  orgRef: z.string().min(1).max(40).optional(),
  caseRef: z.string().min(4).max(64).optional(),
  affectedTotal: z.number().int().min(0),
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
  channel: z.enum(["email", "sms", "phone", "letter"]),
  completedAt: z.string().datetime(),
});

async function verifyNotice(raw: string): Promise<{ senderId: string; orgId: string; body: unknown }> {
  const header = safeHeader(raw);
  if (!header || header.alg !== "ES256" || typeof header.kid !== "string") {
    await recordAudit({ actor: "unknown-sender", action: "intake.affected_notice.rejected", resource: "affected_notice", result: "denied", meta: { why: "bad header" } });
    throw Object.assign(new Error("unknown sender"), { status: 401 });
  }
  const keyRow = await query("select sender_id, org_id, public_jwk from sender_keys where sender_id = $1 and active", [header.kid]);
  if (keyRow.rows.length === 0) {
    await recordAudit({ actor: header.kid, action: "intake.affected_notice.rejected", resource: "affected_notice", result: "denied", meta: { why: "unregistered sender" } });
    throw Object.assign(new Error("unknown sender"), { status: 401 });
  }
  let verified: jose.CompactVerifyResult;
  try {
    const key = await jose.importJWK(keyRow.rows[0].public_jwk, "ES256");
    verified = await jose.compactVerify(raw, key);
  } catch {
    await recordAudit({ actor: header.kid, action: "intake.affected_notice.rejected", resource: "affected_notice", result: "denied", meta: { why: "bad signature" } });
    throw Object.assign(new Error("bad signature"), { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.from(verified.payload).toString("utf8"));
  } catch {
    throw Object.assign(new Error("notice is not JSON"), { status: 400 });
  }
  return { senderId: header.kid, orgId: keyRow.rows[0].org_id, body };
}

intakeRouter.post(
  "/api/v1/intake/affected-notices",
  expressRaw(),
  async (req, res) => {
    const raw = (req as unknown as { rawBody: string }).rawBody;
    if (!raw || typeof raw !== "string") {
      res.status(400).json({ error: "expected a signed affected notice" });
      return;
    }
    try {
      const { senderId, orgId, body } = await verifyNotice(raw);
      const parsed = affectedNoticePayload.safeParse(body);
      if (!parsed.success) {
        res.status(400).json({ error: "affected notice fails validation" });
        return;
      }
      const notice = parsed.data;
      if (notice.sent + notice.failed > notice.affectedTotal) {
        res.status(422).json({ error: "sent and failed cannot exceed the affected total" });
        return;
      }
      const senderOrg = await query("select reference from organisations where id = $1", [orgId]);
      if (notice.orgRef && notice.orgRef !== senderOrg.rows[0].reference) {
        res.status(422).json({ error: "the sender key does not belong to that organisation" });
        return;
      }
      let caseId: string | null = null;
      let caseRef: string | null = null;
      if (notice.caseRef) {
        const found = await query("select id, reference from cases where reference = $1 and org_id = $2", [notice.caseRef, orgId]);
        if (found.rows.length === 0) {
          res.status(422).json({ error: "unknown case reference" });
          return;
        }
        caseId = found.rows[0].id;
        caseRef = found.rows[0].reference;
      } else {
        const receipt = await query(
          "select response->>'caseRef' as reference from intake_receipts where sender_id = $1 and submission_id = $2",
          [senderId, notice.draftPublicId]
        );
        if (receipt.rows.length > 0 && receipt.rows[0].reference) {
          caseRef = receipt.rows[0].reference;
          const found = await query("select id from cases where reference = $1 and org_id = $2", [caseRef, orgId]);
          if (found.rows.length > 0) caseId = found.rows[0].id;
        }
      }
      const payloadHash = createHash("sha256").update(raw).digest("hex");
      const result = await withTransaction(async (client) => {
        const inserted = await client.query(
          `insert into affected_notices
             (case_id, draft_public_id, sender_org_id, affected_total, sent, failed, channel, completed_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (sender_org_id, draft_public_id, channel, completed_at) do nothing
           returning id`,
          [caseId, notice.draftPublicId, orgId, notice.affectedTotal, notice.sent, notice.failed, notice.channel, notice.completedAt]
        );
        if (inserted.rows.length === 0) {
          const prior = await client.query(
            `select id from affected_notices
              where sender_org_id = $1 and draft_public_id = $2 and channel = $3 and completed_at = $4`,
            [orgId, notice.draftPublicId, notice.channel, notice.completedAt]
          );
          return { noticeId: prior.rows[0].id as string, duplicate: true };
        }
        const noticeId = inserted.rows[0].id as string;
        if (notice.sent < notice.affectedTotal) {
          const shortfall = notice.affectedTotal - notice.sent;
          await client.query(
            `insert into alerts
               (case_id, rule_id, rule_version, dedupe_key, priority, reason, input_hash, state)
             values ($1, 'AFFECTED-NOTICE-SHORTFALL', 1, $2, 'medium', $3, $4, 'open')
             on conflict (dedupe_key) do nothing`,
            [
              caseId,
              `AFFECTED-NOTICE-SHORTFALL:v1:${notice.draftPublicId}:${notice.channel}:${notice.completedAt}`,
              `Affected notice shortfall on ${notice.draftPublicId}: sent ${notice.sent} of ${notice.affectedTotal} by ${notice.channel}, ${shortfall} short, ${notice.failed} failed.`,
              payloadHash,
            ]
          );
        }
        await recordAuditTx(client, {
          actor: senderId, action: "intake.affected_notice", resource: caseId ?? notice.draftPublicId,
          result: "ok",
          meta: {
            draftPublicId: notice.draftPublicId, channel: notice.channel,
            affectedTotal: notice.affectedTotal, sent: notice.sent, failed: notice.failed,
          },
        });
        return { noticeId, duplicate: false };
      });
      res.status(result.duplicate ? 200 : 201).json({
        recorded: true, noticeId: result.noticeId, caseRef,
        ...(result.duplicate ? { duplicate: true } : {}),
      });
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
