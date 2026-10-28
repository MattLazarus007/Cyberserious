import test from "node:test";
import assert from "node:assert/strict";
import { resetDb, startApp, loginFull } from "./help.ts";
import { EXPORT_BYTE_LIMIT, EXPORT_ROW_LIMIT, piiCounts, recentExports, recordExport, withinExportCap } from "../../apps/regulator/server/dlp.ts";

test.before(() => {
  resetDb();
});

test("a case export writes a manifest with counts and no values", async () => {
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/export`, {
      headers: { cookie, "x-export-destination": "test harness" },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { manifest: { rows: number; bytes: number; pii: Record<string, number> } };
    assert.equal(body.manifest.rows, 1);
    assert.ok(body.manifest.bytes > 0);
    assert.deepEqual(Object.keys(body.manifest.pii).sort(), ["email", "idNumber", "phone"]);
    const items = await recentExports();
    assert.equal(items.length, 1);
    assert.equal(items[0].destination, "test harness");
    assert.equal(items[0].actor, "analyst1");
    assert.ok(!JSON.stringify(items[0]).includes("@"), "matched values stay out of the manifest");
  } finally {
    await srv.close();
  }
});

test("the row cap refuses a bulk export", async () => {
  assert.equal(withinExportCap(EXPORT_ROW_LIMIT), true);
  assert.equal(withinExportCap(EXPORT_ROW_LIMIT + 1), false);
  await assert.rejects(
    recordExport({ actor: "x", kind: "bulk", resource: "all", body: {}, rows: EXPORT_ROW_LIMIT + 1 }),
    (err: Error & { status?: number }) => err.status === 413
  );
});

test("the size cap refuses a large body", async () => {
  const big = "x".repeat(EXPORT_BYTE_LIMIT + 1);
  await assert.rejects(
    recordExport({ actor: "x", kind: "bulk", resource: "all", body: { big } }),
    (err: Error & { status?: number }) => err.status === 413
  );
});

test("PII counting keeps counts only", () => {
  const counts = piiCounts({ mail: "a@example.com", phone: "+27 82 123 4567", id: "9001015009087" });
  assert.equal(counts.email, 1);
  assert.equal(counts.phone, 1);
  assert.equal(counts.idNumber, 1);
});
