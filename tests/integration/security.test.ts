import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import pg from "pg";
import { resetDb, startApp, dbUrl } from "./help.ts";

// Same file the server side uses, resolved from the repo root the way
// npm test runs it. Duplicated here so these tests do not import the
// guard module and share its in-memory state.
const TRIP_FLAG = join(process.cwd(), "data", "trip.lock");

mkdirSync(dirname(TRIP_FLAG), { recursive: true });

function clearTripFlag(): void {
  rmSync(TRIP_FLAG, { force: true });
}

test.after(() => clearTripFlag());

async function freePort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>((resolve) => srv.listen(0, resolve));
  const addr = srv.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  await new Promise((resolve) => srv.close(resolve));
  return port;
}

async function withConn<T>(work: (conn: pg.Client) => Promise<T>): Promise<T> {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  try {
    return await work(conn);
  } finally {
    await conn.end().catch(() => {});
  }
}

async function addSession(sid: string): Promise<void> {
  await withConn((conn) =>
    conn.query("insert into sessions (id, user_id) select $1, id from users where username = 'analyst1'", [sid])
  );
}

async function countSessions(): Promise<number> {
  return withConn(async (conn) => {
    const rows = await conn.query("select count(*)::int as n from sessions");
    return rows.rows[0].n as number;
  });
}

async function bootChild(env: Record<string, string>): Promise<{ base: string; close: () => void }> {
  const port = await freePort();
  const child = spawn("node", ["apps/regulator/server/index.ts"], {
    env: { ...process.env, ...env, DATABASE_URL: dbUrl, PORT: String(port) },
    stdio: "pipe",
  });
  const base = `http://localhost:${port}`;
  return {
    base,
    close: () => {
      child.kill();
    },
  };
}

async function waitUp(base: string, path: string): Promise<Response> {
  for (let i = 0; i < 50; i++) {
    try {
      return await fetch(`${base}${path}`);
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`server at ${base} never came up`);
}

test("four unauthenticated requests under the threshold do not trip", async () => {
  clearTripFlag();
  process.env.TRIP_THRESHOLD = "5";
  resetDb();
  const srv = await startApp();
  try {
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${srv.base}/api/v1/me`);
      assert.equal(res.status, 401);
    }
    const ready = await fetch(`${srv.base}/health/ready`);
    assert.equal(ready.status, 200);
    const body = (await ready.json()) as { locked?: boolean };
    assert.equal(body.locked, undefined);
    assert.equal(existsSync(TRIP_FLAG), false);
  } finally {
    delete process.env.TRIP_THRESHOLD;
    await srv.close();
  }
});

test("an unauthenticated burst past the threshold trips the service", async () => {
  clearTripFlag();
  process.env.TRIP_THRESHOLD = "5";
  resetDb();
  const srv = await startApp();
  try {
    await addSession("session-to-be-revoked");
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${srv.base}/api/v1/me`);
      statuses.push(res.status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 401, 503], "the fifth request crosses the line");
    const after = await fetch(`${srv.base}/api/v1/me`);
    assert.equal(after.status, 503);
    assert.equal(await after.text(), "service locked");
    const ready = await (await fetch(`${srv.base}/health/ready`)).json();
    assert.deepEqual(ready, { ok: true, locked: true });
    assert.equal(await countSessions(), 0, "every session row is revoked");
    assert.equal(existsSync(TRIP_FLAG), true, "the flag file is written");
    await withConn(async (conn) => {
      const audits = await conn.query("select actor, result from audit_events where action = 'security.trip'");
      assert.equal(audits.rows.length, 1);
      assert.ok(audits.rows[0].actor.length > 0);
      assert.equal(audits.rows[0].result, "denied");
      const alerts = await conn.query(
        "select priority, state, reason from alerts where rule_id = 'SECURITY-TRIP'"
      );
      assert.equal(alerts.rows.length, 1);
      assert.equal(alerts.rows[0].priority, "high");
      assert.equal(alerts.rows[0].state, "open");
      assert.match(alerts.rows[0].reason, /unauthenticated request burst from .+ tripped the service/);
    });
  } finally {
    delete process.env.TRIP_THRESHOLD;
    clearTripFlag();
    await srv.close();
  }
});

test("a valid session is refused while the service is tripped", async () => {
  // the shared app from the previous test is still tripped in memory
  const srv = await startApp();
  try {
    await addSession("stolen-but-valid-sid");
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie: "cs_sid=stolen-but-valid-sid" } });
    assert.equal(me.status, 503);
    assert.equal(await me.text(), "service locked");
    const login = await fetch(`${srv.base}/api/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "analyst1", password: "demo-analyst-pass" }),
    });
    assert.equal(login.status, 503, "no sign-in while tripped");
    const live = await fetch(`${srv.base}/health/live`);
    assert.equal(live.status, 503);
  } finally {
    await srv.close();
  }
});

test("a fresh boot with the flag file stays tripped", async () => {
  clearTripFlag();
  resetDb();
  writeFileSync(TRIP_FLAG, "left by an earlier trip\n");
  const srv = await bootChild({});
  try {
    const ready = await waitUp(srv.base, "/health/ready");
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { ok: true, locked: true });
    const me = await fetch(`${srv.base}/api/v1/me`);
    assert.equal(me.status, 503);
    assert.equal(existsSync(TRIP_FLAG), true);
  } finally {
    srv.close();
    clearTripFlag();
  }
});

test("boot with TRIP_OPEN=1 clears the flag and serves", async () => {
  clearTripFlag();
  resetDb();
  writeFileSync(TRIP_FLAG, "stale lock from an earlier trip\n");
  const srv = await bootChild({ TRIP_OPEN: "1" });
  try {
    const live = await waitUp(srv.base, "/health/live");
    assert.equal(live.status, 200);
    assert.equal(existsSync(TRIP_FLAG), false, "the operator flag is consumed");
    const me = await fetch(`${srv.base}/api/v1/me`);
    assert.equal(me.status, 401, "normal service, unauthenticated probing only");
  } finally {
    srv.close();
    clearTripFlag();
  }
});
