import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resetDb, startApp, loginFull } from "./help.ts";

test("T-01 dashboard numbers match the seeded fixtures", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/dashboard`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      totalCases: 7,
      casesWithNotification: 6,
      openCases: 5,
      pendingReview: 1,
      activeAlerts: 11,
      snoozedAlerts: 0,
    });
  } finally {
    await srv.close();
  }
});

test("T-02 list returns seven, filters narrow honestly", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const all = await (await fetch(`${srv.base}/api/v1/cases?pageSize=50`, { headers: { cookie } })).json();
    assert.equal(all.total, 7);
    const closed = await (
      await fetch(`${srv.base}/api/v1/cases?state=Closed&pageSize=50`, { headers: { cookie } })
    ).json();
    assert.equal(closed.total, 2);
    const karoo = await (
      await fetch(`${srv.base}/api/v1/cases?q=Karoo&pageSize=50`, { headers: { cookie } })
    ).json();
    assert.ok(karoo.total >= 1);
    for (const item of karoo.items) assert.equal(item.orgName, "Karoo Retail Holdings");
  } finally {
    await srv.close();
  }
});

test("T-03 every seeded reference opens with its own badges", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const list = await (
      await fetch(`${srv.base}/api/v1/cases?pageSize=50`, { headers: { cookie } })
    ).json();
    for (const item of list.items) {
      const res = await fetch(`${srv.base}/api/v1/cases/${item.reference}`, { headers: { cookie } });
      assert.equal(res.status, 200);
      const detail = await res.json();
      assert.equal(detail.state, item.state);
      assert.equal(detail.priority, item.priority);
      assert.equal(detail.reference, item.reference);
    }
  } finally {
    await srv.close();
  }
});

test("T-04 unknown ids stay not found with no leakage", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases/${randomUUID()}`, { headers: { cookie } });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not found" });
  } finally {
    await srv.close();
  }
});

test("T-08 an organisation identity is denied on every regulator surface", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "io1", "demo-io-pass");
    const list = await fetch(`${srv.base}/api/v1/cases`, { headers: { cookie } });
    assert.equal(list.status, 403);
    const detail = await fetch(`${srv.base}/api/v1/cases/BR-2026-0002`, { headers: { cookie } });
    assert.equal(detail.status, 404);
    const dashboard = await fetch(`${srv.base}/api/v1/dashboard`, { headers: { cookie } });
    assert.equal(dashboard.status, 403);
    const notes = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/notes`, { headers: { cookie } });
    assert.equal(notes.status, 404);
    const alerts = await fetch(`${srv.base}/api/v1/alerts`, { headers: { cookie } });
    assert.equal(alerts.status, 403);
    const exported = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/export`, { headers: { cookie } });
    assert.equal(exported.status, 404);
  } finally {
    await srv.close();
  }
});

test("T-09 analysts see own plus unassigned, others stay not found", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const boss = await loginFull(srv.base, "supervisor1", "demo-supervisor-pass");
    async function assign(ref: string, to: string): Promise<void> {
      const res = await fetch(`${srv.base}/api/v1/cases/${ref}/assignment`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: boss },
        body: JSON.stringify({ assignee: to }),
      });
      assert.equal(res.status, 200, `assign ${ref} to ${to}`);
    }
    await assign("BR-2026-0001", "analyst1");
    await assign("BR-2026-0002", "supervisor1");
    const analyst = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const list = (await (
      await fetch(`${srv.base}/api/v1/cases?pageSize=50`, { headers: { cookie: analyst } })
    ).json()) as { total: number; items: { reference: string }[] };
    const refs = new Set(list.items.map((i) => i.reference));
    assert.ok(refs.has("BR-2026-0001"), "own case is listed");
    assert.ok(refs.has("BR-2026-0003"), "unassigned case is listed");
    assert.ok(!refs.has("BR-2026-0002"), "case owned by another is not listed");
    assert.equal(list.total, 6);
    const mine = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001`, { headers: { cookie: analyst } });
    assert.equal(mine.status, 200);
    const other = await fetch(`${srv.base}/api/v1/cases/BR-2026-0002`, { headers: { cookie: analyst } });
    assert.equal(other.status, 404);
    assert.deepEqual(await other.json(), { error: "not found" });
    const open = await fetch(`${srv.base}/api/v1/cases/BR-2026-0003`, { headers: { cookie: analyst } });
    assert.equal(open.status, 200);
    const closed = (await (
      await fetch(`${srv.base}/api/v1/cases?state=Closed&pageSize=50`, { headers: { cookie: analyst } })
    ).json()) as { total: number; items: { reference: string }[] };
    assert.equal(closed.total, 1);
    assert.equal(closed.items[0].reference, "BR-2026-0005");
    for (const path of [
      "/api/v1/cases/BR-2026-0002/notes",
      "/api/v1/cases/BR-2026-0002/events",
      "/api/v1/cases/BR-2026-0002/export",
      "/api/v1/cases/BR-2026-0002/obligations",
    ]) {
      const denied = await fetch(`${srv.base}${path}`, { headers: { cookie: analyst } });
      assert.equal(denied.status, 404, path);
      assert.deepEqual(await denied.json(), { error: "not found" });
    }
    for (const path of [
      "/api/v1/cases/BR-2026-0001/notes",
      "/api/v1/cases/BR-2026-0001/events",
      "/api/v1/cases/BR-2026-0001/export",
      "/api/v1/cases/BR-2026-0001/obligations",
    ]) {
      const allowed = await fetch(`${srv.base}${path}`, { headers: { cookie: analyst } });
      assert.equal(allowed.status, 200, path);
    }
    const all = (await (
      await fetch(`${srv.base}/api/v1/cases?pageSize=50`, { headers: { cookie: boss } })
    ).json()) as { total: number };
    assert.equal(all.total, 7);
    const bossSeesOther = await fetch(`${srv.base}/api/v1/cases/BR-2026-0002`, { headers: { cookie: boss } });
    assert.equal(bossSeesOther.status, 200);
  } finally {
    await srv.close();
  }
});

test("alerts list carries reason and rule on each row", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/alerts`, { headers: { cookie } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.items.length, 11);
    const rules = new Set(body.items.map((a: { ruleId: string }) => a.ruleId));
    assert.deepEqual([...rules].sort(), ["RULE-01", "RULE-02", "RULE-03", "RULE-04", "RULE-05", "RULE-06"]);
    for (const alert of body.items) {
      assert.ok(alert.ruleId);
      assert.ok(alert.reason);
      assert.ok(alert.priority);
    }
  } finally {
    await srv.close();
  }
});

test("T-10 the administrator signs in but reads no case content", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "admin1", "demo-admin-pass");
    const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } });
    assert.equal(me.status, 200);
    const list = await fetch(`${srv.base}/api/v1/cases`, { headers: { cookie } });
    assert.equal(list.status, 403);
    const one = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001`, { headers: { cookie } });
    assert.equal(one.status, 404);
  } finally {
    await srv.close();
  }
});

test("api responses are never cached", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    assert.match(res.headers.get("pragma") ?? "", /no-cache/);
  } finally {
    await srv.close();
  }
});

test("static html keeps its normal caching", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const res = await fetch(`${srv.base}/login.html`);
    assert.equal(res.status, 200);
    const cached = res.headers.get("cache-control") ?? "";
    assert.ok(!cached.includes("no-store"), `static page stayed cacheable, got "${cached}"`);
    assert.ok(!(res.headers.get("pragma") ?? "").includes("no-cache"), "no pragma on static pages");
  } finally {
    await srv.close();
  }
});

test("no cookie means no data on any endpoint", async () => {
  resetDb();
  const srv = await startApp();
  try {
    for (const path of ["/api/v1/me", "/api/v1/cases", "/api/v1/cases/BR-2026-0001", "/api/v1/dashboard"]) {
      const res = await fetch(`${srv.base}${path}`);
      assert.equal(res.status, 401, path);
    }
  } finally {
    await srv.close();
  }
});
