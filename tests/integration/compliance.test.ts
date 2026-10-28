import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import * as jose from "jose";
import pg from "pg";
import { resetDb, dbUrl } from "./help.ts";
import { resetOrgDb, startOrgApp, orgLogin } from "./orghelp.ts";

const REG_PORT = 8197;

const NOTICE_PARTS = {
  consequencesText: "Unauthorised access to the personal information recorded in this case.",
  measuresText: "The account is disabled, the case is contained and the register is sealed.",
  adviceText: "Change your password and report unexpected contact to the information officer.",
};

async function startRegulator(): Promise<ChildProcess> {
  const child = spawn("node", ["apps/regulator/server/index.ts"], {
    env: { ...process.env, DATABASE_URL: dbUrl, PORT: String(REG_PORT) },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${REG_PORT}/health/live`);
      if (res.ok) return child;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  child.kill();
  throw new Error("regulator child never came up");
}

interface Draft {
  publicId: string;
  revision: number;
  status: string;
}

async function approvedDraft(
  base: string,
  steward: string,
  io: string,
  affectedCount: number
): Promise<Draft> {
  const created = await fetch(`${base}/api/v1/drafts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: steward },
    body: JSON.stringify({
      category: "data exposure",
      narrative: "A shared drive link went further than intended.",
      affectedCount,
    }),
  });
  assert.equal(created.status, 201);
  const draft = (await created.json()) as Draft;
  const submitted = await fetch(`${base}/api/v1/drafts/${draft.publicId}/submit`, {
    method: "POST",
    headers: { cookie: steward },
  });
  assert.equal(submitted.status, 200);
  const approved = await fetch(`${base}/api/v1/drafts/${draft.publicId}/approve`, {
    method: "POST",
    headers: { cookie: io },
  });
  assert.equal(approved.status, 200);
  return draft;
}

async function prepare(): Promise<void> {
  resetDb();
  resetOrgDb();
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const org = await conn.query("select id from organisations where reference = 'DEMO-ORG-01'");
  await conn.query(
    "insert into sender_keys (sender_id, org_id, public_jwk, active) values ('org-karoo-01', $1, $2::jsonb, true) on conflict (sender_id) do update set public_jwk = excluded.public_jwk",
    [org.rows[0].id, JSON.stringify(await jose.exportJWK(publicKey))]
  );
  await conn.end();
  writeFileSync("/tmp/compliance-key.json", JSON.stringify(await jose.exportJWK(privateKey)));
  process.env.ORG_SENDER_KEY = "/tmp/compliance-key.json";
  process.env.ORG_SENDER_ID = "org-karoo-01";
  process.env.REGULATOR_AFFECTED_URL = `http://localhost:${REG_PORT}/api/v1/intake/affected-notices`;
}

test("C-01 the affected notice carries the four section 22(5) particulars", async () => {
  await prepare();
  const child = await startRegulator();
  const srv = await startOrgApp();
  try {
    const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
    const io = await orgLogin(srv.base, "io1", "demo-io-pass");
    const draft = await approvedDraft(srv.base, steward, io, 5);
    const sent = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({ channel: "email", ...NOTICE_PARTS }),
    });
    assert.equal(sent.status, 200);

    const listed = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notifications`, {
      headers: { cookie: io },
    });
    assert.equal(listed.status, 200);
    const body = (await listed.json()) as { items: { templateText: string }[] };
    assert.equal(body.items.length, 1);
    const notice = body.items[0].templateText;
    assert.ok(notice.includes(NOTICE_PARTS.consequencesText), "s22(5)(a) missing");
    assert.ok(notice.includes(NOTICE_PARTS.measuresText), "s22(5)(b) missing");
    assert.ok(notice.includes(NOTICE_PARTS.adviceText), "s22(5)(c) missing");
    assert.match(notice, /not known at the time of this notice/, "s22(5)(d) missing");
  } finally {
    await srv.close();
    child.kill();
  }
});

test("C-02 a notice that misses a required particular is refused", async () => {
  await prepare();
  const child = await startRegulator();
  const srv = await startOrgApp();
  try {
    const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
    const io = await orgLogin(srv.base, "io1", "demo-io-pass");
    const draft = await approvedDraft(srv.base, steward, io, 5);
    const sent = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({
        channel: "email",
        consequencesText: NOTICE_PARTS.consequencesText,
        measuresText: NOTICE_PARTS.measuresText,
      }),
    });
    assert.equal(sent.status, 400);
  } finally {
    await srv.close();
    child.kill();
  }
});

test("C-03 the statutory delivery channels are accepted and an unknown channel is refused", async () => {
  await prepare();
  const child = await startRegulator();
  const srv = await startOrgApp();
  try {
    const steward = await orgLogin(srv.base, "steward1", "demo-steward-pass");
    const io = await orgLogin(srv.base, "io1", "demo-io-pass");
    const draft = await approvedDraft(srv.base, steward, io, 5);

    for (const channel of ["email", "letter", "website", "news"]) {
      const sent = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notify`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: io },
        body: JSON.stringify({ channel, ...NOTICE_PARTS }),
      });
      assert.equal(sent.status, 200, `channel ${channel} refused`);
      const body = (await sent.json()) as { runs: { channel: string }[] };
      assert.equal(body.runs[0].channel, channel);
    }

    const bad = await fetch(`${srv.base}/api/v1/drafts/${draft.publicId}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: io },
      body: JSON.stringify({ channel: "carrier-pigeon", ...NOTICE_PARTS }),
    });
    assert.equal(bad.status, 400);
  } finally {
    await srv.close();
    child.kill();
  }
});
