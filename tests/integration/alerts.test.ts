import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, startApp, dbUrl, loginFull } from "./help.ts";
import { runOnce, leaseJobs, finishJob } from "../../apps/regulator/server/worker.ts";

async function openAlerts(base: string, cookie: string): Promise<{ id: string; ruleId: string }[]> {
  const res = await fetch(`${base}/api/v1/alerts`, { headers: { cookie } });
  assert.equal(res.status, 200);
  return ((await res.json()) as { items: { id: string; ruleId: string }[] }).items;
}

test("T-21 the worker opens alerts for new cases and leases jobs once", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const created = await fetch(`${srv.base}/api/v1/imports`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        orgRef: "DEMO-ORG-03",
        category: "unauthorised access",
        narrative: "A server log showed repeated access attempts over the weekend.",
        severity: "critical",
        priority: "immediate",
        affectedCount: 3200,
      }),
    });
    assert.equal(created.status, 201);
    const { caseId } = await created.json();
    const first = await runOnce();
    assert.ok(first.jobs >= 1);
    assert.ok(first.opened >= 2, `expected RULE-01 and RULE-03, got ${first.opened}`);
    const items = await openAlerts(srv.base, cookie);
    const mine = items.filter((a) => ["RULE-01", "RULE-03"].includes(a.ruleId));
    assert.ok(mine.length >= 2);
    void caseId;
  } finally {
    await srv.close();
  }
});

test("T-22 same inputs refresh the alert instead of duplicating it", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const before = await conn.query("select count(*)::int as n from alerts");
    await conn.query(
      "insert into outbox_jobs (job_type, resource_id, dedupe_key) values ('evaluate_case', (select id from cases where reference = 'BR-2026-0001'), 'eval:t22:' || extract(epoch from now()))"
    );
    await conn.end();
    const run = await runOnce();
    assert.equal(run.opened, 0);
    assert.ok(run.jobs >= 1);
    const conn2 = new pg.Client({ connectionString: dbUrl });
    await conn2.connect();
    const after = await conn2.query("select count(*)::int as n from alerts");
    await conn2.end();
    assert.equal(after.rows[0].n, before.rows[0].n);
    void cookie;
  } finally {
    await srv.close();
  }
});

test("T-23 acknowledge, snooze with expiry, resolve with resolution", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const items = await openAlerts(srv.base, cookie);
    const first = items[0].id;
    const ack = await fetch(`${srv.base}/api/v1/alerts/${first}/acknowledge`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(ack.status, 200);
    const snooze = await fetch(`${srv.base}/api/v1/alerts/${first}/snooze`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ until: new Date(Date.now() + 7 * 86400000).toISOString(), reason: "waiting on the IO callback" }),
    });
    assert.equal(snooze.status, 200);
    const noReason = await fetch(`${srv.base}/api/v1/alerts/${items[1].id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ resolution: "" }),
    });
    assert.equal(noReason.status, 400);
    const resolve = await fetch(`${srv.base}/api/v1/alerts/${items[1].id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ resolution: "Scope confirmed, no further attention needed." }),
    });
    assert.equal(resolve.status, 200);
    const remaining = await openAlerts(srv.base, cookie);
    assert.ok(!remaining.some((a) => a.id === items[1].id), "resolved alerts leave the active list");
  } finally {
    await srv.close();
  }
});

test("T-24 unknown dates keep their alert without duplicates", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    await conn.query(
      "insert into outbox_jobs (job_type, resource_id, dedupe_key) values ('evaluate_case', (select id from cases where reference = 'BR-2026-0007'), 'eval:t24:' || extract(epoch from now()))"
    );
    const before = await conn.query("select count(*)::int as n from alerts where case_id = (select id from cases where reference = 'BR-2026-0007')");
    await conn.end();
    await runOnce();
    const conn2 = new pg.Client({ connectionString: dbUrl });
    await conn2.connect();
    const after = await conn2.query("select count(*)::int as n from alerts where case_id = (select id from cases where reference = 'BR-2026-0007')");
    const rules = await conn2.query("select rule_id from alerts where case_id = (select id from cases where reference = 'BR-2026-0007')");
    await conn2.end();
    assert.equal(after.rows[0].n, before.rows[0].n);
    assert.ok(rules.rows.some((r) => r.rule_id === "RULE-04"), "unknown discovery keeps its RULE-04 alert");
    void cookie;
  } finally {
    await srv.close();
  }
});

test("T-25 expired leases recover and snooze expiry reopens", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    await conn.query(
      "insert into outbox_jobs (job_type, resource_id, dedupe_key, state, lease_expires_at) values ('evaluate_case', (select id from cases where reference = 'BR-2026-0002'), 'eval:t25:' || extract(epoch from now()), 'leased', now() - interval '1 hour')"
    );
    await conn.end();
    const leased = await leaseJobs(5);
    assert.ok(leased.length >= 1, "expired leases become work again");
    for (const job of leased) await finishJob(job.id);
    const items = await openAlerts(srv.base, cookie);
    const target = items[0].id;
    const conn2 = new pg.Client({ connectionString: dbUrl });
    await conn2.connect();
    await conn2.query("update alerts set state = 'snoozed', snooze_until = now() - interval '1 hour' where id = $1", [target]);
    await conn2.end();
    await runOnce();
    const again = await openAlerts(srv.base, cookie);
    assert.ok(again.some((a) => a.id === target), "expired snooze returns to open");
  } finally {
    await srv.close();
  }
});
