import test from "node:test";
import assert from "node:assert/strict";
import { resetDb, startApp, loginFull } from "./help.ts";

test("5b.3 research seed holds four cases and thirteen sources", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/research`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      cases: { reference: string }[];
      sources: { title: string; outlet: string }[];
      findings: { csf: string }[];
      policy: { version: number } | null;
    };
    assert.equal(body.cases.length, 4);
    assert.ok(body.sources.length >= 13, `expected 13+ sources, got ${body.sources.length}`);
    const outlets = new Set(body.sources.map((s) => s.outlet));
    for (const want of ["News24", "IOL", "ITWeb", "Daily Maverick", "NIST"]) {
      assert.ok(outlets.has(want), `expected outlet ${want} in ${[...outlets].join(", ")}`);
    }
    assert.ok(body.findings.length >= 4);
    assert.equal(body.policy?.version, 1);
    const funcs = new Set(body.findings.map((f) => f.csf));
    assert.ok(funcs.size >= 3, "findings span several CSF functions");
  } finally {
    await srv.close();
  }
});

test("5b.4 obligations list and per-case duties with permissions", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const all = await fetch(`${srv.base}/api/v1/obligations`, { headers: { cookie } });
    assert.equal(all.status, 200);
    const duties = ((await all.json()) as { items: { code: string }[] }).items;
    assert.deepEqual(duties.map((d) => d.code), ["S22-01", "S22-02", "S22-03", "S22-04"]);
    const linked = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/obligations`, { headers: { cookie } });
    assert.equal(linked.status, 200);
    assert.equal(((await linked.json()) as { items: unknown[] }).items.length, 4);
    const admin = await loginFull(srv.base, "admin1", "demo-admin-pass");
    const denied = await fetch(`${srv.base}/api/v1/research`, { headers: { cookie: admin } });
    assert.equal(denied.status, 404);
    const anon = await fetch(`${srv.base}/api/v1/obligations`);
    assert.equal(anon.status, 401);
  } finally {
    await srv.close();
  }
});
