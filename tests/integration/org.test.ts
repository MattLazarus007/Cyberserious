import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import * as jose from "jose";
import pg from "pg";
import { resetDb, dbUrl } from "./help.ts";
import { resetOrgDb, startOrgApp, orgLogin, orgDbUrl } from "./orghelp.ts";

const INTAKE_PORT = 8199;

async function startRegulator(): Promise<ChildProcess> {
  const child = spawn("node", ["apps/regulator/server/index.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      PORT: String(INTAKE_PORT),
      REGULATOR_INTAKE_URL: `http://localhost:${INTAKE_PORT}/intake/v1/submissions`,
    },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${INTAKE_PORT}/health/live`);
      if (res.ok) return child;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  child.kill();
  throw new Error("regulator child never came up");
}

test("T-15 draft, approval binds revision, edit invalidates, send receipts", async () => {
  resetDb();
  resetOrgDb();
  const child = await startRegulator();
  try {
    const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const org = await conn.query("select id from organisations where reference = 'DEMO-ORG-01'");
    await conn.query(
      "insert into sender_keys (sender_id, org_id, public_jwk, active) values ('org-karoo-01', $1, $2::jsonb, true) on conflict (sender_id) do update set public_jwk = excluded.public_jwk",
      [org.rows[0].id, JSON.stringify(await jose.exportJWK(publicKey))]
    );
    await conn.end();
    writeFileSync("/tmp/org-test-key.json", JSON.stringify(await jose.exportJWK(privateKey)));
    process.env.ORG_SENDER_KEY = "/tmp/org-test-key.json";
    process.env.ORG_SENDER_ID = "org-karoo-01";
    process.env.REGULATOR_INTAKE_URL = `http://localhost:${INTAKE_PORT}/intake/v1/submissions`;

    const srv = await startOrgApp();
    try {
      const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
      const created = await fetch(`${srv.base}/api/v1/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: steward },
        body: JSON.stringify({ category: "data exposure", narrative: "A shared drive link went further than intended." }),
      });
      assert.equal(created.status, 201);
      const draft = (await created.json()) as { publicId: string };
      const submit = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/submit`, {
        method: "POST",
        headers: { cookie: steward },
      });
      assert.equal(submit.status, 200);
      const stewardApprove = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/approve`, {
        method: "POST",
        headers: { cookie: steward },
      });
      assert.equal(stewardApprove.status, 403);
      const io = await orgLogin(srv.base, "io1", "demo-io-pass");
      const approved = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/approve`, {
        method: "POST",
        headers: { cookie: io },
      });
      assert.equal(approved.status, 200);
      const binding = (await approved.json()) as { revision: number; approvedHash: string };
      assert.equal(binding.revision, 1);
      assert.ok(binding.approvedHash);
      const edited = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: steward },
        body: JSON.stringify({ category: "data exposure", narrative: "A shared drive link went further than intended. Scope updated." }),
      });
      assert.equal(edited.status, 200);
      assert.equal(((await edited.json()) as { status: string }).status, "Draft");
      await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/submit`, { method: "POST", headers: { cookie: steward } });
      await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/approve`, { method: "POST", headers: { cookie: io } });
      const sent = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/send`, {
        method: "POST",
        headers: { cookie: steward },
      });
      assert.equal(sent.status, 200);
      const receipt = ((await sent.json()) as { receipt: { caseRef: string; destination: string } }).receipt;
      assert.ok(receipt.caseRef.startsWith("BR-2026-"));
      assert.equal(receipt.destination, "test_receiver");
      const list = (await (await fetch(`${srv.base}/api/v1/drafts`, { headers: { cookie: steward } })).json()) as {
        items: { status: string }[];
      };
      assert.equal(list.items[0].status, "Acknowledged");
    } finally {
      await srv.close();
    }
  } finally {
    child.kill();
  }
});

test("security officer drafts, edits, lists own drafts, cannot approve", async () => {
  resetOrgDb();
  const srv = await startOrgApp();
  try {
    const so = await orgLogin(srv.base, "so1", "demo-so-pass");
    const created = await fetch(`${srv.base}/api/v1/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: so },
      body: JSON.stringify({ category: "data exposure", narrative: "A laptop went missing on a site visit." }),
    });
    assert.equal(created.status, 201);
    const draft = (await created.json()) as { publicId: string };
    const edited = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: so },
      body: JSON.stringify({ category: "data exposure", narrative: "A laptop went missing on a site visit. Scope updated." }),
    });
    assert.equal(edited.status, 200);
    const list = (await (await fetch(`${srv.base}/api/v1/drafts`, { headers: { cookie: so } })).json()) as {
      items: { publicId: string }[];
    };
    assert.ok(list.items.some((d) => d.publicId === draft.publicId));
    const denied = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/approve`, {
      method: "POST",
      headers: { cookie: so },
    });
    assert.equal(denied.status, 403);
  } finally {
    await srv.close();
  }
});

test("foreign drafts stay hidden across orgs", async () => {
  resetOrgDb();
  const conn = new pg.Client({ connectionString: orgDbUrl });
  await conn.connect();
  await conn.query(
    `insert into organisations (reference, display_name, sector)
     values ('DEMO-ORG-02', 'Vaal Logistics', 'logistics')
     on conflict (reference) do nothing`
  );
  const other = await conn.query(
    `insert into users (username, display_name, password_hash, email, phone)
     values ('other1', 'Other One', 'locked', 'other1@example.com', '+27 82 555 0199')
     on conflict (username) do update set display_name = excluded.display_name returning id`
  );
  const otherId = other.rows[0].id;
  await conn.query(
    `insert into memberships (user_id, org_id, role)
     values ($1, (select id from organisations where reference = 'DEMO-ORG-02'), 'data_steward')
     on conflict (user_id, org_id, role) do nothing`,
    [otherId]
  );
  await conn.query(
    `insert into drafts (public_id, org_ref, category, narrative, status, created_by)
     values
       ('SUB-2026-9101', 'DEMO-ORG-02', 'data exposure', 'foreign draft one', 'Draft', $1),
       ('SUB-2026-9102', 'DEMO-ORG-02', 'data exposure', 'foreign draft two', 'ReadyForApproval', $1),
       ('SUB-2026-9103', 'DEMO-ORG-02', 'data exposure', 'foreign draft three', 'Approved', $1)
     on conflict (public_id) do nothing`,
    [otherId]
  );
  await conn.query(
    `update drafts set approved_revision = 1, approved_hash = 'dead'
      where public_id = 'SUB-2026-9103'`
  );
  await conn.end();
  const srv = await startOrgApp();
  try {
    const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
    const io = await orgLogin(srv.base, "io1", "demo-io-pass");
    const put = await fetch(`${srv.base}/api/v1/drafts/SUB-2026-9101`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: steward },
      body: JSON.stringify({ category: "data exposure", narrative: "try edit foreign" }),
    });
    assert.equal(put.status, 404);
    const submit = await fetch(`${srv.base}/api/v1/drafts/SUB-2026-9101/submit`, {
      method: "POST",
      headers: { cookie: steward },
    });
    assert.equal(submit.status, 404);
    const approve = await fetch(`${srv.base}/api/v1/drafts/SUB-2026-9102/approve`, {
      method: "POST",
      headers: { cookie: io },
    });
    assert.equal(approve.status, 404);
    const send = await fetch(`${srv.base}/api/v1/drafts/SUB-2026-9103/send`, {
      method: "POST",
      headers: { cookie: steward },
    });
    assert.equal(send.status, 404);
  } finally {
    await srv.close();
  }
});

test("strangers cannot draft on the organisation side", async () => {
  resetOrgDb();
  const srv = await startOrgApp();
  try {
    const res = await fetch(`${srv.base}/api/v1/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "analyst1", password: "demo-analyst-pass" }),
    });
    assert.equal(res.status, 401);
    const anon = await fetch(`${srv.base}/api/v1/drafts`);
    assert.equal(anon.status, 401);
    void orgDbUrl;
  } finally {
    await srv.close();
  }
});
