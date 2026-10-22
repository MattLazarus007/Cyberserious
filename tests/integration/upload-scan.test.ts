import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { resetDb, startApp, loginFull, dbUrl } from "./help.ts";

const eicar = [
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$",
  "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
].join("");

async function countEvidence(): Promise<number> {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  try {
    const rows = await conn.query("select count(*)::int as n from evidence");
    return rows.rows[0].n as number;
  } finally {
    await conn.end();
  }
}

async function lastScanAudit(): Promise<{ result: string; meta: Record<string, unknown> } | null> {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  try {
    const rows = await conn.query(
      "select result, meta from audit_events where action = 'evidence.scan' order by created_at desc limit 1"
    );
    return rows.rows[0] ?? null;
  } finally {
    await conn.end();
  }
}

test("an infected upload is refused and leaves no evidence row", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        filename: "invoice.txt",
        mime: "text/plain",
        contentBase64: Buffer.from(eicar).toString("base64"),
      }),
    });
    assert.equal(res.status, 422);
    const body = (await res.json()) as { signature?: string };
    assert.match(body.signature ?? "", /Eicar/i);
    assert.equal(await countEvidence(), 0);
    const audit = await lastScanAudit();
    assert.equal(audit?.result, "denied");
    assert.match(String(audit?.meta.signature), /Eicar/i);
  } finally {
    await srv.close();
  }
});

test("a clean upload records the scan result", async () => {
  resetDb();
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        filename: "note.txt",
        mime: "text/plain",
        contentBase64: Buffer.from("nothing hostile here").toString("base64"),
      }),
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { status: string; scan: string };
    assert.equal(body.status, "quarantine");
    assert.ok(["clean", "unavailable"].includes(body.scan));
    const audit = await lastScanAudit();
    assert.equal(audit?.result, "ok");
  } finally {
    await srv.close();
  }
});

test("a required scanner that is unreachable fails closed", async () => {
  resetDb();
  process.env.CLAMAV_REQUIRED = "1";
  process.env.CLAMAV_CONF = "/nonexistent/clamd.conf";
  const srv = await startApp();
  try {
    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const res = await fetch(`${srv.base}/api/v1/cases/BR-2026-0001/evidence`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        filename: "note.txt",
        mime: "text/plain",
        contentBase64: Buffer.from("scanner down").toString("base64"),
      }),
    });
    assert.equal(res.status, 503);
    assert.equal(await countEvidence(), 0);
  } finally {
    delete process.env.CLAMAV_REQUIRED;
    delete process.env.CLAMAV_CONF;
    await srv.close();
  }
});
