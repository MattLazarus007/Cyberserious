import { createHash } from "node:crypto";
import pg from "pg";
import { query, withTransaction } from "./db.ts";

export interface AuditEntry {
  actor: string;
  action: string;
  resource?: string;
  result: "ok" | "denied" | "error";
  correlationId?: string;
  meta?: unknown;
}

function hashOf(prev: string | null, actor: string, action: string, resource: string, result: string, at: string): string {
  return createHash("sha256")
    .update([prev ?? "genesis", actor, action, resource, result, at].join("|"))
    .digest("hex");
}

export async function recordAudit(entry: AuditEntry): Promise<number> {
  return withTransaction(async (client) => {
    const last = await client.query("select entry_hash from audit_events order by seq desc limit 1");
    const prev = last.rows.length > 0 ? last.rows[0].entry_hash : null;
    const resource = entry.resource ?? "";
    const inserted = await client.query(
      `insert into audit_events (actor, action, resource, result, correlation_id, meta, prev_hash, entry_hash)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending') returning seq, created_at`,
      [entry.actor, entry.action, resource, entry.result, entry.correlationId ?? null, JSON.stringify(entry.meta ?? {}), prev]
    );
    const row = inserted.rows[0];
    const at = new Date(row.created_at).toISOString();
    const digest = hashOf(prev, entry.actor, entry.action, resource, entry.result, at);
    await client.query("update audit_events set entry_hash = $1 where seq = $2", [digest, row.seq]);
    return row.seq;
  });
}

export async function recordAuditTx(client: pg.PoolClient, entry: AuditEntry): Promise<number> {
  const last = await client.query("select entry_hash from audit_events order by seq desc limit 1");
  const prev = last.rows.length > 0 ? last.rows[0].entry_hash : null;
  const resource = entry.resource ?? "";
  const inserted = await client.query(
    `insert into audit_events (actor, action, resource, result, correlation_id, meta, prev_hash, entry_hash)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, 'pending') returning seq, created_at`,
    [entry.actor, entry.action, resource, entry.result, entry.correlationId ?? null, JSON.stringify(entry.meta ?? {}), prev]
  );
  const row = inserted.rows[0];
  const digest = hashOf(prev, entry.actor, entry.action, resource, entry.result, new Date(row.created_at).toISOString());
  await client.query("update audit_events set entry_hash = $1 where seq = $2", [digest, row.seq]);
  return row.seq;
}

export async function verifyChain(): Promise<{ ok: boolean; checked: number; brokenAt?: number }> {
  const rows = await query("select seq, actor, action, resource, result, prev_hash, entry_hash, created_at from audit_events order by seq asc");
  let prev: string | null = null;
  for (const row of rows.rows) {
    if ((row.prev_hash ?? null) !== prev) return { ok: false, checked: row.seq, brokenAt: row.seq };
    const digest = hashOf(prev, row.actor, row.action, row.resource ?? "", row.result, new Date(row.created_at).toISOString());
    if (digest !== row.entry_hash) return { ok: false, checked: row.seq, brokenAt: row.seq };
    prev = row.entry_hash;
  }
  return { ok: true, checked: rows.rows.length };
}
