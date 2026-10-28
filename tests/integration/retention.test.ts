import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, dbUrl } from "./help.ts";
import { sweepRetention } from "../../apps/regulator/server/retention.ts";
import { closePool } from "../../apps/regulator/server/db.ts";

test.before(() => {
  resetDb();
});

test("the sweep removes expired sessions, old resolved alerts and dead jobs only", async () => {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const user = await conn.query("select id from users where username = 'analyst1'");
  const userId = user.rows[0].id as string;
  await conn.query(
    "insert into sessions (id, user_id, mfa_ok, created_at, last_seen_at) values ('old', $1, true, now() - interval '2 days', now() - interval '2 days'), ('fresh', $1, true, now(), now())",
    [userId]
  );
  await conn.query(
    "insert into alerts (rule_id, rule_version, dedupe_key, priority, reason, input_hash, state, last_seen_at) values ('OLD', 1, 'old-alert', 'low', 'old', 'x', 'resolved', now() - interval '200 days'), ('NEW', 1, 'new-alert', 'low', 'new', 'x', 'resolved', now())"
  );
  await conn.query(
    "insert into outbox_jobs (job_type, resource_id, dedupe_key, state, attempts, next_attempt_at) values ('x', 'x', 'old-job', 'dead', 8, now() - interval '40 days'), ('x', 'x', 'new-job', 'dead', 8, now())"
  );
  const caseBefore = await conn.query("select count(*)::int as n from cases");
  const auditBefore = await conn.query("select count(*)::int as n from audit_events");
  await conn.end();

  const result = await sweepRetention();
  assert.equal(result.sessions, 1);
  assert.equal(result.alerts, 1);
  assert.equal(result.jobs, 1);

  const check = new pg.Client({ connectionString: dbUrl });
  await check.connect();
  const ids = await check.query("select id from sessions order by id");
  const alertKeys = await check.query("select dedupe_key from alerts where rule_id in ('OLD','NEW') order by dedupe_key");
  const jobs = await check.query("select dedupe_key from outbox_jobs order by dedupe_key");
  const caseAfter = await check.query("select count(*)::int as n from cases");
  const auditAfter = await check.query("select count(*)::int as n from audit_events");
  await check.end();
  assert.deepEqual(ids.rows.map((r) => r.id), ["fresh"]);
  assert.deepEqual(alertKeys.rows.map((r) => r.dedupe_key), ["new-alert"]);
  assert.deepEqual(jobs.rows.map((r) => r.dedupe_key), ["new-job"]);
  assert.equal(caseAfter.rows[0].n, caseBefore.rows[0].n);
  assert.equal(auditAfter.rows[0].n, auditBefore.rows[0].n);
});

test("an exhausted job becomes dead and raises a dead letter alert", async () => {
  const { finishJob } = await import("../../apps/regulator/server/worker.ts");
  const { runCorrelation } = await import("../../apps/regulator/server/correlation.ts");
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const job = await conn.query(
    "insert into outbox_jobs (job_type, resource_id, dedupe_key, state, attempts) values ('x', 'x', 'dead-job', 'leased', 8) returning id"
  );
  await conn.end();
  await finishJob(job.rows[0].id as number, new Error("always fails"));
  const check = new pg.Client({ connectionString: dbUrl });
  await check.connect();
  const state = await check.query("select state from outbox_jobs where id = $1", [job.rows[0].id]);
  await check.end();
  assert.equal(state.rows[0].state, "dead");
  await runCorrelation();
  const after = new pg.Client({ connectionString: dbUrl });
  await after.connect();
  const alert = await after.query(
    "select count(*)::int as n from alerts where rule_id = 'DEAD-LETTER' and reason like $1",
    [`%job ${job.rows[0].id} %`]
  );
  await after.end();
  assert.equal(alert.rows[0].n, 1);
});

test.after(async () => {
  await closePool();
});
