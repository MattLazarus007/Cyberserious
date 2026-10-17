import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, startApp, dbUrl, loginPassword, loginFull, fixOtp, takeCookie } from "./help.ts";

test("password then code signs the analyst in", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.username, "analyst1");
    assert.equal(body.role, "regulator_analyst");
    assert.equal(body.mfaOk, true);
  } finally {
    await srv.close();
  }
});

test("wrong password stays anonymous with no hint", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/api/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "analyst1", password: "not-the-secret" }),
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "invalid credentials" });
  } finally {
    await srv.close();
  }
});

test("three wrong codes kill the session", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginPassword(srv.base, "analyst1", "demo-analyst-pass");
    await fixOtp(cookie, "123456");
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${srv.base}/api/v1/login/otp`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ code: "000000" }),
      });
      assert.equal(res.status, 401);
    }
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } });
    assert.equal(me.status, 401);
  } finally {
    await srv.close();
  }
});

test("an expired code is refused", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginPassword(srv.base, "analyst1", "demo-analyst-pass");
    await fixOtp(cookie, "123456", -10);
    const res = await fetch(`${srv.base}/api/v1/login/otp`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ code: "123456" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await srv.close();
  }
});

test("logout ends the session", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const out = await fetch(`${srv.base}/api/v1/logout`, { method: "POST", headers: { cookie } });
    assert.equal(out.status, 200);
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } });
    assert.equal(me.status, 401);
  } finally {
    await srv.close();
  }
});

test("idle sessions lapse after fifteen minutes", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    await conn.query("update sessions set last_seen_at = now() - interval '16 minutes' where id = $1", [
      cookie.split("=")[1],
    ]);
    await conn.end();
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } });
    assert.equal(me.status, 401);
  } finally {
    await srv.close();
  }
});

test("a forged cookie gets nothing", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie: "cs_sid=forged" } });
    assert.equal(me.status, 401);
    void takeCookie;
  } finally {
    await srv.close();
  }
});

test("group passphrase signs straight in when open", async () => {
  resetDb();
  process.env.GROUP_LOGIN = "1";
  process.env.GROUP_PASSPHRASE = "test-group-secret";
  delete process.env.OIDC_ISSUER;
  const srv = await startApp();
  try {
    const mode = await (await fetch(`${srv.base}/api/v1/auth-mode`)).json() as { groupOpen: boolean, oidcEnabled: boolean };
    assert.equal(mode.groupOpen, true);
    assert.equal(mode.oidcEnabled, false, "the identity provider stays off unless the switch is set");
    const res = await fetch(`${srv.base}/api/v1/login/group`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "test-group-secret" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, username: "group" });
    const cookie = takeCookie(res);
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.username, "group");
  } finally {
    delete process.env.GROUP_LOGIN;
    delete process.env.GROUP_PASSPHRASE;
    await srv.close();
  }
});

test("wrong group passphrase is refused like a wrong password", async () => {
  resetDb();
  process.env.GROUP_LOGIN = "1";
  process.env.GROUP_PASSPHRASE = "test-group-secret";
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/api/v1/login/group`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "nope-wrong" }),
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "invalid credentials" });
  } finally {
    delete process.env.GROUP_LOGIN;
    delete process.env.GROUP_PASSPHRASE;
    await srv.close();
  }
});

test("closed group gate is not found", async () => {
  resetDb();
  delete process.env.GROUP_LOGIN;
  delete process.env.GROUP_PASSPHRASE;
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/api/v1/login/group`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "test-group-secret" }),
    });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not found" });
  } finally {
    delete process.env.GROUP_LOGIN;
    delete process.env.GROUP_PASSPHRASE;
    await srv.close();
  }
});

test("group sign-in success and failure write audit rows", async () => {
  resetDb();
  process.env.GROUP_LOGIN = "1";
  process.env.GROUP_PASSPHRASE = "test-group-secret";
  const srv = await startApp();
  const conn = new pg.Client({ connectionString: dbUrl });
  try {
    await conn.connect();
    const before = await conn.query(
      "select count(*)::int as n from audit_events where action like 'auth.group%'"
    );
    const okRes = await fetch(`${srv.base}/api/v1/login/group`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "test-group-secret" }),
    });
    assert.equal(okRes.status, 200);
    const afterOk = await conn.query(
      "select count(*)::int as n from audit_events where action like 'auth.group%'"
    );
    assert.equal(afterOk.rows[0].n, before.rows[0].n + 1);
    const badRes = await fetch(`${srv.base}/api/v1/login/group`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "nope-wrong" }),
    });
    assert.equal(badRes.status, 401);
    const afterBad = await conn.query(
      "select count(*)::int as n from audit_events where action like 'auth.group%'"
    );
    assert.equal(afterBad.rows[0].n, afterOk.rows[0].n + 1);
  } finally {
    await conn.end().catch(() => {});
    delete process.env.GROUP_LOGIN;
    delete process.env.GROUP_PASSPHRASE;
    await srv.close();
  }
});

test("sixth group failure in fifteen minutes is rate limited", async () => {
  resetDb();
  process.env.GROUP_LOGIN = "1";
  process.env.GROUP_PASSPHRASE = "test-group-secret";
  const srv = await startApp();
  try {
    const clear = await fetch(`${srv.base}/api/v1/login/group`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "test-group-secret" }),
    });
    assert.equal(clear.status, 200);
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${srv.base}/api/v1/login/group`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase: "nope-wrong" }),
      });
      assert.equal(res.status, 401);
    }
    const limited = await fetch(`${srv.base}/api/v1/login/group`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: "nope-wrong" }),
    });
    assert.equal(limited.status, 429);
  } finally {
    delete process.env.GROUP_LOGIN;
    delete process.env.GROUP_PASSPHRASE;
    await srv.close();
  }
});
