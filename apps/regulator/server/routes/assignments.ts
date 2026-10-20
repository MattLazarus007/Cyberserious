import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { recordAuditTx } from "../audit.ts";

export const assignmentsRouter = Router();
assignmentsRouter.use(requireSession);

const assignInput = z.object({
  assignee: z.string().min(1).max(120),
});

assignmentsRouter.post("/cases/:id/assignment", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "assign_case")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = assignInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "assignment needs a username" });
    return;
  }
  const params: unknown[] = [req.params.id];
  let scope = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    scope = "and c.org_id = $2";
  }
  const found = await query(
    `select c.id, c.assigned_to as "assignedTo" from cases c where (c.id::text = $1 or c.reference = $1) ${scope}`,
    params
  );
  if (found.rows.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const person = await query(
    `select u.id, u.username, m.role from users u join memberships m on m.user_id = u.id
      where u.username = $1 and u.enabled and m.role in ('regulator_analyst','regulator_supervisor') limit 1`,
    [parsed.data.assignee]
  );
  if (person.rows.length === 0) {
    res.status(422).json({ error: "cases go to a signed-in analyst or supervisor" });
    return;
  }
  const saved = await withTransaction(async (client) => {
    await client.query("update cases set assigned_to = $1 where id = $2", [person.rows[0].id, found.rows[0].id]);
    await client.query(
      "insert into case_events (case_id, actor_id, event_type, old_value, new_value) values ($1, $2, 'assignment', $3, $4)",
      [found.rows[0].id, actor.userId, found.rows[0].assignedTo, person.rows[0].username]
    );
    await recordAuditTx(client, {
      actor: actor.username,
      action: "case.assign",
      resource: found.rows[0].id,
      result: "ok",
      meta: { to: person.rows[0].username },
    });
    return { assignedTo: person.rows[0].username };
  });
  res.json(saved);
});
