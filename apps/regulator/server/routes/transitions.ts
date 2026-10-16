import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { recordAuditTx } from "../audit.ts";

export const transitionsRouter = Router();
transitionsRouter.use(requireSession);

const NEXT: Record<string, string[]> = {
  Pending: ["UnderReview"],
  UnderReview: ["AwaitingInformation", "Closed", "Pending"],
  AwaitingInformation: ["UnderReview", "Closed"],
  Closed: ["UnderReview"],
};

export function allowedTransition(from: string, to: string): boolean {
  return (NEXT[from] ?? []).includes(to);
}

const transitionInput = z.object({
  toState: z.enum(["Pending", "UnderReview", "AwaitingInformation", "Closed"]),
  rowVersion: z.number().int().min(1),
  reason: z.string().max(2000).optional(),
});

transitionsRouter.get("/cases/:id/events", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "read_case")) {
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
    `select e.id, e.event_type as "eventType", e.old_value as "oldValue",
            e.new_value as "newValue", e.reason, e.created_at as "createdAt",
            u.display_name as "actor"
       from case_events e
       join cases c on c.id = e.case_id
       left join users u on u.id = e.actor_id
      where (c.id::text = $1 or c.reference = $1) ${scope}
      order by e.id asc`,
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

transitionsRouter.post("/cases/:id/transitions", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "transition_case")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = transitionInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "transition needs a state and the version read" });
    return;
  }
  const params: unknown[] = [req.params.id];
  let scope = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    scope = "and org_id = $2";
  }
  const found = await query(`select id, state, row_version as "rowVersion" from cases where (id::text = $1 or reference = $1) ${scope}`, params);
  if (found.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const theCase = found.rows[0];
  if (theCase.rowVersion !== parsed.data.rowVersion) {
    res.status(409).json({
      error: "someone else moved this case first",
      provided: parsed.data.rowVersion,
      current: theCase.rowVersion,
    });
    return;
  }
  if (!allowedTransition(theCase.state, parsed.data.toState)) {
    res.status(422).json({ error: `a case cannot move from ${theCase.state} to ${parsed.data.toState}` });
    return;
  }
  if (parsed.data.toState === "Closed" && !parsed.data.reason?.trim()) {
    res.status(422).json({ error: "closing a case needs a recorded reason" });
    return;
  }
  const updated = await withTransaction(async (client) => {
    const row = await client.query(
      `update cases set state = $1, row_version = row_version + 1,
              closed_at = case when $1 = 'Closed' then now() else null end,
              closure_reason = case when $1 = 'Closed' then $2 else null end
         where id = $3 and row_version = $4
         returning id, state, row_version as "rowVersion"`,
      [parsed.data.toState, parsed.data.reason?.trim() || null, theCase.id, parsed.data.rowVersion]
    );
    if (row.rows.length === 0) {
      return null;
    }
    await client.query(
      "insert into case_events (case_id, actor_id, event_type, old_value, new_value, reason) values ($1, $2, 'state', $3, $4, $5)",
      [theCase.id, actor.userId, theCase.state, parsed.data.toState, parsed.data.reason?.trim() || null]
    );
    await recordAuditTx(client, {
      actor: actor.username,
      action: "case.transition",
      resource: theCase.id,
      result: "ok",
      meta: { from: theCase.state, to: parsed.data.toState },
    });
    return row.rows[0];
  });
  if (!updated) {
    const fresh = await query("select row_version as \"rowVersion\" from cases where id = $1", [theCase.id]);
    res.status(409).json({ error: "someone else moved this case first", provided: parsed.data.rowVersion, current: fresh.rows[0].rowVersion });
    return;
  }
  res.json(updated);
});
