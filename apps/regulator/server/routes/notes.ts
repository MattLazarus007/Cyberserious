import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { recordAuditTx } from "../audit.ts";

export const notesRouter = Router();
notesRouter.use(requireSession);

const noteInput = z.object({
  body: z.string().min(1).max(4000),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

async function visibleCase(actor: Actor, id: string): Promise<{ id: string } | null> {
  const params: unknown[] = [id];
  let scope = "";
  if (actor.orgId) {
    params.push(actor.orgId);
    scope = "and org_id = $2";
  }
  const rows = await query(
    `select id from cases where (id::text = $1 or reference = $1) ${scope}`,
    params
  );
  return rows.rows[0] ?? null;
}

notesRouter.get("/cases/:id/notes", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "read_case")) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const found = await visibleCase(actor, req.params.id);
  if (!found) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const rows = await query(
    `select n.id, n.body, n.created_at as "createdAt", u.display_name as "author"
       from case_notes n join users u on u.id = n.author_id
      where n.case_id = $1 order by n.created_at asc, n.id asc`,
    [found.id]
  );
  res.json({ items: rows.rows });
});

notesRouter.post("/cases/:id/notes", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "write_note")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const parsed = noteInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "note needs a body of 1 to 4000 characters" });
    return;
  }
  const found = await visibleCase(actor, req.params.id);
  if (!found) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const key = parsed.data.idempotencyKey;
  if (key) {
    const prior = await query("select note_id from note_idempotency where key = $1", [key]);
    if (prior.rows.length > 0) {
      const note = await query(
        `select n.id, n.body, n.created_at as "createdAt", u.display_name as "author"
           from case_notes n join users u on u.id = n.author_id where n.id = $1`,
        [prior.rows[0].note_id]
      );
      res.json({ ...note.rows[0], duplicate: true });
      return;
    }
  }
  const saved = await withTransaction(async (client) => {
    const note = await client.query(
      "insert into case_notes (case_id, author_id, body) values ($1, $2, $3) returning id, body, created_at as \"createdAt\"",
      [found.id, actor.userId, parsed.data.body]
    );
    if (key) {
      await client.query("insert into note_idempotency (key, note_id) values ($1, $2)", [key, note.rows[0].id]);
    }
    await recordAuditTx(client, {
      actor: actor.username,
      action: "note.write",
      resource: found.id,
      result: "ok",
      meta: { noteId: note.rows[0].id },
    });
    return note.rows[0];
  });
  res.status(201).json({ ...saved, author: actor.displayName });
});
