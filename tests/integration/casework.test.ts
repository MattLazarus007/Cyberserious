import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resetDb, startApp, loginFull } from "./help.ts";

async function caseRef(base: string, cookie: string, ref: string): Promise<unknown> {
  const res = await fetch(`${base}/api/v1/cases/${ref}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  return res.json() as Promise<unknown>;
}

test("T-05 notes persist with an audit row and survive a restart", async () => {
  resetDb();
  let srv = await startApp();
  let noteId = "";
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const body = `called the Karoo IO at ${Date.now()}`;
    const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ body, idempotencyKey: randomUUID() }),
    });
    assert.equal(res.status, 201);
    const saved = await res.json();
    noteId = saved.id;
    assert.equal(saved.body, body);
  } finally {
    await srv.close();
  }
  srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const list = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/notes`, { headers: { cookie } });
    assert.equal(list.status, 200);
    const items = ((await list.json()) as { items: { id: string }[] }).items;
    assert.ok(items.some((n) => n.id === noteId), "note survives a restart");
  } finally {
    await srv.close();
  }
});

test("double submit with one key keeps one note", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const key = randomUUID();
    const first = await fetch(`${srv.base}/api/v1/cases/BR-2026-0002/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ body: "scope confirmed with the IO", idempotencyKey: key }),
    });
    assert.equal(first.status, 201);
    const second = await fetch(`${srv.base}/api/v1/cases/BR-2026-0002/notes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ body: "scope confirmed with the IO", idempotencyKey: key }),
    });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).duplicate, true);
    const list = (await (
      await fetch(`${srv.base}/api/v1/cases/BR-2026-0002/notes`, { headers: { cookie } })
    ).json()) as { items: unknown[] };
    assert.equal(list.items.length, 1);
  } finally {
    await srv.close();
  }
});

test("T-06 transitions follow the state table, closure needs a reason", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "supervisor1", "demo-supervisor-pass");
    const before = (await caseRef(srv.base, cookie, "BR-2026-0003")) as { rowVersion: number };
    const bad = await fetch(`${srv.base}/api/v1/cases/BR-2026-0003/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ toState: "Closed", rowVersion: before.rowVersion }),
    });
    assert.equal(bad.status, 422);
    const illegal = await fetch(`${srv.base}/api/v1/cases/BR-2026-0003/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ toState: "Closed", rowVersion: before.rowVersion, reason: "skipping review" }),
    });
    assert.equal(illegal.status, 422);
    const move = await fetch(`${srv.base}/api/v1/cases/BR-2026-0003/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ toState: "UnderReview", rowVersion: before.rowVersion }),
    });
    assert.equal(move.status, 200);
    const moved = await move.json();
    assert.equal(moved.state, "UnderReview");
    assert.equal(moved.rowVersion, before.rowVersion + 1);
    const events = (await (
      await fetch(`${srv.base}/api/v1/cases/BR-2026-0003/events`, { headers: { cookie } })
    ).json()) as { items: { eventType: string }[] };
    assert.ok(events.items.some((e) => e.eventType === "state"));
  } finally {
    await srv.close();
  }
});

test("T-07 stale versions are refused with both numbers", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "supervisor1", "demo-supervisor-pass");
    const before = (await caseRef(srv.base, cookie, "BR-2026-0004")) as { rowVersion: number };
    const first = await fetch(`${srv.base}/api/v1/cases/BR-2026-0004/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ toState: "AwaitingInformation", rowVersion: before.rowVersion }),
    });
    assert.equal(first.status, 200);
    const stale = await fetch(`${srv.base}/api/v1/cases/BR-2026-0004/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ toState: "Closed", rowVersion: before.rowVersion, reason: "late close" }),
    });
    assert.equal(stale.status, 409);
    const clash = await stale.json();
    assert.equal(clash.provided, before.rowVersion);
    assert.equal(clash.current, before.rowVersion + 1);
  } finally {
    await srv.close();
  }
});

test("analysts cannot move cases, supervisors can assign them", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const analyst = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const before = (await caseRef(srv.base, analyst, "BR-2026-0001")) as { rowVersion: number };
    const denied = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: analyst },
      body: JSON.stringify({ toState: "Closed", rowVersion: before.rowVersion, reason: "trying" }),
    });
    assert.equal(denied.status, 403);
    const boss = await loginFull(srv.base, "supervisor1", "demo-supervisor-pass");
    const assigned = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/assignment`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: boss },
      body: JSON.stringify({ assignee: "analyst1" }),
    });
    assert.equal(assigned.status, 200);
    assert.equal((await assigned.json()).assignedTo, "analyst1");
  } finally {
    await srv.close();
  }
});
