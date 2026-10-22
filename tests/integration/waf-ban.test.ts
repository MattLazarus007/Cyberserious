import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, startApp, dbUrl, loginFull, type TestApp } from "./help.ts";
import { loginRate } from "../../apps/regulator/server/routes/auth.ts";
import { banIp, resetBanCache, unbanIp } from "../../apps/regulator/server/ban.ts";

let app: TestApp;

test.before(async () => {
  resetDb();
  resetBanCache();
  loginRate.resetWindows();
  app = await startApp();
});

test.after(async () => {
  await app.close();
});

test("the login path throttles one address across usernames", async () => {
  let last = 0;
  for (let i = 0; i < 11; i += 1) {
    const res = await fetch(`${app.base}/api/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: `nobody${i}`, password: "wrong" }),
    });
    last = res.status;
  }
  assert.equal(last, 429);
  loginRate.resetWindows();
});

test("the waf refuses traversal and script probes and records them", async () => {
  const probe = await fetch(`${app.base}/api/v1/cases?q=%3Cscript%3Ealert(1)%3C/script%3E`);
  assert.equal(probe.status, 403);
  const body = (await probe.json()) as { error: string };
  assert.equal(body.error, "request blocked");
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const audit = await conn.query("select count(*)::int as n from audit_events where action = 'waf.block'");
  const events = await conn.query("select count(*)::int as n from security_events where kind = 'waf'");
  await conn.end();
  assert.equal(audit.rows[0].n, 1);
  assert.equal(events.rows[0].n, 1);
});

test("an operator can ban, see and unban an address", async () => {
  const reviewer = await loginFull(app.base, "reviewer1", "demo-reviewer-pass");
  const created = await fetch(`${app.base}/api/v1/security/bans`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: reviewer },
    body: JSON.stringify({ ip: "203.0.113.9", reason: "repeated login failures", minutes: 15 }),
  });
  assert.equal(created.status, 201);
  const state = await fetch(`${app.base}/api/v1/security/state`, { headers: { cookie: reviewer } });
  const summary = (await state.json()) as { bannedIps: Array<{ ip: string }> };
  assert.equal(summary.bannedIps.length, 1);
  assert.equal(summary.bannedIps[0].ip, "203.0.113.9");
  const removed = await fetch(`${app.base}/api/v1/security/bans/203.0.113.9`, {
    method: "DELETE",
    headers: { cookie: reviewer },
  });
  assert.equal(removed.status, 200);
});

test("a banned address is refused before authentication", async () => {
  await banIp("::1", "test lock", "reviewer1", 5);
  const res = await fetch(`${app.base}/api/v1/me`);
  assert.equal(res.status, 403);
  await unbanIp("::1");
});

test("only audit and security roles manage bans", async () => {
  const analyst = await loginFull(app.base, "analyst1", "demo-analyst-pass");
  const res = await fetch(`${app.base}/api/v1/security/bans`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: analyst },
    body: JSON.stringify({ ip: "203.0.113.10", reason: "nope" }),
  });
  assert.equal(res.status, 403);
});
