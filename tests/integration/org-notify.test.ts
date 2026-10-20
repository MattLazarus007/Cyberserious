import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import * as jose from "jose";
import pg from "pg";
import { resetDb, dbUrl } from "./help.ts";
import { resetOrgDb, startOrgApp, orgLogin, orgDbUrl } from "./orghelp.ts";

const REG_PORT = 8198;

async function startRegulator(): Promise<ChildProcess> {
  const child = spawn("node", ["apps/regulator/server/index.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PORT: String(REG_PORT),
    },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${REG_PORT}/health/live`);
      if (res.ok) return child;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  child.kill();
  throw new Error("regulator child never came up");
}

interface Draft {
  publicId: string;
  revision: number;
  status: string;
}

async function approvedDraft(
  base: string,
  steward: string,
  io: string,
  affectedCount: number,
  narrative = "A shared drive link went further than intended."
): Promise<Draft> {
  const created = await fetch(`${base}/api/v1/drafts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: steward },
    body: JSON.stringify({ category: "data exposure", narrative, affectedCount }),
  });
  assert.equal(created.status, 201);
  const draft = (await created.json()) as Draft;
  const submitted = await fetch(`${base}/api/v1/drafts/${draft.publicId}/submit`, {
    method: "POST",
    headers: { cookie: steward },
  });
  assert.equal(submitted.status, 200);
  const approved = await fetch(`${base}/api/v1/drafts/${draft.publicId}/approve`, {
    method: "POST",
    headers: { cookie: io },
  });
  assert.equal(approved.status, 200);
  return draft;
}

async function prepare(): Promise<void> {
  resetDb();
  resetOrgDb();
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const org = await conn.query("select id from organisations where reference = 'DEMO-ORG-01'");
  await conn.query(
    "insert into sender_keys (sender_id, org_id, public_jwk, active) values ('org-karoo-01', $1, $2::jsonb, true) on conflict (sender_id) do update set public_jwk = excluded.public_jwk",
    [org.rows[0].id, JSON.stringify(await jose.exportJWK(publicKey))]
  );
  await conn.end();
  writeFileSync("/tmp/org-notify-key.json", JSON.stringify(await jose.exportJWK(privateKey)));
  process.env.ORG_SENDER_KEY = "/tmp/org-notify-key.json";
  process.env.ORG_SENDER_ID = "org-karoo-01";
  process.env.REGULATOR_AFFECTED_URL = `http://localhost:${REG_PORT}/api/v1/intake/affected-notices`;
}

test("T-68 notify records a run, delivery counts and audit rows", async () => {
  await prepare();
  const child = await startRegulator();
  const srv = await startOrgApp();
  try {
    const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
    const io = await orgLogin(srv.base, "io1", "demo-io-pass");
    const draft = await approvedDraft(srv.base, steward, io, 25);
    const res = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({ channel: "email" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      runs: { channel: string; affectedTotal: number; sentCount: number; failedCount: number; status: string }[];
      warning?: string;
    };
    assert.equal(body.runs.length, 1);
    const run = body.runs[0];
    assert.equal(run.channel, "email");
    assert.equal(run.affectedTotal, 25);
    assert.equal(run.sentCount, 24);
    assert.equal(run.failedCount, 1);
    assert.equal(run.status, "complete");
    assert.equal(body.warning, undefined);

    const list = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notifications`, {
      headers: { cookie: steward },
    });
    assert.equal(list.status, 200);
    const listed = (await list.json()) as { items: { sentCount: number; failedCount: number }[] };
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].sentCount, 24);

    const org = new pg.Client({ connectionString: orgDbUrl });
    await org.connect();
    const audits = await org.query(
      "select action from org_audit_events where resource = $1 order by seq asc",
      [draft.publicId]
    );
    const actions = audits.rows.map((r) => r.action);
    assert.ok(actions.includes("draft.notify.start"));
    assert.ok(actions.includes("draft.notify.complete"));
    const deliveries = await org.query(
      "select status, count(*)::int as n from notification_deliveries group by status order by status"
    );
    const counts = Object.fromEntries(deliveries.rows.map((r) => [r.status, r.n]));
    assert.equal(counts.sent, 24);
    assert.equal(counts.failed, 1);
    await org.end();

    const reg = new pg.Client({ connectionString: dbUrl });
    await reg.connect();
    const noticed = await reg.query(
      "select affected_total as total, sent, failed, channel from affected_notices where draft_public_id = $1",
      [draft.publicId]
    );
    assert.equal(noticed.rows.length, 1);
    assert.equal(noticed.rows[0].total, 25);
    assert.equal(noticed.rows[0].sent, 24);
    assert.equal(noticed.rows[0].failed, 1);
    const alerts = await reg.query(
      "select rule_id, priority, reason from alerts where rule_id = 'AFFECTED-NOTICE-SHORTFALL'"
    );
    assert.equal(alerts.rows.length, 1);
    assert.equal(alerts.rows[0].priority, "medium");
    assert.match(alerts.rows[0].reason, /24 of 25/);
    await reg.end();
  } finally {
    await srv.close();
    child.kill();
  }
});

test("T-69 notify keeps the org record when the regulator is offline", async () => {
  resetOrgDb();
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
  void publicKey;
  writeFileSync("/tmp/org-notify-key-offline.json", JSON.stringify(await jose.exportJWK(privateKey)));
  process.env.ORG_SENDER_KEY = "/tmp/org-notify-key-offline.json";
  process.env.ORG_SENDER_ID = "org-karoo-01";
  process.env.REGULATOR_AFFECTED_URL = "http://localhost:1/api/v1/intake/affected-notices";
  const srv = await startOrgApp();
  try {
    const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
    const io = await orgLogin(srv.base, "io1", "demo-io-pass");
    const draft = await approvedDraft(srv.base, steward, io, 12);
    const res = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({ channel: "sms" }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      runs: { sentCount: number; status: string }[];
      warning?: string;
    };
    assert.equal(body.runs[0].status, "complete");
    assert.equal(body.runs[0].sentCount, 12);
    assert.ok(body.warning, "a failed regulator report is a warning, not a false success");
    const list = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notifications`, {
      headers: { cookie: steward },
    });
    const listed = (await list.json()) as { items: { regulatorStatus: string }[] };
    assert.equal(listed.items[0].regulatorStatus, "failed");
  } finally {
    await srv.close();
  }
});

test("T-70 notify stays scoped and gated", async () => {
  await prepare();
  const child = await startRegulator();
  const srv = await startOrgApp();
  try {
    const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
    const io = await orgLogin(srv.base, "io1", "demo-io-pass");

    const zero = await approvedDraft(srv.base, steward, io, 0, "Nothing reached this draft yet.");
    const zeroRes = await fetch(`${srv.base}/api/v1/drafts/${zero.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({ channel: "email" }),
    });
    assert.equal(zeroRes.status, 400);

    const normal = await approvedDraft(srv.base, steward, io, 12);
    const denied = await fetch(`${srv.base}/api/v1/drafts/${normal.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: steward },
      body: JSON.stringify({ channel: "email" }),
    });
    assert.equal(denied.status, 403);

    const org = new pg.Client({ connectionString: orgDbUrl });
    await org.connect();
    await org.query(
      `insert into organisations (reference, display_name, sector)
       values ('DEMO-ORG-02', 'Vaal Logistics', 'logistics') on conflict (reference) do nothing`
    );
    await org.query(
      `insert into drafts (public_id, org_ref, category, narrative, status, affected_count)
       values ('SUB-2026-9201', 'DEMO-ORG-02', 'data exposure', 'foreign draft', 'Approved', 5)
       on conflict (public_id) do nothing`
    );
    await org.end();
    const foreign = await fetch(`${srv.base}/api/v1/drafts/SUB-2026-9201/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({ channel: "email" }),
    });
    assert.equal(foreign.status, 404);
    const foreignList = await fetch(`${srv.base}/api/v1/drafts/SUB-2026-9201/notifications`, {
      headers: { cookie: io },
    });
    assert.equal(foreignList.status, 404);

    const conn = new pg.Client({ connectionString: orgDbUrl });
    await conn.connect();
    const own = await conn.query(
      `select d.id, o.id as org_id from drafts d
         join organisations o on o.reference = d.org_ref
        where d.public_id = $1`,
      [normal.publicId]
    );
    await conn.query(
      `insert into notification_runs (org_id, draft_id, affected_total, channel, template_text, status, actor)
       values ($1, $2, 12, 'email', 'held run', 'sending', 'io1')`,
      [own.rows[0].org_id, own.rows[0].id]
    );
    await conn.end();
    const busy = await fetch(`${srv.base}/api/v1/drafts/${normal.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({ channel: "email" }),
    });
    assert.equal(busy.status, 409);
  } finally {
    await srv.close();
    child.kill();
  }
});

test("T-75 a draft claiming more people than the register holds is refused", async () => {
  await prepare();
  const child = await startRegulator();
  const srv = await startOrgApp();
  try {
    const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
    const io = await orgLogin(srv.base, "io1", "demo-io-pass");
    const draft = await approvedDraft(srv.base, steward, io, 30, "A list wider than the register covers.");
    const res = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({ channel: "email" }),
    });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /25 of 30/);
    const conn = new pg.Client({ connectionString: orgDbUrl });
    await conn.connect();
    const runs = await conn.query("select count(*)::int as n from notification_runs");
    const deliveries = await conn.query("select count(*)::int as n from notification_deliveries");
    await conn.end();
    assert.equal(runs.rows[0].n, 0);
    assert.equal(deliveries.rows[0].n, 0);
  } finally {
    await srv.close();
    child.kill();
  }
});
