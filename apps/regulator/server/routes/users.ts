import { Router } from "express";
import { z } from "zod";
import { query } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { hashPassword } from "../passwords.ts";
import { recordAudit } from "../audit.ts";

export const usersRouter = Router();
usersRouter.use(requireSession);

const createInput = z.object({
  username: z.string().min(3).max(60),
  displayName: z.string().min(1).max(120),
  email: z.string().email().max(160).optional(),
  phone: z.string().max(40).optional(),
  password: z.string().min(8).max(200),
  role: z.enum([
    "data_steward", "security_officer", "information_officer",
    "regulator_analyst", "regulator_supervisor",
    "system_administrator", "audit_reviewer",
  ]),
  orgRef: z.string().max(40).optional(),
});

usersRouter.get("/users", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "manage_users")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const rows = await query(
    `select u.username, u.display_name as "displayName", u.email, u.phone,
            u.enabled, m.role, o.reference as "orgRef"
       from users u left join memberships m on m.user_id = u.id
       left join organisations o on o.id = m.org_id
       order by u.username asc`
  );
  res.json({ items: rows.rows });
});

usersRouter.post("/users", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "manage_users")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = createInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "a user needs a username, a name, a password and a role" });
    return;
  }
  const taken = await query("select id from users where username = $1", [parsed.data.username]);
  if (taken.rows.length > 0) {
    res.status(409).json({ error: "that username is taken" });
    return;
  }
  let orgId: string | null = null;
  if (parsed.data.orgRef) {
    const org = await query("select id from organisations where reference = $1", [parsed.data.orgRef]);
    if (org.rows.length === 0) {
      res.status(422).json({ error: "unknown organisation reference" });
      return;
    }
    orgId = org.rows[0].id;
  }
  const stored = await hashPassword(parsed.data.password);
  const user = await query(
    "insert into users (username, display_name, password_hash, email, phone) values ($1, $2, $3, $4, $5) returning username",
    [parsed.data.username, parsed.data.displayName, stored, parsed.data.email ?? null, parsed.data.phone ?? null]
  );
  const person = await query("select id from users where username = $1", [parsed.data.username]);
  await query("insert into memberships (user_id, org_id, role) values ($1, $2, $3)", [
    person.rows[0].id,
    orgId,
    parsed.data.role,
  ]);
  await recordAudit({ actor: actor.username, action: "user.create", resource: parsed.data.username, result: "ok" });
  res.status(201).json({ username: user.rows[0].username });
});
