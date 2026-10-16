import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, startApp, dbUrl, loginFull } from "./help.ts";

test("T-27 capture records provenance and versions stay immutable", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/imports`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        orgRef: "DEMO-ORG-01",
        category: "unauthorised access",
        narrative: "A reader reported a misdirected statement run.",
        severity: "medium",
        priority: "routine",
        externalRef: "ORG-MAIL-118",
        affectedCount: 12,
      }),
    });
    assert.equal(res.status, 201);
    const saved = await res.json();
    assert.equal(saved.revision, 1);
    assert.ok(saved.reference.startsWith("BR-2026-"));

    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const before = await conn.query(
      "select payload_hash from notification_versions where notification_id = $1",
      [saved.notificationId]
    );
    await conn.end();

    const supp = await fetch(`${srv.base}/api/v1/notifications/${saved.notificationId}/supplements`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ affectedCount: 18 }),
    });
    assert.equal(supp.status, 201);
    assert.equal((await supp.json()).revision, 2);

    const conn2 = new pg.Client({ connectionString: dbUrl });
    await conn2.connect();
    const after = await conn2.query(
      "select revision, payload_hash, predecessor_revision from notification_versions where notification_id = $1 order by revision asc",
      [saved.notificationId]
    );
    await conn2.end();
    assert.equal(after.rows.length, 2);
    assert.equal(after.rows[0].payload_hash, before.rows[0].payload_hash);
    assert.equal(after.rows[1].revision, 2);
    assert.equal(after.rows[1].predecessor_revision, 1);

    const versions = await fetch(`${srv.base}/api/v1/notifications/${saved.notificationId}/versions`, {
      headers: { cookie },
    });
    assert.equal(versions.status, 200);
    assert.equal(((await versions.json()) as { items: unknown[] }).items.length, 2);
  } finally {
    await srv.close();
  }
});

test("capture rejects unknown organisations and short narratives", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const org = await fetch(`${srv.base}/api/v1/imports`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ orgRef: "NOPE-99", category: "x", narrative: "long enough to pass validation here" }),
    });
    assert.equal(org.status, 422);
    const short = await fetch(`${srv.base}/api/v1/imports`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ orgRef: "DEMO-ORG-01", category: "x", narrative: "" }),
    });
    assert.equal(short.status, 400);
  } finally {
    await srv.close();
  }
});
