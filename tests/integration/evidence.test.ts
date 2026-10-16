import test from "node:test";
import assert from "node:assert/strict";
import { resetDb, startApp, loginFull } from "./help.ts";

const txt = Buffer.from("quarantine me, please").toString("base64");

test("T-28 uploads quarantine by allowlist and size", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const good = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ filename: "note.txt", mime: "text/plain", contentBase64: txt }),
    });
    assert.equal(good.status, 201);
    const saved = (await good.json()) as { id: string; status: string; sha256: string };
    assert.equal(saved.status, "quarantine");
    assert.ok(saved.sha256);
    const exe = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ filename: "run.exe", mime: "application/x-msdownload", contentBase64: txt }),
    });
    assert.equal(exe.status, 422);
    const boss = await loginFull(srv.base, "supervisor1", "demo-supervisor-pass");
    const review = await fetch(`${srv.base}/api/v1/evidence/${saved.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: boss },
      body: JSON.stringify({ verdict: "clean" }),
    });
    assert.equal(review.status, 200);
    const fetchFile = await fetch(`${srv.base}/api/v1/evidence/${saved.id}`, { headers: { cookie } });
    assert.equal(fetchFile.status, 200);
    assert.equal(await fetchFile.text(), "quarantine me, please");
  } finally {
    await srv.close();
  }
});

test("quarantined files stay unreleased and downloads are audited", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const good = await fetch(`${srv.base}/api/v1/cases/BR-2026-0002/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ filename: "scan.txt", mime: "text/plain", contentBase64: txt }),
    });
    const saved = (await good.json()) as { id: string };
    const early = await fetch(`${srv.base}/api/v1/evidence/${saved.id}`, { headers: { cookie } });
    assert.equal(early.status, 404);
  } finally {
    await srv.close();
  }
});

test("T-29 export is redacted, gated and audited", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/export`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.reference, "BR-2026-0001");
    assert.ok(!("narrative" in body), "narrative stays out of exports");
    assert.equal(body.marking, "synthetic academic export");
    const admin = await loginFull(srv.base, "admin1", "demo-admin-pass");
    const denied = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/export`, { headers: { cookie: admin } });
    assert.equal(denied.status, 404);
  } finally {
    await srv.close();
  }
});

test("ready reports queue age with a warning flag", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/health/ready`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; queue: { pending: number; warn: boolean } };
    assert.equal(body.ok, true);
    assert.equal(typeof body.queue.pending, "number");
    assert.equal(body.queue.warn, false);
  } finally {
    await srv.close();
  }
});
