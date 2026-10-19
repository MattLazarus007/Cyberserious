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

async function postSubmission(base: string, jws: string): Promise<{ caseRef: string }> {
  const res = await fetch(`${base}/intake/v1/submissions`, {
    method: "POST",
    headers: { "content-type": "application/jose" },
    body: jws,
  });
  assert.equal(res.status, 201);
  return (await res.json()) as { caseRef: string };
}

function notice(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    draftPublicId: "SUB-NOTICE-001",
    orgRef: "DEMO-ORG-01",
    affectedTotal: 10,
    sent: 8,
    failed: 2,
    channel: "email",
    completedAt: "2026-10-19T09:00:00.000Z",
    ...over,
  });
}

async function postNotice(
  base: string,
  jws: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/v1/intake/affected-notices`, {
    method: "POST",
    headers: { "content-type": "application/jose" },
    body: jws,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("T-71 a signed affected notice is stored, audited and mapped to its case", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const keys = await keypair();
    await registerSender(keys.publicJwk);
    const receipt = await postSubmission(
      srv.base,
      await keys.sign(
        JSON.stringify({
          submissionId: "SUB-NOTICE-001",
          orgRef: "DEMO-ORG-01",
          category: "data exposure",
          narrative: "A report bundle reached a wider list than intended.",
          severity: "medium",
          priority: "routine",
          affectedCount: 10,
          revision: 1,
        })
      )
    );
    const result = await postNotice(
      srv.base,
      await keys.sign(notice({ caseRef: receipt.caseRef, sent: 8, failed: 2 }))
    );
    assert.equal(result.status, 201);
    assert.equal(result.body.caseRef, receipt.caseRef);

    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const rows = await conn.query(
      "select case_id, affected_total as total, sent, failed, channel from affected_notices where draft_public_id = 'SUB-NOTICE-001'"
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].total, 10);
    assert.equal(rows.rows[0].sent, 8);
    assert.equal(rows.rows[0].failed, 2);
    assert.ok(rows.rows[0].case_id, "notice should attach to the case from the reference");
    const audit = await conn.query(
      "select count(*)::int as n from audit_events where action = 'intake.affected_notice'"
    );
    assert.equal(audit.rows[0].n, 1);
    await conn.end();

    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const detail = await fetch(`${srv.base}/api/v1/cases/${receipt.caseRef}`, { headers: { cookie } });
    const body = (await detail.json()) as {
      affectedSent: number;
      affectedTotal: number;
      affectedChannel: string;
      affectedCompletedAt: string;
    };
    assert.equal(body.affectedSent, 8);
    assert.equal(body.affectedTotal, 10);
    assert.equal(body.affectedChannel, "email");
    assert.equal(new Date(body.affectedCompletedAt).toISOString(), "2026-10-19T09:00:00.000Z");
  } finally {
    await srv.close();
  }
});

test("T-72 a shortfall raises one medium alert", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const keys = await keypair();
    await registerSender(keys.publicJwk);
    const body = notice({ draftPublicId: "SUB-NOTICE-041", completedAt: "2026-10-19T10:00:00.000Z" });
    const first = await postNotice(srv.base, await keys.sign(body));
    assert.equal(first.status, 201);
    const retry = await postNotice(srv.base, await keys.sign(body));
    assert.equal(retry.status, 200);
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const alerts = await conn.query(
      "select id, rule_id, priority, reason from alerts where rule_id = 'AFFECTED-NOTICE-SHORTFALL'"
    );
    assert.equal(alerts.rows.length, 1);
    assert.equal(alerts.rows[0].priority, "medium");
    assert.match(alerts.rows[0].reason, /8 of 10/);
    const notices = await conn.query(
      "select count(*)::int as n from affected_notices where draft_public_id = 'SUB-NOTICE-041'"
    );
    assert.equal(notices.rows[0].n, 1);
    await conn.end();
  } finally {
    await srv.close();
  }
});

test("T-73 full delivery records without a shortfall alert", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const keys = await keypair();
    await registerSender(keys.publicJwk);
    const result = await postNotice(
      srv.base,
      await keys.sign(
        notice({ draftPublicId: "SUB-NOTICE-042", affectedTotal: 6, sent: 6, failed: 0, channel: "sms" })
      )
    );
    assert.equal(result.status, 201);
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const alerts = await conn.query(
      "select count(*)::int as n from alerts where rule_id = 'AFFECTED-NOTICE-SHORTFALL'"
    );
    await conn.end();
    assert.equal(alerts.rows[0].n, 0);
  } finally {
    await srv.close();
  }
});

test("T-74 bad signatures and impossible counts are refused", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const keys = await keypair();
    const stranger = await postNotice(srv.base, await keys.sign(notice()));
    assert.equal(stranger.status, 401);
    await registerSender(keys.publicJwk);
    const tampered = (await keys.sign(notice({ draftPublicId: "SUB-NOTICE-043" }))).slice(0, -4) + "abcd";
    assert.equal((await postNotice(srv.base, tampered)).status, 401);
    const impossible = await postNotice(
      srv.base,
      await keys.sign(notice({ draftPublicId: "SUB-NOTICE-043", affectedTotal: 10, sent: 9, failed: 2 }))
    );
    assert.equal(impossible.status, 422);
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const rows = await conn.query("select count(*)::int as n from affected_notices");
    await conn.end();
    assert.equal(rows.rows[0].n, 0);
  } finally {
    await srv.close();
  }
});
