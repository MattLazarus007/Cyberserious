import { Router } from "express";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { query, withTransaction } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { recordAuditTx, recordAudit } from "../audit.ts";

export const evidenceRouter = Router();
evidenceRouter.use(requireSession);

const ALLOWED: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "text/plain": [".txt"],
};
const MAX_BYTES = 10 * 1024 * 1024;

function evidenceDir(): string {
  const dir = process.env.EVIDENCE_DIR ?? join(process.cwd(), "data", "evidence");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface ExtractionNotice {
  id: string;
  actor: string;
  what: string;
  caseRef: string;
  caseId: string | null;
  result: "ok" | "blocked";
  at: string;
}

export async function noticeExtraction(notice: ExtractionNotice): Promise<void> {
  try {
    await query(
      `insert into outbox_jobs (job_type, resource_id, dedupe_key)
       values ('extraction_notice', $1, $2)`,
      [JSON.stringify(notice), `extract:${notice.id}:${Date.now()}`]
    );
  } catch {
    // A notice that cannot be queued must never fail the download.
  }
}

const uploadInput = z.object({
  filename: z.string().min(1).max(160),
  mime: z.string().min(1).max(80),
  contentBase64: z.string().min(1),
});

evidenceRouter.post("/cases/:id/evidence", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "write_note")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = uploadInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "upload needs a filename, a mime type and content" });
    return;
  }
  const exts = ALLOWED[parsed.data.mime];
  const lower = parsed.data.filename.toLowerCase();
  if (!exts || !exts.some((ext) => lower.endsWith(ext))) {
    res.status(422).json({ error: "only pdf, png, jpeg and txt files are accepted" });
    return;
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(parsed.data.contentBase64, "base64");
  } catch {
    res.status(400).json({ error: "content is not valid base64" });
    return;
  }
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    res.status(422).json({ error: "files must be non-empty and under 10 MiB" });
    return;
  }
  const params: unknown[] = [req.params.id];
  let scope = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    scope += `and org_id = $${params.length} `;
  }
  if (actor.role === "regulator_analyst") {
    params.push(actor.userId);
    scope += `and (assigned_to IS NULL OR assigned_to = $${params.length}::uuid) `;
  }
  const found = await query(`select id from cases where (id::text = $1 or reference = $1) ${scope}`, params);
  if (found.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const saved = await withTransaction(async (client) => {
    const row = await client.query(
      `insert into evidence (case_id, filename, mime, size_bytes, sha256, uploaded_by)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [found.rows[0].id, parsed.data.filename, parsed.data.mime, bytes.length, digest, actor.userId]
    );
    writeFileSync(join(evidenceDir(), `${row.rows[0].id}.bin`), bytes);
    await recordAuditTx(client, {
      actor: actor.username, action: "evidence.upload", resource: found.rows[0].id, result: "ok",
      meta: { evidenceId: row.rows[0].id, sha256: digest },
    });
    return row.rows[0].id as string;
  });
  res.status(201).json({ id: saved, sha256: digest, status: "quarantine" });
});

evidenceRouter.get("/evidence/:id", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  const at = new Date().toISOString();
  if (!actor.mfaOk || !can(actor.role, "read_case")) {
    await noticeExtraction({
      id: req.params.id, actor: actor.username, what: req.params.id,
      caseRef: "unknown case", caseId: null, result: "blocked", at,
    });
    res.status(404).json({ error: "not found" });
    return;
  }
  const params: unknown[] = [req.params.id];
  let scope = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    scope += `and c.org_id = $${params.length} `;
  }
  if (actor.role === "regulator_analyst") {
    params.push(actor.userId);
    scope += `and (c.assigned_to IS NULL OR c.assigned_to = $${params.length}::uuid) `;
  }
  const rows = await query(
    `select e.id, e.case_id as "caseId", e.filename, e.mime, e.size_bytes as "sizeBytes",
            e.sha256, e.status, c.reference as "caseRef" from evidence e join cases c on c.id = e.case_id
      where e.id = $1 ${scope}`,
    params
  );
  if (rows.rows.length === 0) {
    await noticeExtraction({
      id: req.params.id, actor: actor.username, what: req.params.id,
      caseRef: "unknown case", caseId: null, result: "blocked", at,
    });
    res.status(404).json({ error: "not found" });
    return;
  }
  const found = rows.rows[0] as { id: string; caseId: string; filename: string; mime: string; status: string; caseRef: string };
  if (found.status !== "clean") {
    await noticeExtraction({
      id: found.id, actor: actor.username, what: found.filename,
      caseRef: found.caseRef, caseId: found.caseId, result: "blocked", at,
    });
    res.status(404).json({ error: "not found" });
    return;
  }
  const file = join(evidenceDir(), `${req.params.id}.bin`);
  if (!existsSync(file)) {
    await noticeExtraction({
      id: found.id, actor: actor.username, what: found.filename,
      caseRef: found.caseRef, caseId: found.caseId, result: "blocked", at,
    });
    res.status(404).json({ error: "not found" });
    return;
  }
  await recordAudit({
    actor: actor.username, action: "evidence.download", resource: found.caseId, result: "ok",
    meta: { evidenceId: req.params.id },
  });
  await noticeExtraction({
    id: found.id, actor: actor.username, what: found.filename,
    caseRef: found.caseRef, caseId: found.caseId, result: "ok", at,
  });
  res.setHeader("content-type", found.mime);
  res.setHeader("content-disposition", `attachment; filename="${found.filename}"`);
  res.send(readFileSync(file));
});

evidenceRouter.post("/evidence/:id/review", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "transition_case")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const { verdict } = req.body ?? {};
  if (verdict !== "clean" && verdict !== "rejected") {
    res.status(400).json({ error: "verdict is clean or rejected" });
    return;
  }
  const done = await query("update evidence set status = $1 where id = $2 and status = 'quarantine' returning case_id", [
    verdict,
    req.params.id,
  ]);
  if (done.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await recordAudit({
    actor: actor.username, action: "evidence.review", resource: done.rows[0].case_id, result: "ok",
    meta: { evidenceId: req.params.id, verdict },
  });
  res.json({ ok: true, status: verdict });
});

evidenceRouter.get("/cases/:id/export", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  const at = new Date().toISOString();
  if (!actor.mfaOk || !can(actor.role, "read_case")) {
    await noticeExtraction({
      id: req.params.id, actor: actor.username, what: "the case export",
      caseRef: req.params.id, caseId: null, result: "blocked", at,
    });
    res.status(404).json({ error: "not found" });
    return;
  }
  const params: unknown[] = [req.params.id];
  let scope = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    scope += `and c.org_id = $${params.length} `;
  }
  if (actor.role === "regulator_analyst") {
    params.push(actor.userId);
    scope += `and (c.assigned_to IS NULL OR c.assigned_to = $${params.length}::uuid) `;
  }
  const rows = await query(
    `select c.id as "caseId", c.reference, o.display_name as "orgName", c.state, c.severity,
            c.priority, c.opened_at as "openedAt", c.closed_at as "closedAt",
            f.category, f.breach_status as "breachStatus",
            case when f.count_precision = 'unknown' then null else f.affected_count end as "affectedCount"
       from cases c join organisations o on o.id = c.org_id
       left join case_facts f on f.case_id = c.id
      where (c.id::text = $1 or c.reference = $1) ${scope}`,
    params
  );
  if (rows.rows.length === 0) {
    await noticeExtraction({
      id: req.params.id, actor: actor.username, what: "the case export",
      caseRef: req.params.id, caseId: null, result: "blocked", at,
    });
    res.status(404).json({ error: "not found" });
    return;
  }
  const record = rows.rows[0] as { caseId: string; reference: string } & Record<string, unknown>;
  const notes = await query(
    "select count(*)::int as n from case_notes where case_id = (select id from cases where id::text = $1 or reference = $1)",
    [req.params.id]
  );
  await recordAudit({
    actor: actor.username, action: "case.export", resource: req.params.id, result: "ok",
  });
  await noticeExtraction({
    id: record.caseId, actor: actor.username, what: "the case export",
    caseRef: record.reference, caseId: record.caseId, result: "ok", at,
  });
  const { caseId, ...body } = record;
  void caseId;
  res.json({ ...body, noteCount: notes.rows[0].n, exportedAt: new Date().toISOString(), marking: "synthetic academic export" });
});
