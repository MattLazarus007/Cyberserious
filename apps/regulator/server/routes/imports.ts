import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { recordAuditTx } from "../audit.ts";
import { appendVersion, enqueueEvaluation } from "../services/notifications.ts";

export const importsRouter = Router();
importsRouter.use(requireSession);

const captureInput = z.object({
  orgRef: z.string().min(1).max(40),
  category: z.string().min(1).max(120),
  narrative: z.string().min(1).max(8000),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  priority: z.enum(["routine", "urgent", "immediate"]).default("routine"),
  externalRef: z.string().max(120).optional(),
  claimedAt: z.string().datetime().optional(),
  affectedCount: z.number().int().min(0).nullable().optional(),
});

function referenceFor(dayCount: number): string {
  return `BR-2026-${String(dayCount).padStart(4, "0")}`;
}

importsRouter.post("/imports", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "import_record")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = captureInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "capture needs an org, a category and a narrative" });
    return;
  }
  const org = await query("select id from organisations where reference = $1", [parsed.data.orgRef]);
  if (org.rows.length === 0) {
    res.status(422).json({ error: "unknown organisation reference" });
    return;
  }
  const saved = await withTransaction(async (client) => {
    const count = await client.query("select count(*)::int as n from cases");
    const reference = referenceFor(100 + count.rows[0].n);
    const kase = await client.query(
      "insert into cases (reference, org_id, state, severity, priority) values ($1, $2, 'Pending', $3, $4) returning id, reference",
      [reference, org.rows[0].id, parsed.data.severity, parsed.data.priority]
    );
    const caseId = kase.rows[0].id as string;
    await client.query(
      `insert into case_facts (case_id, discovery_source, breach_status, category, affected_count, count_precision, narrative)
       values ($1, 'manual capture', 'reported', $2, $3, $4, $5)`,
      [caseId, parsed.data.category, parsed.data.affectedCount ?? null,
       parsed.data.affectedCount === null || parsed.data.affectedCount === undefined ? "unknown" : "exact",
       parsed.data.narrative]
    );
    const note = await client.query(
      "insert into notifications (case_id, sender_org_id, channel) values ($1, $2, 'manual_import') returning id",
      [caseId, org.rows[0].id]
    );
    const body = {
      reference,
      orgRef: parsed.data.orgRef,
      category: parsed.data.category,
      narrative: parsed.data.narrative,
      externalRef: parsed.data.externalRef ?? null,
      claimedAt: parsed.data.claimedAt ?? null,
      enteredBy: actor.username,
    };
    const first = await appendVersion(client, note.rows[0].id as string, body);
    await enqueueEvaluation(client, caseId);
    await recordAuditTx(client, {
      actor: actor.username,
      action: "record.import",
      resource: caseId,
      result: "ok",
      meta: { reference, revision: first.revision },
    });
    return { caseId, reference, notificationId: note.rows[0].id, revision: first.revision, hash: first.hash };
  });
  res.status(201).json(saved);
});

const supplementInput = z.object({
  category: z.string().min(1).max(120).optional(),
  narrative: z.string().min(1).max(8000).optional(),
  affectedCount: z.number().int().min(0).nullable().optional(),
});

importsRouter.post("/notifications/:id/supplements", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "import_record")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = supplementInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "a supplement needs at least one field" });
    return;
  }
  const note = await query("select id, case_id as \"caseId\" from notifications where id = $1", [req.params.id]);
  if (note.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const saved = await withTransaction(async (client) => {
    const latest = await client.query(
      "select payload from notification_versions where notification_id = $1 order by revision desc limit 1",
      [req.params.id]
    );
    const merged = { ...(latest.rows[0]?.payload ?? {}), ...parsed.data, supplementedBy: actor.username };
    const next = await appendVersion(client, req.params.id, merged);
    await enqueueEvaluation(client, note.rows[0].caseId);
    await recordAuditTx(client, {
      actor: actor.username,
      action: "record.supplement",
      resource: note.rows[0].caseId,
      result: "ok",
      meta: { notificationId: req.params.id, revision: next.revision },
    });
    return next;
  });
  res.status(201).json(saved);
});

importsRouter.get("/notifications/:id/versions", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "read_case")) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const rows = await query(
    `select revision, payload_hash as "payloadHash", received_at as "receivedAt", predecessor_revision as "predecessor"
       from notification_versions where notification_id = $1 order by revision asc`,
    [req.params.id]
  );
  if (rows.rows.length === 0) {
    const exists = await query("select id from notifications where id = $1", [req.params.id]);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: "not found" });
      return;
    }
  }
  res.json({ items: rows.rows });
});
