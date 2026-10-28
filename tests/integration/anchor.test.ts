import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, dbUrl } from "./help.ts";
import { recordAudit } from "../../apps/regulator/server/audit.ts";
import { recordSecurityEvent } from "../../apps/regulator/server/securitylog.ts";
import { anchorIfDue, verifyAnchors, writeAnchor } from "../../apps/regulator/server/anchor.ts";

const KEY = "test-anchor-key-32-bytes-minimum000";

test.before(() => {
  resetDb();
});

test("an anchor signs the heads and verifies", async () => {
  await recordAudit({ actor: "tester", action: "case.read", resource: "x", result: "ok" });
  await recordSecurityEvent({ source: "app", kind: "test", severity: "low", signature: "anchor test" });
  const row = await writeAnchor(KEY, "2026-10-22");
  assert.equal(row.auditCount, 1);
  assert.equal(row.securityCount, 1);
  assert.equal(row.hmac.length, 64);
  const result = await verifyAnchors(KEY);
  assert.deepEqual(result, { ok: true, checked: 1 });
});

test("a second write for the same day keeps the first anchor", async () => {
  const first = await writeAnchor(KEY, "2026-10-22");
  const second = await writeAnchor(KEY, "2026-10-22");
  assert.equal(second.hmac, first.hmac);
});

test("a changed anchor row fails verification", async () => {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  await conn.query("update anchors set audit_count = audit_count + 1 where day = '2026-10-22'");
  await conn.end();
  const result = await verifyAnchors(KEY);
  assert.equal(result.ok, false);
  assert.equal(result.brokenDay, "2026-10-22");
});

test("removing an anchored event fails verification", async () => {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const before = await conn.query("select security_seq::int as seq from anchors where day = '2026-10-22'");
  const seq = before.rows[0].seq as number;
  await conn.query("delete from security_events where seq = $1", [seq]);
  await conn.end();
  const result = await verifyAnchors(KEY);
  assert.equal(result.ok, false);
  assert.equal(result.brokenDay, "2026-10-22");
});

test("the daily helper writes once and then stays put", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const conn0 = new pg.Client({ connectionString: dbUrl });
  await conn0.connect();
  await conn0.query("delete from anchors where day = $1", [today]);
  await conn0.end();
  const first = await anchorIfDue(KEY);
  assert.equal(first, true);
  const second = await anchorIfDue(KEY);
  assert.equal(second, false);
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const rows = await conn.query("select count(*)::int as n from anchors where day = $1", [today]);
  await conn.end();
  assert.equal(rows.rows[0].n, 1);
});
