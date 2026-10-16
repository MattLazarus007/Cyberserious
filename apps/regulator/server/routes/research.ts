import { Router } from "express";
import { query } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { open, researchKey } from "../encrypt.ts";

export const researchRouter = Router();
researchRouter.use(requireSession);

function reader(actor: Actor): boolean {
  return Boolean(actor.mfaOk && can(actor.role, "read_case"));
}

researchRouter.get("/research", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!reader(actor)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const cases = await query("select reference, name, sector, period, summary, confidence from research_cases order by reference asc");
  const key = safeKey();
  const sources = await query("select case_ref as \"caseRef\", title, outlet, published_on as \"publishedOn\", confidence, detail_sealed as sealed from research_sources order by published_on nulls last, title asc");
  const items = sources.rows.map((row) => ({
    caseRef: row.caseRef,
    title: row.title,
    outlet: row.outlet,
    publishedOn: row.publishedOn,
    confidence: row.confidence,
    note: key && row.sealed ? tryOpen(row.sealed, key) : null,
  }));
  const findings = await query("select case_ref as \"caseRef\", csf_function as \"csf\", finding, confidence from research_findings order by case_ref asc, csf_function asc");
  const policy = await query("select version, body, effective_from as \"effectiveFrom\" from policy_versions order by version desc limit 1");
  res.json({ cases: cases.rows, sources: items, findings: findings.rows, policy: policy.rows[0] ?? null });
});

function safeKey(): string | null {
  try {
    return researchKey();
  } catch {
    return null;
  }
}

function tryOpen(sealed: string, key: string): string | null {
  try {
    return open(sealed, key);
  } catch {
    return null;
  }
}

researchRouter.get("/obligations", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!reader(actor)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const rows = await query("select code, duty, trigger, timing_note as \"timingNote\" from obligations order by code asc");
  res.json({ items: rows.rows });
});

researchRouter.get("/cases/:id/obligations", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!reader(actor)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const params: unknown[] = [req.params.id];
  let scope = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    scope = "and c.org_id = $2";
  }
  const rows = await query(
    `select o.code, o.duty, o.trigger, o.timing_note as "timingNote",
            co.status, co.note
       from case_obligations co
       join cases c on c.id = co.case_id
       join obligations o on o.code = co.obligation_code
      where (c.id::text = $1 or c.reference = $1) ${scope}
      order by o.code asc`,
    params
  );
  if (rows.rows.length === 0) {
    const exists = await query(`select id from cases c where (c.id::text = $1 or c.reference = $1) ${scope}`, params);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: "not found" });
      return;
    }
  }
  res.json({ items: rows.rows });
});
