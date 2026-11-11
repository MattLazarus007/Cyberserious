import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { resetDb, startApp, dbUrl, type TestApp } from "./help.ts";
import { recordAudit } from "../../apps/regulator/server/audit.ts";
import { recordSecurityEvent } from "../../apps/regulator/server/securitylog.ts";
import { runCorrelation, BACKUP_MAX_AGE_SECONDS } from "../../apps/regulator/server/correlation.ts";

let app: TestApp;

test.before(async () => {
  resetDb();
  app = await startApp();
});

test.after(async () => {
  delete process.env.BACKUP_ROOT;
  await app.close();
});

async function alerts(rule: string): Promise<number> {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const rows = await conn.query("select count(*)::int as n from alerts where rule_id = $1", [rule]);
  await conn.end();
  return rows.rows[0].n as number;
}

test("five failed sign-ins from one address raise AUTH-BURST once", async () => {
  for (let i = 0; i < 5; i += 1) {
    await recordSecurityEvent({
      source: "app",
      kind: "auth.failed",
      severity: "medium",
      signature: "bad credentials",
      src: "203.0.113.9",
    });
  }
  const first = await runCorrelation();
  assert.ok(first.rules.includes("AUTH-BURST"));
  const again = await runCorrelation();
  assert.equal(again.rules.includes("AUTH-BURST"), false);
  assert.equal(await alerts("AUTH-BURST"), 1);
});

test("repeated refused actions and exports raise their own rules", async () => {
  for (let i = 0; i < 5; i += 1) {
    await recordAudit({ actor: "analyst1", action: "case.read", resource: "x", result: "denied" });
    await recordAudit({ actor: "analyst1", action: "case.export", resource: "x", result: "ok" });
  }
  await runCorrelation();
  assert.equal(await alerts("RBAC-PROBE"), 1);
  assert.equal(await alerts("EXTRACT-BURST"), 1);
});

test("a stale heartbeat raises SENSOR-SILENT", async () => {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  await conn.query(
    "insert into security_heartbeats (source, last_seen_at) values ('osquery', now() - interval '20 minutes') on conflict (source) do update set last_seen_at = excluded.last_seen_at"
  );
  await conn.end();
  const result = await runCorrelation();
  assert.ok(result.rules.includes("SENSOR-SILENT"));
  assert.equal(await alerts("SENSOR-SILENT"), 1);
  const later = await runCorrelation(new Date(Date.now() + 11 * 60 * 1000));
  assert.equal(later.rules.includes("SENSOR-SILENT"), false, "a silent sensor keeps one alert");
  assert.equal(await alerts("SENSOR-SILENT"), 1);
});

test("an old sealed backup raises BACKUP-MISS", async () => {
  const root = mkdtempSync(join(tmpdir(), "correlation-backup-"));
  const file = join(root, "old.tar.gz.age");
  writeFileSync(file, "ciphertext");
  const old = new Date(Date.now() - (BACKUP_MAX_AGE_SECONDS + 3600) * 1000);
  utimesSync(file, old, old);
  process.env.BACKUP_ROOT = root;
  const result = await runCorrelation();
  assert.ok(result.rules.includes("BACKUP-MISS"));
  assert.equal(await alerts("BACKUP-MISS"), 1);
});

test("a tampered audit row raises CHAIN-BREAK", async () => {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  await conn.query("update audit_events set entry_hash = 'tampered' where seq = (select min(seq) from audit_events)");
  await conn.end();
  const result = await runCorrelation();
  assert.ok(result.rules.includes("CHAIN-BREAK"));
  assert.equal(await alerts("CHAIN-BREAK"), 1);
});
