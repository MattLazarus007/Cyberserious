import { createHash } from "node:crypto";
import pg from "pg";

export function versionHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export async function appendVersion(
  client: pg.PoolClient,
  notificationId: string,
  body: unknown
): Promise<{ revision: number; hash: string }> {
  const prior = await client.query(
    "select max(revision)::int as top from notification_versions where notification_id = $1",
    [notificationId]
  );
  const revision = (prior.rows[0].top ?? 0) + 1;
  const hash = versionHash(body);
  await client.query(
    `insert into notification_versions (notification_id, revision, payload, payload_hash, predecessor_revision)
     values ($1, $2, $3::jsonb, $4, $5)`,
    [notificationId, revision, JSON.stringify(body), hash, revision > 1 ? revision - 1 : null]
  );
  return { revision, hash };
}

export async function enqueueEvaluation(client: pg.PoolClient, caseId: string): Promise<void> {
  const stamp = Date.now();
  await client.query(
    `insert into outbox_jobs (job_type, resource_id, dedupe_key)
     values ('evaluate_case', $1, $2)
     on conflict (dedupe_key) do update set state = 'pending', next_attempt_at = now()`,
    [caseId, `eval:${caseId}:${stamp}`]
  );
}
