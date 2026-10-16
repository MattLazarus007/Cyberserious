import pg from "pg";
import { query, withTransaction } from "./db.ts";
import { evaluateAll, type RuleInput } from "./rules/index.ts";
import { recordAuditTx } from "./audit.ts";

const BATCH = 10;

export interface Lease {
  id: number;
  jobType: string;
  resourceId: string;
  attempts: number;
}

export async function leaseJobs(limit = BATCH): Promise<Lease[]> {
  const rows = await query(
    `update outbox_jobs set state = 'leased', lease_expires_at = now() + interval '5 minutes', attempts = attempts + 1
      where id in (
        select id from outbox_jobs
         where state = 'pending'
            or (state = 'leased' and lease_expires_at < now())
            or (state = 'failed' and next_attempt_at < now())
         order by next_attempt_at asc, id asc
         limit $1
         for update skip locked
      )
      returning id, job_type as "jobType", resource_id as "resourceId", attempts`,
    [limit]
  );
  return rows.rows as Lease[];
}

export async function finishJob(id: number, err?: Error): Promise<void> {
  if (!err) {
    await query("update outbox_jobs set state = 'done' where id = $1", [id]);
    return;
  }
  const rows = await query("select attempts from outbox_jobs where id = $1", [id]);
  const attempts = rows.rows[0]?.attempts ?? 1;
  const waitSecs = Math.min(3600, attempts * attempts * 30);
  const jitter = Math.floor(Math.random() * 30);
  await query(
    "update outbox_jobs set state = 'failed', last_error = $2, next_attempt_at = now() + ($3 || ' seconds')::interval where id = $1",
    [id, err.message.slice(0, 500), String(waitSecs + jitter)]
  );
}

async function loadRuleInput(client: pg.PoolClient, caseId: string): Promise<RuleInput | null> {
  const rows = await client.query(
    `select c.id, c.reference, c.state, c.severity,
            f.affected_count as "affectedCount", f.count_precision as "countPrecision",
            f.discovered_at as "discoveredAt", f.discovered_precision as "discoveredPrecision",
            f.narrative,
            (select min(first_received_at) from notifications n where n.case_id = c.id) as "firstReceivedAt"
       from cases c left join case_facts f on f.case_id = c.id
      where c.id = $1`,
    [caseId]
  );
  if (rows.rows.length === 0) return null;
  const row = rows.rows[0];
  return {
    caseId: row.id,
    reference: row.reference,
    state: row.state,
    severity: row.severity,
    affectedCount: row.affectedCount,
    countPrecision: row.countPrecision ?? "unknown",
    discoveredAt: row.discoveredAt ? new Date(row.discoveredAt).toISOString() : null,
    discoveredPrecision: row.discoveredPrecision ?? "unknown",
    firstReceivedAt: row.firstReceivedAt ? new Date(row.firstReceivedAt).toISOString() : null,
    narrative: row.narrative,
  };
}

export async function evaluateCase(caseId: string): Promise<{ opened: number; refreshed: number }> {
  return withTransaction(async (client) => {
    const input = await loadRuleInput(client, caseId);
    if (!input) return { opened: 0, refreshed: 0 };
    let opened = 0;
    let refreshed = 0;
    for (const hit of evaluateAll(input)) {
      const done = await client.query(
        `insert into alerts (case_id, rule_id, rule_version, dedupe_key, priority, reason, input_hash, state)
         values ($1, $2, $3, $4, $5, $6, $7, 'open')
         on conflict (dedupe_key) do nothing returning id`,
        [caseId, hit.ruleId, hit.version, hit.dedupeKey, hit.priority, hit.reason, hit.inputHash]
      );
      if (done.rows.length > 0) {
        opened += 1;
      } else {
        await client.query(
          "update alerts set last_seen_at = now(), input_hash = $1 where dedupe_key = $2",
          [hit.inputHash, hit.dedupeKey]
        );
        refreshed += 1;
      }
    }
    if (opened > 0 || refreshed > 0) {
      await recordAuditTx(client, {
        actor: "worker",
        action: "rules.evaluate",
        resource: caseId,
        result: "ok",
        meta: { opened, refreshed },
      });
    }
    return { opened, refreshed };
  });
}

export async function sweepSnoozes(): Promise<number> {
  const rows = await query(
    "update alerts set state = 'open', snooze_until = null where state = 'snoozed' and snooze_until < now() returning id"
  );
  return rows.rows.length;
}

export async function runOnce(): Promise<{ jobs: number; opened: number; reopened: number }> {
  const jobs = await leaseJobs();
  let opened = 0;
  for (const job of jobs) {
    try {
      if (job.jobType === "evaluate_case") {
        const done = await evaluateCase(job.resourceId);
        opened += done.opened;
      }
      await finishJob(job.id);
    } catch (err) {
      await finishJob(job.id, err as Error);
    }
  }
  const reopened = await sweepSnoozes();
  return { jobs: jobs.length, opened, reopened };
}

const direct = process.argv[1] === new URL(import.meta.url).pathname;
if (direct) {
  const pause = Number(process.env.WORKER_PAUSE_MS ?? 15000);
  for (;;) {
    try {
      const done = await runOnce();
      if (done.jobs > 0 || done.reopened > 0) {
        console.log(`worker: ${done.jobs} jobs, ${done.opened} alerts opened, ${done.reopened} snoozes reopened`);
      }
    } catch (err) {
      console.error("worker loop failed", (err as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, pause));
  }
}
