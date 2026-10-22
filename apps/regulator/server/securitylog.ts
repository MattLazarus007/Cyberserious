import { createHash } from "node:crypto";
import type pg from "pg";
import { query, withTransaction } from "./db.ts";

const CHAIN_LOCK_KEY = 8_127_440_014;
const SILENCE_SECONDS = 15 * 60;

export interface SecurityEvent {
  source: string;
  kind: string;
  severity: "low" | "medium" | "high";
  signature: string;
  src?: string | null;
  dst?: string | null;
  observedAt?: string | null;
  raw?: Record<string, unknown>;
}

function hashOf(
  prev: string | null,
  event: SecurityEvent,
  createdAt: string
): string {
  return createHash("sha256")
    .update(
      [
        prev ?? "",
        event.source,
        event.kind,
        event.severity,
        event.signature,
        event.src ?? "",
        event.dst ?? "",
        event.observedAt ?? "",
        createdAt,
      ].join("\u0000")
    )
    .digest("hex");
}

export async function recordSecurityEventTx(
  client: pg.PoolClient,
  event: SecurityEvent
): Promise<{ seq: number; entryHash: string }> {
  await client.query("select pg_advisory_xact_lock($1)", [CHAIN_LOCK_KEY]);
  const last = await client.query("select entry_hash from security_events order by seq desc limit 1");
  const prev = last.rows.length > 0 ? (last.rows[0].entry_hash as string) : null;
  const inserted = await client.query(
    `insert into security_events
       (source, kind, severity, signature, src, dst, observed_at, raw, prev_hash, entry_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'pending')
     returning seq, created_at`,
    [
      event.source,
      event.kind,
      event.severity,
      event.signature,
      event.src ?? null,
      event.dst ?? null,
      event.observedAt ?? null,
      JSON.stringify(event.raw ?? {}),
      prev,
    ]
  );
  const row = inserted.rows[0];
  const createdAt = new Date(row.created_at).toISOString();
  const entryHash = hashOf(prev, event, createdAt);
  await client.query("update security_events set entry_hash = $1 where seq = $2", [entryHash, row.seq]);
  await client.query(
    `insert into security_heartbeats (source, last_seen_at, detail)
     values ($1, now(), $2::jsonb)
     on conflict (source) do update set last_seen_at = now(), detail = excluded.detail`,
    [event.source, JSON.stringify({ kind: event.kind, signature: event.signature })]
  );
  return { seq: Number(row.seq), entryHash };
}

export async function recordSecurityEvent(
  event: SecurityEvent
): Promise<{ seq: number; entryHash: string }> {
  return withTransaction((client) => recordSecurityEventTx(client, event));
}

export async function verifySecurityChain(): Promise<{
  ok: boolean;
  checked: number;
  brokenAt?: number;
}> {
  const rows = await query(
    "select seq, source, kind, severity, signature, src, dst, observed_at, prev_hash, entry_hash, created_at from security_events order by seq asc"
  );
  let prev: string | null = null;
  for (const row of rows.rows) {
    if ((row.prev_hash ?? null) !== prev) {
      return { ok: false, checked: Number(row.seq), brokenAt: Number(row.seq) };
    }
    const event: SecurityEvent = {
      source: row.source,
      kind: row.kind,
      severity: row.severity,
      signature: row.signature,
      src: row.src,
      dst: row.dst,
      observedAt: row.observed_at ? new Date(row.observed_at).toISOString() : null,
    };
    const digest = hashOf(prev, event, new Date(row.created_at).toISOString());
    if (digest !== row.entry_hash) {
      return { ok: false, checked: Number(row.seq), brokenAt: Number(row.seq) };
    }
    prev = row.entry_hash;
  }
  return { ok: true, checked: rows.rows.length };
}

export async function securitySummary(): Promise<{
  events: number;
  last24h: number;
  high24h: number;
  chain: Awaited<ReturnType<typeof verifySecurityChain>>;
  heartbeats: Array<{ source: string; lastSeenAt: string; ageSeconds: number; silent: boolean }>;
}> {
  const counts = await query(
    `select count(*)::int as events,
            count(*) filter (where created_at > now() - interval '24 hours')::int as "last24h",
            count(*) filter (where created_at > now() - interval '24 hours' and severity = 'high')::int as "high24h"
       from security_events`
  );
  const beats = await query(
    `select source, last_seen_at as "lastSeenAt",
            extract(epoch from (now() - last_seen_at))::int as "ageSeconds"
       from security_heartbeats order by source`
  );
  return {
    events: counts.rows[0].events as number,
    last24h: counts.rows[0].last24h as number,
    high24h: counts.rows[0].high24h as number,
    chain: await verifySecurityChain(),
    heartbeats: beats.rows.map((row) => ({
      source: row.source as string,
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
      ageSeconds: row.ageSeconds as number,
      silent: (row.ageSeconds as number) > SILENCE_SECONDS,
    })),
  };
}
