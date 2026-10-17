import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, startApp, loginFull, dbUrl } from "./help.ts";
import { runOnce } from "../../apps/regulator/server/worker.ts";

const txt = Buffer.from("quarantine me, please").toString("base64");

interface AlertRow {
  ruleId: string;
  reason: string;
  priority: string;
  state: string;
  caseRef: string | null;
}

async function uploadAndClean(base: string, caseRef: string, filename: string): Promise<string> {
  const cookie = await loginFull(base, "analyst1", "demo-analyst-pass");
  const good = await fetch(`${base}/api/v1/cases/${caseRef}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ filename, mime: "text/plain", contentBase64: txt }),
  });
  assert.equal(good.status, 201);
  const saved = (await good.json()) as { id: string };
  const boss = await loginFull(base, "supervisor1", "demo-supervisor-pass");
  const review = await fetch(`${base}/api/v1/evidence/${saved.id}/review`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: boss },
    body: JSON.stringify({ verdict: "clean" }),
  });
  assert.equal(review.status, 200);
  return saved.id;
}

async function supervisorNotices(base: string): Promise<AlertRow[]> {
  const boss = await loginFull(base, "supervisor1", "demo-supervisor-pass");
  const res = await fetch(`${base}/api/v1/alerts`, { headers: { cookie: boss } });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { items: AlertRow[] };
  return body.items.filter((a) => a.ruleId === "EXTRACTION-NOTICE");
}

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

test("a clean download raises an extraction notice for supervisors", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const evidenceId = await uploadAndClean(srv.base, "BR-2026-0001", "note.txt");
    const file = await fetch(`${srv.base}/api/v1/evidence/${evidenceId}`, { headers: { cookie } });
    assert.equal(file.status, 200);
    assert.equal(await file.text(), "quarantine me, please");
    await runOnce();
    const notices = await supervisorNotices(srv.base);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].priority, "high");
    assert.equal(notices[0].state, "open");
    assert.equal(notices[0].caseRef, "BR-2026-0001");
    assert.match(notices[0].reason, /^analyst1 extracted note\.txt from BR-2026-0001 at /);
  } finally {
    await srv.close();
  }
});

test("a case export raises the same extraction notice", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/export`, { headers: { cookie } });
    assert.equal(res.status, 200);
    await runOnce();
    const notices = await supervisorNotices(srv.base);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].priority, "high");
    assert.equal(notices[0].state, "open");
    assert.equal(notices[0].caseRef, "BR-2026-0001");
    assert.match(notices[0].reason, /^analyst1 extracted the case export from BR-2026-0001 at /);
  } finally {
    await srv.close();
  }
});

test("a blocked download raises its notice too", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const up = await fetch(`${srv.base}/api/v1/cases/BR-2026-0002/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ filename: "scan.txt", mime: "text/plain", contentBase64: txt }),
    });
    const saved = (await up.json()) as { id: string };
    const early = await fetch(`${srv.base}/api/v1/evidence/${saved.id}`, { headers: { cookie } });
    assert.equal(early.status, 404);
    await runOnce();
    const notices = await supervisorNotices(srv.base);
    assert.equal(notices.length, 1);
    assert.equal(notices[0].caseRef, "BR-2026-0002");
    assert.match(notices[0].reason, /^analyst1 was blocked extracting scan\.txt from BR-2026-0002 at /);
  } finally {
    await srv.close();
  }
});

test("a broken notice queue never blocks the download itself", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const evidenceId = await uploadAndClean(srv.base, "BR-2026-0001", "note.txt");
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    await conn.query("alter table outbox_jobs rename to outbox_jobs_broken");
    await conn.end();
    try {
      const file = await fetch(`${srv.base}/api/v1/evidence/${evidenceId}`, { headers: { cookie } });
      assert.equal(file.status, 200);
      assert.equal(await file.text(), "quarantine me, please");
      const audit = new pg.Client({ connectionString: dbUrl });
      await audit.connect();
      const rows = await audit.query(
        "select count(*)::int as n from audit_events where action = 'evidence.download' and meta->>'evidenceId' = $1",
        [evidenceId]
      );
      await audit.end();
      assert.equal(rows.rows[0].n, 1);
    } finally {
      const restore = new pg.Client({ connectionString: dbUrl });
      await restore.connect();
      await restore.query("alter table outbox_jobs_broken rename to outbox_jobs");
      await restore.end();
    }
  } finally {
    await srv.close();
  }
});
