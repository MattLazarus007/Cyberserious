import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resetDb, startApp, loginFull, type TestApp } from "./help.ts";

const KEY = randomBytes(32).toString("hex");
const PLAIN = "sealed evidence note 2026";
let app: TestApp;
let cookie: string;
let caseId: string;

test.before(async () => {
  process.env.EVIDENCE_KEY = KEY;
  resetDb();
  app = await startApp();
  cookie = await loginFull(app.base, "supervisor1", "demo-supervisor-pass");
  const list = await fetch(`${app.base}/api/v1/cases`, { headers: { cookie } });
  const body = (await list.json()) as { items: Array<{ id: string }> };
  caseId = body.items[0].id;
});

test.after(async () => {
  delete process.env.EVIDENCE_KEY;
  await app.close();
});

async function upload(filename: string, mime: string, content: string): Promise<Response> {
  return fetch(`${app.base}/api/v1/cases/${caseId}/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ filename, mime, contentBase64: Buffer.from(content).toString("base64") }),
  });
}

test("a malformed evidence id answers not found", async () => {
  const res = await fetch(`${app.base}/api/v1/evidence/not-a-uuid`, { headers: { cookie } });
  assert.equal(res.status, 404, "a bad id never reaches Postgres");
});

test("declared type must match the bytes", async () => {
  const res = await upload("note.pdf", "application/pdf", PLAIN);
  assert.equal(res.status, 422);
});

test("stored evidence is ciphertext and reads back through the app", async () => {
  const res = await upload("note.txt", "text/plain", PLAIN);
  assert.equal(res.status, 201);
  const body = (await res.json()) as { id: string; sealed: boolean };
  assert.equal(body.sealed, true);
  const dir = process.env.EVIDENCE_DIR ?? join(process.cwd(), "data", "evidence");
  const files = readdirSync(dir).filter((name) => name.startsWith(body.id));
  assert.equal(files.length, 1);
  const bytes = readFileSync(join(dir, files[0]));
  assert.equal(bytes.includes(Buffer.from(PLAIN)), false);
  assert.equal(bytes.subarray(0, 4).toString(), "CSG1");

  const review = await fetch(`${app.base}/api/v1/evidence/${body.id}/review`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ verdict: "clean" }),
  });
  assert.equal(review.status, 200);
  const download = await fetch(`${app.base}/api/v1/evidence/${body.id}`, { headers: { cookie } });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), PLAIN);
});
