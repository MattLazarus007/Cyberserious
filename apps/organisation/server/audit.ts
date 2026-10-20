import type pg from "pg";

export interface OrgAuditEntry {
  actor: string;
  action: string;
  resource?: string;
  result?: "ok" | "denied" | "error";
  meta?: unknown;
}

export async function recordOrgAuditTx(client: pg.PoolClient, entry: OrgAuditEntry): Promise<void> {
  await client.query(
    `insert into org_audit_events (actor, action, resource, result, meta)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [entry.actor, entry.action, entry.resource ?? null, entry.result ?? "ok", JSON.stringify(entry.meta ?? {})]
  );
}
