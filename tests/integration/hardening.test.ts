import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, startApp, dbUrl, loginFull } from "./help.ts";

test("T-11 a disabled account signs in nowhere", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    await conn.query("update users set enabled = false where username = 'analyst1'");
    await conn.end();
    const res = await fetch(`${srv.base}/api/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "analyst1", password: "demo-analyst-pass" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await srv.close();
  }
});

test("T-13 hostile strings round-trip as inert text", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const marker = "<img src=x onerror=alert(1)> steady";
    const saved = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ body: marker }),
    });
    assert.equal(saved.status, 201);
    const list = (await (
      await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/notes`, { headers: { cookie } })
    ).json()) as { items: { body: string }[] };
    assert.ok(list.items.some((n) => n.body === marker), "stored verbatim, rendered as text");
    const exported = (await (
      await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/export`, { headers: { cookie } })
    ).json()) as Record<string, unknown>;
    assert.ok(!JSON.stringify(exported).includes("<img"), "exports carry no note markup");
  } finally {
    await srv.close();
  }
});

test("T-14 injection and mass assignment go nowhere", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const injected = await fetch(`${srv.base}/api/v1/cases?q='; DROP TABLE cases;--&pageSize=50`, {
      headers: { cookie },
    });
    assert.equal(injected.status, 200);
    const tables = await (async () => {
      const conn = new pg.Client({ connectionString: dbUrl });
      await conn.connect();
      const rows = await conn.query("select count(*)::int as n from cases");
      await conn.end();
      return rows.rows[0].n;
    })();
    assert.equal(tables, 7);
    const smuggled = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ body: "plain note", author_id: "someone-else", role: "system_administrator" }),
    });
    assert.equal(smuggled.status, 201);
    const stored = (await smuggled.json()) as { author: string };
    assert.equal(stored.author, "Regulator Analyst");
  } finally {
    await srv.close();
  }
});

test("T-26 regulator receipt and subject notice stay separate", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/obligations`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const duties = ((await res.json()) as { items: { code: string; status: string }[] }).items;
    const byCode = Object.fromEntries(duties.map((d) => [d.code, d.status]));
    assert.equal(byCode["S22-01"], "attended");
    assert.equal(byCode["S22-02"], "pending");
  } finally {
    await srv.close();
  }
});

test("T-30 nothing mutates while the audit trail is down", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    await conn.query("alter table audit_events rename to audit_events_broken");
    await conn.end();
    try {
      const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/notes`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ body: "this must not land" }),
      });
      assert.equal(res.status, 500);
      const conn2 = new pg.Client({ connectionString: dbUrl });
      await conn2.connect();
      const notes = await conn2.query("select count(*)::int as n from case_notes");
      await conn2.end();
      assert.equal(notes.rows[0].n, 0);
    } finally {
      const conn3 = new pg.Client({ connectionString: dbUrl });
      await conn3.connect();
      await conn3.query("alter table audit_events_broken rename to audit_events");
      await conn3.end();
    }
  } finally {
    await srv.close();
  }
});

test("T-31 tampering with the chain is reported at the altered row", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ body: "chain me" }),
    });
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    await conn.query("update audit_events set action = 'note.forged' where seq = (select max(seq) from audit_events)");
    await conn.end();
    const reviewer = await loginFull(srv.base, "reviewer1", "demo-reviewer-pass");
    const verdict = await fetch(`${srv.base}/api/v1/audit/verify`, { headers: { cookie: reviewer } });
    assert.equal(verdict.status, 200);
    const body = (await verdict.json()) as { ok: boolean; brokenAt: number };
    assert.equal(body.ok, false);
    assert.ok(body.brokenAt > 0);
  } finally {
    await srv.close();
  }
});
