import { Router } from "express";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import * as jose from "jose";
import { query } from "../../regulator/server/db.ts";
import { requireSession, type Actor } from "../../regulator/server/session.ts";

export const draftsRouter = Router();
draftsRouter.use(requireSession);

const ORG_ROLES = ["data_steward", "information_officer"];

function orgActor(actor: Actor): boolean {
  return Boolean(actor.mfaOk && actor.orgId && ORG_ROLES.includes(actor.role));
}

const draftInput = z.object({
  category: z.string().min(1).max(120),
  narrative: z.string().min(1).max(8000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  priority: z.enum(["routine", "urgent", "immediate"]).default("routine"),
  affectedCount: z.number().int().min(0).nullable().default(null),
});

function canonicalBody(row: {
  publicId: string; orgRef: string; category: string; narrative: string;
  severity: string; priority: string; affectedCount: number | null; revision: number;
}): string {
  return JSON.stringify({
    submissionId: row.publicId,
    orgRef: row.orgRef,
    category: row.category,
    narrative: row.narrative,
    severity: row.severity,
    priority: row.priority,
    affectedCount: row.affectedCount,
    revision: row.revision,
  });
}

export function draftHash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

draftsRouter.get("/drafts", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!orgActor(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const rows = await query(
    `select id, public_id as "publicId", category, narrative, severity, priority,
            affected_count as "affectedCount", revision, status,
            approved_revision as "approvedRevision", receipt, updated_at as "updatedAt"
       from drafts where org_ref = (select reference from organisations where id = $1)
       order by updated_at desc, id desc`,
    [actor.orgId]
  );
  res.json({ items: rows.rows });
});

draftsRouter.post("/drafts", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!orgActor(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = draftInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "a draft needs a category and a narrative" });
    return;
  }
  const org = await query("select reference from organisations where id = $1", [actor.orgId]);
  const count = await query("select count(*)::int as n from drafts");
  const publicId = `SUB-2026-${String(count.rows[0].n + 1).padStart(4, "0")}`;
  const row = await query(
    `insert into drafts (public_id, org_ref, category, narrative, severity, priority, affected_count, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning public_id as "publicId", revision, status`,
    [publicId, org.rows[0].reference, parsed.data.category, parsed.data.narrative,
     parsed.data.severity, parsed.data.priority, parsed.data.affectedCount, actor.userId]
  );
  res.status(201).json(row.rows[0]);
});

draftsRouter.put("/drafts/:id", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!orgActor(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = draftInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "a draft needs a category and a narrative" });
    return;
  }
  const row = await query(
    `update drafts set category = $1, narrative = $2, severity = $3, priority = $4,
            affected_count = $5, revision = revision + 1, status = 'Draft',
            approved_revision = null, approved_hash = null, updated_at = now()
       where public_id = $6 and status in ('Draft','ReadyForApproval','Approved')
       returning public_id as "publicId", revision, status`,
    [parsed.data.category, parsed.data.narrative, parsed.data.severity,
     parsed.data.priority, parsed.data.affectedCount, req.params.id]
  );
  if (row.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row.rows[0]);
});

draftsRouter.post("/drafts/:id/submit", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!orgActor(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const row = await query(
    "update drafts set status = 'ReadyForApproval', updated_at = now() where public_id = $1 and status = 'Draft' returning public_id as \"publicId\", status",
    [req.params.id]
  );
  if (row.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row.rows[0]);
});

draftsRouter.post("/drafts/:id/approve", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || actor.role !== "information_officer" || !actor.orgId) {
    res.status(403).json({ error: "only the information officer approves" });
    return;
  }
  const found = await query("select * from drafts where public_id = $1 and status = 'ReadyForApproval'", [req.params.id]);
  if (found.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const row = found.rows[0];
  const body = canonicalBody({
    publicId: row.public_id, orgRef: row.org_ref, category: row.category,
    narrative: row.narrative, severity: row.severity, priority: row.priority,
    affectedCount: row.affected_count, revision: row.revision,
  });
  const saved = await query(
    `update drafts set status = 'Approved', approved_revision = revision, approved_hash = $1, updated_at = now()
      where public_id = $2 returning public_id as "publicId", revision, status, approved_hash as "approvedHash"`,
    [draftHash(body), req.params.id]
  );
  res.json(saved.rows[0]);
});

draftsRouter.post("/drafts/:id/send", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!orgActor(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const found = await query("select * from drafts where public_id = $1 and status = 'Approved'", [req.params.id]);
  if (found.rows.length === 0) {
    res.status(404).json({ error: "only approved drafts are sent" });
    return;
  }
  const row = found.rows[0];
  const body = canonicalBody({
    publicId: row.public_id, orgRef: row.org_ref, category: row.category,
    narrative: row.narrative, severity: row.severity, priority: row.priority,
    affectedCount: row.affected_count, revision: row.revision,
  });
  if (row.approved_revision !== row.revision || row.approved_hash !== draftHash(body)) {
    await query("update drafts set status = 'Draft', approved_revision = null, approved_hash = null where public_id = $1", [req.params.id]);
    res.status(422).json({ error: "the draft changed after approval, approval no longer binds" });
    return;
  }
  const keyPath = process.env.ORG_SENDER_KEY;
  const senderId = process.env.ORG_SENDER_ID ?? "org-karoo-01";
  const intakeUrl = process.env.REGULATOR_INTAKE_URL ?? "http://localhost:8100/intake/v1/submissions";
  if (!keyPath) {
    res.status(500).json({ error: "no sender key configured" });
    return;
  }
  await query("update drafts set status = 'Sending' where public_id = $1", [req.params.id]);
  let answer: Response;
  try {
    const privateKey = await jose.importJWK(JSON.parse(readFileSync(keyPath, "utf8") as unknown as string), "ES256");
    const jws = await new jose.CompactSign(Buffer.from(body, "utf8"))
      .setProtectedHeader({ alg: "ES256", kid: senderId })
      .sign(privateKey);
    answer = await fetch(intakeUrl, { method: "POST", headers: { "content-type": "application/jose" }, body: jws });
  } catch {
    await query("update drafts set status = 'RetryPending' where public_id = $1", [req.params.id]);
    res.status(502).json({ error: "the regulator intake is not answering, retry later" });
    return;
  }
  if (answer.status === 201 || answer.status === 200) {
    const receipt = await answer.json();
    await query("update drafts set status = 'Acknowledged', receipt = $1::jsonb where public_id = $2", [JSON.stringify(receipt), req.params.id]);
    res.json({ ok: true, receipt });
    return;
  }
  if (answer.status === 409) {
    await query("update drafts set status = 'RetryPending', receipt = $1::jsonb where public_id = $2", [JSON.stringify(await answer.json()), req.params.id]);
    res.status(409).json({ error: "same identity, different bytes" });
    return;
  }
  await query("update drafts set status = 'RetryPending' where public_id = $1", [req.params.id]);
  res.status(502).json({ error: "intake refused the draft, retry later" });
});
