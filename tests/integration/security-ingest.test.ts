import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, startApp, dbUrl, loginFull, type TestApp } from "./help.ts";

const TOKEN = "lab-collector-4f8c2d7e1a6b";
process.env.INTERNAL_TOKEN = TOKEN;

let app: TestApp;

test.before(async () => {
  resetDb();
  app = await startApp();
});

test.after(async () => {
  await app.close();
});

function post(body: Record<string, unknown>, token?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-internal-token"] = token;
  return fetch(`${app.base}/api/v1/security/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

test("collector token is required and refusals are audited", async () => {
  const res = await post({ source: "suricata", kind: "alert", signature: "ET SCAN" });
  assert.equal(res.status, 401);
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const rows = await conn.query(
    "select count(*)::int as n from audit_events where action = 'security.ingest' and result = 'denied'"
  );
  await conn.end();
  assert.equal(rows.rows[0].n, 1);
});

test("accepted events extend the chain and refresh the heartbeat", async () => {
  const res = await post(
    { source: "suricata", kind: "alert", severity: "low", signature: "ET SCAN Potential SSH Scan", src: "10.0.0.9" },
    TOKEN
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as { ok: boolean; seq: number; alertId: string | null };
  assert.equal(body.ok, true);
  assert.equal(body.seq, 1);
  assert.equal(body.alertId, null);

  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const beat = await conn.query("select source from security_heartbeats where source = 'suricata'");
  await conn.end();
  assert.equal(beat.rows.length, 1);
});

test("a high severity event opens one alert for repeats", async () => {
  const body = {
    source: "wazuh",
    kind: "fim",
    severity: "high",
    signature: "File integrity change in /etc/hosts",
    dst: "host-01",
    observedAt: "2026-10-22T10:00:00.000Z",
  };
  const first = await post(body, TOKEN);
  assert.equal(first.status, 201);
  const firstBody = (await first.json()) as { alertId: string | null };
  assert.ok(firstBody.alertId);
  const second = await post(body, TOKEN);
  assert.equal(second.status, 201);
  const secondBody = (await second.json()) as { alertId: string | null };
  assert.equal(secondBody.alertId, null);
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const alerts = await conn.query("select count(*)::int as n from alerts where rule_id = 'SECURITY-EVENT'");
  await conn.end();
  assert.equal(alerts.rows[0].n, 1);
});

test("an offset timestamp is normalised before it enters the chain", async () => {
  const res = await post(
    {
      source: "suricata",
      kind: "alert",
      severity: "low",
      signature: "LAB controlled waf-test probe",
      observedAt: "2026-10-22T14:06:51.123+0200",
    },
    TOKEN
  );
  assert.equal(res.status, 201);
  const reviewer = await loginFull(app.base, "reviewer1", "demo-reviewer-pass");
  const verify = await fetch(`${app.base}/api/v1/security/verify`, { headers: { cookie: reviewer } });
  const body = (await verify.json()) as { ok: boolean };
  assert.equal(body.ok, true);
});

test("the security state is gated and reports an intact chain", async () => {
  const analyst = await loginFull(app.base, "analyst1", "demo-analyst-pass");
  const refused = await fetch(`${app.base}/api/v1/security/state`, { headers: { cookie: analyst } });
  assert.equal(refused.status, 403);

  const reviewer = await loginFull(app.base, "reviewer1", "demo-reviewer-pass");
  const state = await fetch(`${app.base}/api/v1/security/state`, { headers: { cookie: reviewer } });
  assert.equal(state.status, 200);
  const body = (await state.json()) as {
    events: { total: number; chain: { ok: boolean; checked: number } };
    heartbeats: Array<{ source: string; silent: boolean }>;
    trip: { locked: boolean };
  };
  assert.equal(body.events.total, 4);
  assert.equal(body.events.chain.ok, true);
  assert.equal(body.events.chain.checked, 4);
  assert.equal(body.heartbeats.length, 2);
  assert.equal(body.trip.locked, false);
});

test("a changed row breaks verification", async () => {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  await conn.query("update security_events set signature = 'edited' where seq = 2");
  await conn.end();
  const reviewer = await loginFull(app.base, "reviewer1", "demo-reviewer-pass");
  const res = await fetch(`${app.base}/api/v1/security/verify`, { headers: { cookie: reviewer } });
  const body = (await res.json()) as { ok: boolean; brokenAt?: number };
  assert.equal(body.ok, false);
  assert.equal(body.brokenAt, 2);
});
