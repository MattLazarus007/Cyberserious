import test from "node:test";
import assert from "node:assert/strict";
import { resetDb, dbUrl, startApp, loginFull } from "./help.ts";

test("signed-in users see their own email and number", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const me = await (await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } })).json() as Promise<{
      email: string;
      phone: string;
    }>;
    assert.equal(me.email, "analyst1@regulator.example");
    assert.equal(me.phone, "+27 82 555 0101");
  } finally {
    await srv.close();
  }
});

test("administrators create accounts, others cannot", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const admin = await loginFull(srv.base, "admin1", "demo-admin-pass");
    const created = await fetch(`${srv.base}/api/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({
        username: "analyst2",
        displayName: "Second Analyst",
        email: "analyst2@regulator.example",
        phone: "+27 82 555 0107",
        password: "demo-analyst2-pass",
        role: "regulator_analyst",
      }),
    });
    assert.equal(created.status, 201);
    const twice = await fetch(`${srv.base}/api/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({
        username: "analyst2",
        displayName: "Second Analyst",
        password: "demo-analyst2-pass",
        role: "regulator_analyst",
      }),
    });
    assert.equal(twice.status, 409);
    const list = (await (
      await fetch(`${srv.base}/api/v1/users`, { headers: { cookie: admin } })
    ).json()) as { items: { username: string }[] };
    assert.ok(list.items.some((u) => u.username === "analyst2"));
    const analyst = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const denied = await fetch(`${srv.base}/api/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: analyst },
      body: JSON.stringify({ username: "x", displayName: "X", password: "long-enough-pass", role: "regulator_analyst" }),
    });
    assert.equal(denied.status, 403);
  } finally {
    await srv.close();
  }
});

test("new accounts keep contact detail sealed", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const pg = (await import("pg")).default;
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    try {
      const seed = await conn.query(
        "select email, phone, email_sealed, phone_sealed from users where username = $1",
        ["analyst1"]
      );
      assert.equal(seed.rows[0].email, null);
      assert.equal(seed.rows[0].phone, null);
      const { open } = await import("../../apps/regulator/server/encrypt.ts");
      const key = process.env.RESEARCH_KEY as string;
      assert.equal(open(seed.rows[0].email_sealed, key), "analyst1@regulator.example");
      assert.equal(open(seed.rows[0].phone_sealed, key), "+27 82 555 0101");
    } finally {
      await conn.end();
    }
    const admin = await loginFull(srv.base, "admin1", "demo-admin-pass");
    const created = await fetch(`${srv.base}/api/v1/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: admin },
      body: JSON.stringify({
        username: "sealed1",
        displayName: "Sealed One",
        email: "sealed1@regulator.example",
        phone: "+27 82 555 0111",
        password: "demo-sealed1-pass",
        role: "regulator_analyst",
      }),
    });
    assert.equal(created.status, 201);
    const conn2 = new pg.Client({ connectionString: dbUrl });
    await conn2.connect();
    try {
      const found = await conn2.query(
        "select email, phone, email_sealed, phone_sealed from users where username = $1",
        ["sealed1"]
      );
      assert.equal(found.rows[0].email, null);
      assert.equal(found.rows[0].phone, null);
      assert.ok(found.rows[0].email_sealed);
      assert.ok(found.rows[0].phone_sealed);
      const { open } = await import("../../apps/regulator/server/encrypt.ts");
      const key = process.env.RESEARCH_KEY as string;
      assert.equal(open(found.rows[0].email_sealed, key), "sealed1@regulator.example");
      assert.equal(open(found.rows[0].phone_sealed, key), "+27 82 555 0111");
    } finally {
      await conn2.end();
    }
    const list = (await (
      await fetch(`${srv.base}/api/v1/users`, { headers: { cookie: admin } })
    ).json()) as { items: { username: string; email: string | null; phone: string | null }[] };
    const entry = list.items.find((u) => u.username === "sealed1");
    assert.equal(entry?.email, "sealed1@regulator.example");
    assert.equal(entry?.phone, "+27 82 555 0111");
    const cookie = await loginFull(srv.base, "sealed1", "demo-sealed1-pass");
    const me = (await (
      await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } })
    ).json()) as { email: string; phone: string };
    assert.equal(me.email, "sealed1@regulator.example");
    assert.equal(me.phone, "+27 82 555 0111");
  } finally {
    await srv.close();
  }
});

test("lab simple sign-in skips the code step", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const mode = await (await fetch(`${srv.base}/api/v1/auth-mode`)).json() as { otpRequired: boolean };
    assert.equal(mode.otpRequired, process.env.LAB_SIMPLE_LOGIN !== "1");
    if (process.env.LAB_SIMPLE_LOGIN === "1") {
      const res = await fetch(`${srv.base}/api/v1/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "analyst1", password: "demo-analyst-pass" }),
      });
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as { ok: boolean }).ok, true);
      const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
      const me = await fetch(`${srv.base}/api/v1/me`, { headers: { cookie } });
      assert.equal(me.status, 200);
    }
  } finally {
    await srv.close();
  }
});
