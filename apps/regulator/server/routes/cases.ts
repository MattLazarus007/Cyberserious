import { Router } from "express";
import { query } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { z } from "zod";

export const casesRouter = Router();
casesRouter.use(requireSession);

function actorOf(req: unknown): Actor {
  return (req as { actor: Actor }).actor;
}

casesRouter.get("/me", (req, res) => {
  const actor = actorOf(req);
  res.json({
    username: actor.username, displayName: actor.displayName,
    email: actor.email, phone: actor.phone,
    role: actor.role, mfaOk: actor.mfaOk,
  });
});

const listInput = z.object({
  state: z.string().optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

casesRouter.get("/cases", async (req, res) => {
  const actor = actorOf(req);
  if (!actor.mfaOk || !can(actor.role, "read_cases")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = listInput.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "bad query" });
    return;
  }
  const { state, q, page, pageSize } = parsed.data;
  const where: string[] = [];
  const params: unknown[] = [];
  if (actor.orgId) {
    params.push(actor.orgId);
    where.push(`c.org_id = $${params.length}`);
  }
  if (actor.role === "regulator_analyst") {
    params.push(actor.userId);
    where.push(`(c.assigned_to IS NULL OR c.assigned_to = $${params.length}::uuid)`);
  }
  if (state) {
    params.push(state);
    where.push(`c.state = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(c.reference ilike $${params.length} or o.display_name ilike $${params.length})`);
  }
  const whereSql = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const total = await query(
    `select count(*)::int as n from cases c join organisations o on o.id = c.org_id ${whereSql}`,
    params
  );
  const offset = (page - 1) * pageSize;
  const rows = await query(
    `select c.id, c.reference, o.display_name as "orgName", c.state, c.priority, c.opened_at as "openedAt",
            f.incident_occurred_at as "occurredAt",
            exists (select 1 from notifications n where n.case_id = c.id) as "notified"
       from cases c join organisations o on o.id = c.org_id
       left join case_facts f on f.case_id = c.id
       ${whereSql}
       order by c.opened_at desc, c.id desc
       limit $${params.length + 1} offset $${params.length + 2}`,
    [...params, pageSize, offset]
  );
  res.json({ items: rows.rows, total: total.rows[0].n, page, pageSize });
});

casesRouter.get("/cases/:id", async (req, res) => {
  const actor = actorOf(req);
  if (!actor.mfaOk || !can(actor.role, "read_case")) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const key = req.params.id;
  const params: unknown[] = [key];
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
    `select c.id, c.reference, o.display_name as "orgName", o.reference as "orgRef",
            c.state, c.severity, c.priority, c.assigned_to as "assignedTo",
            c.row_version as "rowVersion", c.opened_at as "openedAt",
            c.closed_at as "closedAt", c.closure_reason as "closureReason",
            f.incident_occurred_at as "occurredAt", f.occurred_precision as "occurredPrecision",
            f.discovered_at as "discoveredAt", f.discovered_precision as "discoveredPrecision",
            f.discovery_source as "discoverySource", f.breach_status as "breachStatus",
            f.category, f.affected_count as "affectedCount", f.count_precision as "countPrecision",
            f.data_categories as "dataCategories", f.narrative,
            an.sent as "affectedSent", an.affected_total as "affectedTotal",
            an.channel as "affectedChannel", an.completed_at as "affectedCompletedAt"
       from cases c
       join organisations o on o.id = c.org_id
       left join case_facts f on f.case_id = c.id
       left join lateral (
         select sent, affected_total, channel, completed_at
           from affected_notices n
          where n.case_id = c.id
          order by n.completed_at desc, n.received_at desc
          limit 1
       ) an on true
      where (c.id::text = $1 or c.reference = $1) ${scope}`,
    params
  );
  if (rows.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(rows.rows[0]);
});

casesRouter.get("/dashboard", async (req, res) => {
  const actor = actorOf(req);
  if (!actor.mfaOk || !can(actor.role, "read_cases")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const params: unknown[] = [];
  let orgFilter = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    orgFilter = "and c.org_id = $1";
  }
  const numbers = await query(
    `select (select count(*)::int from cases c where true ${orgFilter}) as "totalCases",
            (select count(distinct n.case_id)::int from notifications n
               join cases c on c.id = n.case_id where true ${orgFilter}) as "casesWithNotification",
            (select count(*)::int from cases c where c.state <> 'Closed' ${orgFilter}) as "openCases",
            (select count(*)::int from cases c where c.state = 'Pending' ${orgFilter}) as "pendingReview"`,
    params
  );
  const alertWhere = actor.orgId
    ? "where a.case_id in (select id from cases where org_id = $1)"
    : "";
  const alertNums = await query(
    `select (select count(*)::int from alerts a ${alertWhere} ${alertWhere ? "and" : "where"} a.state in ('open','acknowledged')) as "activeAlerts",
            (select count(*)::int from alerts a ${alertWhere} ${alertWhere ? "and" : "where"} a.state = 'snoozed') as "snoozedAlerts"`,
    params
  );
  res.json({ ...numbers.rows[0], ...alertNums.rows[0] });
});
