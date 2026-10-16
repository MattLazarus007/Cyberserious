import { Router } from "express";
import { query } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";

export const alertsRouter = Router();
alertsRouter.use(requireSession);

// Read-only list for Phase 3. Actions land in Phase 6.
alertsRouter.get("/alerts", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "read_cases")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const params: unknown[] = [];
  let scope = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    scope = "where a.case_id in (select id from cases where org_id = $1)";
  }
  const rows = await query(
    `select a.id, a.case_id as "caseId", c.reference as "caseRef",
            a.rule_id as "ruleId", a.rule_version as "ruleVersion",
            a.priority, a.reason, a.state, a.owner_id as "ownerId",
            a.snooze_until as "snoozeUntil", a.first_seen_at as "firstSeenAt",
            a.last_seen_at as "lastSeenAt"
       from alerts a left join cases c on c.id = a.case_id
       ${scope}
       order by a.first_seen_at desc, a.id desc`,
    params
  );
  res.json({ items: rows.rows });
});
