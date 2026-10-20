import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import pg from "pg";
import { resetDb, startApp, dbUrl, loginFull } from "./help.ts";

const sender = "org-karoo-01";

async function keypair(): Promise<{ publicJwk: unknown; sign: (body: string) => Promise<string> }> {
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
  return {
    publicJwk: await jose.exportJWK(publicKey),
    sign: (body: string) =>
      new jose.CompactSign(Buffer.from(body, "utf8"))
        .setProtectedHeader({ alg: "ES256", kid: sender })
        .sign(privateKey),
  };
}

async function registerSender(publicJwk: unknown): Promise<void> {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const org = await conn.query("select id from organisations where reference = 'DEMO-ORG-01'");
  await conn.query(
    "insert into sender_keys (sender_id, org_id, public_jwk, active) values ($1, $2, $3::jsonb, true) on conflict (sender_id) do update set public_jwk = excluded.public_jwk",
    [sender, org.rows[0].id, JSON.stringify(publicJwk)]
  );
  await conn.end();
}

function submission(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    submissionId: "SUB-TEST-001",
    orgRef: "DEMO-ORG-01",
    category: "unauthorised access",
    narrative: "A misdirected statement run reached the wrong inbox.",
    severity: "medium",
    priority: "routine",
    affectedCount: 12,
    revision: 1,
    ...over,
  });
}

async function postIntake(base: string, jws: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}/intake/v1/submissions`, {
    method: "POST",
    headers: { "content-type": "application/jose" },
    body: jws,
  });
  return { status: res.status, body: await res.json() };
}

test("T-16 signed intake stores a case and a labelled receipt", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const keys = await keypair();
    await registerSender(keys.publicJwk);
    const { status, body } = await postIntake(srv.base, await keys.sign(submission()));
    assert.equal(status, 201);
    const receipt = body as { caseRef: string; destination: string };
    assert.ok(receipt.caseRef.startsWith("BR-2026-"));
    assert.equal(receipt.destination, "test_receiver");
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const detail = await fetch(`${srv.base}/api/v1/cases/${receipt.caseRef}`, { headers: { cookie } });
    assert.equal(detail.status, 200);
  } finally {
    await srv.close();
  }
});

test("T-17 retry returns the original receipt, T-18 changed bytes conflict", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const keys = await keypair();
    await registerSender(keys.publicJwk);
    const jws = await keys.sign(submission({ submissionId: "SUB-TEST-017" }));
    const first = await postIntake(srv.base, jws);
    assert.equal(first.status, 201);
    const retry = await postIntake(srv.base, jws);
    assert.equal(retry.status, 200);
    assert.deepEqual((retry.body as { caseRef: string }).caseRef, (first.body as { caseRef: string }).caseRef);
    assert.equal((retry.body as { retried?: boolean }).retried, true);
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const cases = await conn.query("select count(*)::int as n from cases");
    await conn.end();
    assert.equal(cases.rows[0].n, 7 + 1);
    const clash = await postIntake(srv.base, await keys.sign(submission({ submissionId: "SUB-TEST-017", affectedCount: 99 })));
    assert.equal(clash.status, 409);
  } finally {
    await srv.close();
  }
});

test("T-19 unknown senders and bad signatures are refused", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const keys = await keypair();
    const stranger = await postIntake(srv.base, await keys.sign(submission()));
    assert.equal(stranger.status, 401);
    await registerSender(keys.publicJwk);
    const tampered = (await keys.sign(submission({ submissionId: "SUB-TEST-019" }))).slice(0, -4) + "abcd";
    const bad = await postIntake(srv.base, tampered);
    assert.equal(bad.status, 401);
  } finally {
    await srv.close();
  }
});

test("T-20 failures leave no receipt, success leaves one case and one job", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const keys = await keypair();
    await registerSender(keys.publicJwk);
    const badOrg = await postIntake(srv.base, await keys.sign(submission({ submissionId: "SUB-TEST-020", orgRef: "NOPE-99" })));
    assert.equal(badOrg.status, 422);
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const receipts = await conn.query("select count(*)::int as n from intake_receipts");
    assert.equal(receipts.rows[0].n, 0);
    await conn.end();
    const good = await postIntake(srv.base, await keys.sign(submission({ submissionId: "SUB-TEST-020" })));
    assert.equal(good.status, 201);
    const conn2 = new pg.Client({ connectionString: dbUrl });
    await conn2.connect();
    const one = await conn2.query("select count(*)::int as n from intake_receipts where submission_id = 'SUB-TEST-020'");
    const jobs = await conn2.query("select count(*)::int as n from outbox_jobs where job_type = 'evaluate_case'");
    await conn2.end();
    assert.equal(one.rows[0].n, 1);
    assert.ok(jobs.rows[0].n >= 1);
  } finally {
    await srv.close();
  }
});
