import { Router } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { query, withTransaction } from "../../regulator/server/db.ts";
import { requireSession, type Actor } from "../../regulator/server/session.ts";
import { postSigned } from "./send.ts";
import { recordOrgAuditTx } from "./audit.ts";

export const draftsRouter = Router();
draftsRouter.use(requireSession);

const ORG_ROLES = ["data_steward", "information_officer"];
const DRAFT_ROLES = ["data_steward", "information_officer", "security_officer"];

function orgActor(actor: Actor): boolean {
  return Boolean(actor.mfaOk && actor.orgId && ORG_ROLES.includes(actor.role));
}

function draftActor(actor: Actor): boolean {
  return Boolean(actor.mfaOk && actor.orgId && DRAFT_ROLES.includes(actor.role));
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
  if (!draftActor(actor)) {
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
  if (!draftActor(actor)) {
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
  if (!draftActor(actor)) {
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
         and org_ref = (select reference from organisations where id = $7)
       returning public_id as "publicId", revision, status`,
    [parsed.data.category, parsed.data.narrative, parsed.data.severity,
     parsed.data.priority, parsed.data.affectedCount, req.params.id, actor.orgId]
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
    "update drafts set status = 'ReadyForApproval', updated_at = now() where public_id = $1 and status = 'Draft' and org_ref = (select reference from organisations where id = $2) returning public_id as \"publicId\", status",
    [req.params.id, actor.orgId]
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
  const found = await query("select * from drafts where public_id = $1 and status = 'ReadyForApproval' and org_ref = (select reference from organisations where id = $2)", [req.params.id, actor.orgId]);
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
      where public_id = $2 and org_ref = (select reference from organisations where id = $3) returning public_id as "publicId", revision, status, approved_hash as "approvedHash"`,
    [draftHash(body), req.params.id, actor.orgId]
  );
  res.json(saved.rows[0]);
});

draftsRouter.post("/drafts/:id/send", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!orgActor(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const found = await query("select * from drafts where public_id = $1 and status = 'Approved' and org_ref = (select reference from organisations where id = $2)", [req.params.id, actor.orgId]);
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
    await query("update drafts set status = 'Draft', approved_revision = null, approved_hash = null where public_id = $1 and org_ref = (select reference from organisations where id = $2)", [req.params.id, actor.orgId]);
    res.status(422).json({ error: "the draft changed after approval, approval no longer binds" });
    return;
  }
  const keyPath = process.env.ORG_SENDER_KEY;
  const intakeUrl = process.env.REGULATOR_INTAKE_URL ?? "http://localhost:8100/intake/v1/submissions";
  if (!keyPath) {
    res.status(500).json({ error: "no sender key configured" });
    return;
  }
  await query("update drafts set status = 'Sending' where public_id = $1 and org_ref = (select reference from organisations where id = $2)", [req.params.id, actor.orgId]);
  let answer: Response;
  try {
    answer = await postSigned(intakeUrl, body);
  } catch {
    await query("update drafts set status = 'RetryPending' where public_id = $1 and org_ref = (select reference from organisations where id = $2)", [req.params.id, actor.orgId]);
    res.status(502).json({ error: "the regulator intake is not answering, retry later" });
    return;
  }
  if (answer.status === 201 || answer.status === 200) {
    const receipt = await answer.json();
    await query("update drafts set status = 'Acknowledged', receipt = $1::jsonb where public_id = $2 and org_ref = (select reference from organisations where id = $3)", [JSON.stringify(receipt), req.params.id, actor.orgId]);
    res.json({ ok: true, receipt });
    return;
  }
  if (answer.status === 409) {
    await query("update drafts set status = 'RetryPending', receipt = $1::jsonb where public_id = $2 and org_ref = (select reference from organisations where id = $3)", [JSON.stringify(await answer.json()), req.params.id, actor.orgId]);
    res.status(409).json({ error: "same identity, different bytes" });
    return;
  }
  if (answer.status === 422) {
    let detail: unknown = { error: "intake refused the draft" };
    try {
      detail = await answer.json();
    } catch {
      detail = { error: "intake refused the draft" };
    }
    const message = (detail as { error?: unknown }).error;
    await query("update drafts set status = 'Rejected', receipt = $1::jsonb where public_id = $2 and org_ref = (select reference from organisations where id = $3)", [JSON.stringify(detail), req.params.id, actor.orgId]);
    res.status(422).json({ error: typeof message === "string" ? message : "intake refused the draft" });
    return;
  }
  await query("update drafts set status = 'RetryPending' where public_id = $1 and org_ref = (select reference from organisations where id = $2)", [req.params.id, actor.orgId]);
  res.status(502).json({ error: "intake refused the draft, retry later" });
});

const notifyInput = z.object({
  channel: z.enum(["email", "sms", "phone", "letter"]).default("email"),
  templateText: z.string().min(1).max(2000).optional(),
});

const RUN_COLUMNS = `id, channel, status, affected_total as "affectedTotal",
  sent_count as "sentCount", failed_count as "failedCount",
  regulator_status as "regulatorStatus", regulator_error as "regulatorError",
  template_text as "templateText", actor,
  started_at as "startedAt", completed_at as "completedAt", created_at as "createdAt"`;

draftsRouter.get("/drafts/whoami", (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  res.json({
    username: actor.username, displayName: actor.displayName,
    role: actor.role, mfaOk: actor.mfaOk,
  });
});

draftsRouter.get("/drafts/:id/notifications", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!draftActor(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const found = await query(
    "select id from drafts where public_id = $1 and org_ref = (select reference from organisations where id = $2)",
    [req.params.id, actor.orgId]
  );
  if (found.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const runs = await query(
    `select ${RUN_COLUMNS} from notification_runs
      where draft_id = $1 and org_id = $2
      order by created_at desc, id desc`,
    [found.rows[0].id, actor.orgId]
  );
  res.json({ items: runs.rows });
});

draftsRouter.post("/drafts/:id/notify", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || actor.role !== "information_officer" || !actor.orgId) {
    res.status(403).json({ error: "only the information officer notifies affected people" });
    return;
  }
  const parsed = notifyInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "choose a channel from email, sms, phone or letter" });
    return;
  }
  const found = await query(
    "select * from drafts where public_id = $1 and org_ref = (select reference from organisations where id = $2)",
    [req.params.id, actor.orgId]
  );
  if (found.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const draft = found.rows[0];
  if (!["Approved", "ReadyForApproval", "Acknowledged"].includes(draft.status)) {
    res.status(409).json({ error: "only an approved draft can notify affected people" });
    return;
  }
  const affected = draft.affected_count ?? 0;
  if (affected <= 0) {
    res.status(400).json({ error: "this draft has no affected people to notify" });
    return;
  }
  const recipients = await query(
    "select count(*)::int as n from affected_recipients where org_id = $1",
    [actor.orgId]
  );
  if (recipients.rows[0].n === 0) {
    res.status(400).json({ error: "no synthetic recipients are loaded for this organisation" });
    return;
  }
  if (affected > recipients.rows[0].n) {
    res.status(409).json({
      error: `the recipient register holds ${recipients.rows[0].n} of ${affected} affected people, add the missing contacts first`,
    });
    return;
  }
  const active = await query(
    "select 1 from notification_runs where draft_id = $1 and org_id = $2 and status in ('queued','sending')",
    [draft.id, actor.orgId]
  );
  if (active.rows.length > 0) {
    res.status(409).json({ error: "a notification run is already in flight for this draft" });
    return;
  }

  const targeted = affected;
  const channel = parsed.data.channel;
  const template = parsed.data.templateText
    ?? `Synthetic POPIA section 22 affected-person notice for ${draft.public_id}. Recorded dispatch only, lab simulation.`;
  let runId: string;
  try {
    runId = await withTransaction(async (client) => {
      await recordOrgAuditTx(client, {
        actor: actor.username, action: "draft.notify.start", resource: draft.public_id,
        meta: { channel, affectedTotal: targeted },
      });
      const created = await client.query(
        `insert into notification_runs
           (org_id, draft_id, affected_total, channel, template_text, status, actor, started_at)
         values ($1, $2, $3, $4, $5, 'sending', $6, now()) returning id`,
        [actor.orgId, draft.id, targeted, channel, template, actor.username]
      );
      const id = created.rows[0].id as string;
      const targets = await client.query(
        "select reference, channel, contact_ref from affected_recipients where org_id = $1 order by reference asc limit $2",
        [actor.orgId, targeted]
      );
      let sent = 0;
      let failed = 0;
      for (const target of targets.rows) {
        const number = Number(String(target.reference).split("-").pop());
        const didFail = Number.isInteger(number) && number % 20 === 0;
        if (didFail) failed += 1;
        else sent += 1;
        await client.query(
          `insert into notification_deliveries (run_id, recipient_reference, channel, contact_ref, status, error)
           values ($1, $2, $3, $4, $5, $6)`,
          [id, target.reference, target.channel, target.contact_ref,
           didFail ? "failed" : "sent", didFail ? "synthetic delivery failure" : null]
        );
      }
      await client.query(
        `update notification_runs
            set status = 'complete', sent_count = $1, failed_count = $2, completed_at = now()
          where id = $3`,
        [sent, failed, id]
      );
      await recordOrgAuditTx(client, {
        actor: actor.username, action: "draft.notify.complete", resource: draft.public_id,
        meta: { channel, affectedTotal: targeted, sentCount: sent, failedCount: failed },
      });
      return id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "a notification run is already in flight for this draft" });
      return;
    }
    throw err;
  }

  const stored = await query(`select ${RUN_COLUMNS} from notification_runs where id = $1`, [runId]);
  const run = stored.rows[0];
  let warning: string | undefined;
  const receipt = draft.receipt && typeof draft.receipt === "object"
    ? (draft.receipt as { caseRef?: string })
    : {};
  const report = {
    draftPublicId: draft.public_id,
    orgRef: draft.org_ref,
    caseRef: receipt.caseRef,
    affectedTotal: run.affectedTotal,
    sent: run.sentCount,
    failed: run.failedCount,
    channel,
    completedAt: run.completedAt,
  };
  const reportUrl = process.env.REGULATOR_AFFECTED_URL
    ?? "http://localhost:8100/api/v1/intake/affected-notices";
  try {
    const answer = await postSigned(reportUrl, JSON.stringify(report));
    if (answer.status !== 200 && answer.status !== 201) {
      throw new Error(`regulator answered ${answer.status}`);
    }
    await query("update notification_runs set regulator_status = 'sent', regulator_error = null where id = $1", [runId]);
  } catch (err) {
    warning = "the affected notice was recorded locally, but the regulator report did not land; retry later";
    await query(
      "update notification_runs set regulator_status = 'failed', regulator_error = $1 where id = $2",
      [(err as Error).message.slice(0, 500), runId]
    );
  }

  const final = await query(`select ${RUN_COLUMNS} from notification_runs where id = $1`, [runId]);
  res.json({ runs: [final.rows[0]], ...(warning ? { warning } : {}) });
});
