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

test("T-26 triage clock opens RULE-06 only for unnotified overdue cases", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const org = await conn.query("select id from organisations where reference = 'DEMO-ORG-01'");
    const orgId = org.rows[0].id as string;
    async function makeCase(ref: string, triagedHoursAgo: number, withNote: boolean): Promise<string> {
      const kase = await conn.query(
        "insert into cases (reference, org_id, state, severity, priority) values ($1, $2, 'UnderReview', 'medium', 'routine') returning id",
        [ref, orgId]
      );
      const caseId = kase.rows[0].id as string;
      await conn.query(
        `insert into case_facts (case_id, incident_occurred_at, occurred_precision,
           discovered_at, discovered_precision, discovery_source, triaged_at,
           breach_status, category, affected_count, count_precision, narrative)
         values ($1, now() - interval '10 days', 'date', now() - interval '9 days', 'date',
           'organisation report', now() - ($2 || ' hours')::interval,
           'reported', 'unauthorised access', 10, 'exact', $3)`,
        [caseId, String(triagedHoursAgo), `Synthetic clock fixture for ${ref}.`]
      );
      if (withNote) {
        const note = await conn.query(
          "insert into notifications (case_id, sender_org_id, channel, first_received_at) values ($1, $2, 'manual_import', now() - interval '1 hour') returning id",
          [caseId, orgId]
        );
        await conn.query(
          "insert into notification_versions (notification_id, revision, payload, payload_hash, received_at) values ($1, 1, $2::jsonb, 't26hash', now() - interval '1 hour')",
          [note.rows[0].id, JSON.stringify({ reference: ref })]
        );
      }
      await conn.query(
        "insert into outbox_jobs (job_type, resource_id, dedupe_key) values ('evaluate_case', $1, $2)",
        [caseId, `eval:t26:${ref}:` + Date.now()]
      );
      return caseId;
    }
    const overdue = await makeCase("BR-2026-0901", 80, false);
    const nudge = await makeCase("BR-2026-0902", 50, false);
    const told = await makeCase("BR-2026-0903", 80, true);
    await conn.end();
    await runOnce();
    const conn2 = new pg.Client({ connectionString: dbUrl });
    await conn2.connect();
    async function alertsFor(caseId: string): Promise<{ rule_id: string; priority: string; reason: string }[]> {
      const rows = await conn2.query("select rule_id, priority, reason from alerts where case_id = $1", [caseId]);
      return rows.rows as { rule_id: string; priority: string; reason: string }[];
    }
    const over = await alertsFor(overdue);
    const overSix = over.filter((a) => a.rule_id === "RULE-06");
    assert.equal(overSix.length, 1);
    assert.equal(overSix[0].priority, "high");
    assert.match(overSix[0].reason, /internal timer/);
    const mid = await alertsFor(nudge);
    const midSix = mid.filter((a) => a.rule_id === "RULE-06");
    assert.equal(midSix.length, 1);
    assert.equal(midSix[0].priority, "medium");
    assert.match(midSix[0].reason, /48 hours/);
    assert.match(midSix[0].reason, /Information Officer/);
    assert.match(midSix[0].reason, /internal timer/);
    const done = await alertsFor(told);
    assert.ok(!done.some((a) => a.rule_id === "RULE-06"), "notified cases stay quiet on RULE-06");
    await conn2.end();
    void cookie;
  } finally {
    await srv.close();
  }
});
