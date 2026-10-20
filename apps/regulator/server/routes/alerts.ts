import { Router } from "express";
import { query } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { recordAudit } from "../audit.ts";

export const alertsRouter = Router();
alertsRouter.use(requireSession);

alertsRouter.get("/alerts", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "read_cases")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const params: unknown[] = [];
  const conds = ["a.state in ('open','acknowledged','snoozed')"];
  if (actor.orgId) {
    params.push(actor.orgId);
    conds.push("a.case_id in (select id from cases where org_id = $1)");
  }
  const scope = `where ${conds.join(" and ")}`;
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

alertsRouter.post("/alerts/:id/acknowledge", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "update_alert")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const done = await query(
    "update alerts set state = 'acknowledged', owner_id = $2 where id = $1 and state = 'open' returning id",
    [req.params.id, actor.userId]
  );
  if (done.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await recordAudit({ actor: actor.username, action: "alert.acknowledge", resource: req.params.id, result: "ok" });
  res.json({ ok: true });
});

alertsRouter.post("/alerts/:id/snooze", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "update_alert")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const { until, reason } = req.body ?? {};
  if (typeof until !== "string" || isNaN(new Date(until).getTime()) || new Date(until).getTime() <= Date.now()) {
    res.status(400).json({ error: "snooze needs a future date" });
    return;
  }
  if (typeof reason !== "string" || reason.trim().length === 0 || reason.length > 500) {
    res.status(400).json({ error: "snooze needs a short reason" });
    return;
  }
  const done = await query(
    "update alerts set state = 'snoozed', snooze_until = $2, resolution = $3 where id = $1 and state in ('open','acknowledged') returning id",
    [req.params.id, until, reason.trim()]
  );
  if (done.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await recordAudit({ actor: actor.username, action: "alert.snooze", resource: req.params.id, result: "ok", meta: { until } });
  res.json({ ok: true });
});

alertsRouter.post("/alerts/:id/resolve", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "update_alert")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const { resolution } = req.body ?? {};
  if (typeof resolution !== "string" || resolution.trim().length === 0 || resolution.length > 2000) {
    res.status(400).json({ error: "resolving an alert needs a recorded resolution" });
    return;
  }
  const done = await query(
    "update alerts set state = 'resolved', resolution = $2 where id = $1 and state <> 'resolved' returning id",
    [req.params.id, resolution.trim()]
  );
  if (done.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await recordAudit({ actor: actor.username, action: "alert.resolve", resource: req.params.id, result: "ok" });
  res.json({ ok: true });
});
