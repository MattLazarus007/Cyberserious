import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import * as jose from "jose";
import type { TLSSocket } from "node:tls";
import pg from "pg";
import { resetDb, dbUrl } from "./help.ts";
import { app } from "../../apps/regulator/server/index.ts";
import { closePool } from "../../apps/regulator/server/db.ts";
import { mtlsPortFromEnv, startMtls } from "../../apps/regulator/server/mtls.ts";

const sender = "org-karoo-01";
const certDir = "certs/mtls";
const path = "/intake/v1/submissions";

let openssl = true;
try {
  execFileSync("openssl", ["version"], { stdio: "pipe" });
} catch {
  openssl = false;
}
const skip = openssl ? false : "openssl is missing on this machine";

let port = 0;
let closeChannel: (() => Promise<void>) | null = null;

interface Attempt {
  status: number;
  body: string;
  protocol: string | null;
  error: string | null;
}

interface TlsMaterial {
  cert?: Buffer;
  key?: Buffer;
  ca: Buffer;
}

function post(port: number, jws: string, tls: TlsMaterial): Promise<Attempt> {
  return new Promise((resolve) => {
    const req = httpsRequest(
      {
        host: "localhost",
        port,
        path,
        method: "POST",
        // No pooling and one request per connection, so the run leaves
        // no idle socket behind when the last assertion is done.
        agent: false,
        headers: {
          "content-type": "application/jose",
          "content-length": Buffer.byteLength(jws),
          connection: "close",
        },
        cert: tls.cert,
        key: tls.key,
        ca: tls.ca,
        rejectUnauthorized: true,
        servername: "localhost",
        minVersion: "TLSv1.3",
      },
      (res) => {
        const protocol = (res.socket as TLSSocket | null)?.getProtocol() ?? null;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            protocol,
            error: null,
          })
        );
      }
    );
    req.setTimeout(4000, () => req.destroy(new Error("attempt timed out")));
    req.on("error", (err: Error) =>
      resolve({ status: 0, body: "", protocol: null, error: err.message })
    );
    req.end(jws);
  });
}

function postPlain(port: number, jws: string): Promise<Attempt> {
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        host: "localhost",
        port,
        path,
        method: "POST",
        agent: false,
        headers: {
          "content-type": "application/jose",
          "content-length": Buffer.byteLength(jws),
          connection: "close",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), protocol: null, error: null })
        );
      }
    );
    req.setTimeout(4000, () => req.destroy(new Error("attempt timed out")));
    req.on("error", (err: Error) =>
      resolve({ status: 0, body: "", protocol: null, error: err.message })
    );
    req.end(jws);
  });
}

async function freePort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
  const addr = probe.address();
  const picked = typeof addr === "object" && addr ? addr.port : 0;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return picked;
}

async function signedPayload(submissionId: string): Promise<string> {
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
  const publicJwk = await jose.exportJWK(publicKey);
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const org = await conn.query("select id from organisations where reference = 'DEMO-ORG-01'");
  await conn.query(
    "insert into sender_keys (sender_id, org_id, public_jwk, active) values ($1, $2, $3::jsonb, true) on conflict (sender_id) do update set public_jwk = excluded.public_jwk, active = true",
    [sender, org.rows[0].id, JSON.stringify(publicJwk)]
  );
  await conn.end();
  const body = JSON.stringify({
    submissionId,
    orgRef: "DEMO-ORG-01",
    category: "unauthorised access",
    narrative: "Submission carried over the local mutual tls channel.",
    severity: "medium",
    priority: "routine",
    affectedCount: 4,
    revision: 1,
  });
  return new jose.CompactSign(Buffer.from(body, "utf8"))
    .setProtectedHeader({ alg: "ES256", kid: sender })
    .sign(privateKey);
}

// A certificate authority the regulator has never heard of, used to
// show that a signed but foreign client certificate is refused too.
function rogueClient(): { cert: Buffer; key: Buffer; ca: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), "mtls-rogue-"));
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "ca.key"), "-out", join(dir, "ca.pem"), "-days", "30", "-subj", "/CN=rogue mtls ca"], { stdio: "pipe" });
    execFileSync("openssl", ["genrsa", "-out", join(dir, "client.key"), "2048"], { stdio: "pipe" });
    execFileSync("openssl", ["req", "-new", "-key", join(dir, "client.key"), "-subj", "/CN=org-sender", "-out", join(dir, "client.csr")], { stdio: "pipe" });
    execFileSync("openssl", ["x509", "-req", "-sha256", "-days", "30", "-in", join(dir, "client.csr"), "-CA", join(dir, "ca.pem"), "-CAkey", join(dir, "ca.key"), "-CAcreateserial", "-out", join(dir, "client.pem")], { stdio: "pipe" });
    return {
      ca: readFileSync(join(dir, "ca.pem")),
      cert: readFileSync(join(dir, "client.pem")),
      key: readFileSync(join(dir, "client.key")),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test.before(async () => {
  if (!openssl) return;
  execFileSync("bash", ["scripts/gen-mtls-certs.sh"], { stdio: "pipe" });
  resetDb();
  port = await freePort();
  process.env.MTLS_PORT = String(port);
  const bound = mtlsPortFromEnv(process.env);
  const server = await startMtls(app, bound, certDir);
  port = bound;
  closeChannel = () =>
    new Promise<void>((resolve, reject) => {
      // Drop anything still open, or the close would wait out an
      // idle timeout and stretch this file for no reason.
      server.closeAllConnections();
      server.close((err: unknown) => (err ? reject(err) : resolve()));
    });
});

test.after(async () => {
  if (closeChannel) await closeChannel();
  // The pool keeps one idle connection to postgres for ten seconds
  // after the last query, which would stretch this file for no reason.
  await closePool();
});

test("a plain tls client with no certificate is refused", { skip }, async () => {
  const ca = readFileSync(join(certDir, "ca.pem"));
  const jws = await signedPayload("SUB-MTLS-NOCLIENT");
  const attempt = await post(port, jws, { ca });
  assert.equal(attempt.status, 0, "no status line may arrive without a client certificate");
  assert.ok(attempt.error, "the handshake must fail before any request is read");
  assert.match(attempt.error, /certificate/i, "the refusal must come from the missing certificate");
});

test("a client certificate signed by a foreign ca is refused", { skip }, async () => {
  const ca = readFileSync(join(certDir, "ca.pem"));
  const rogue = rogueClient();
  const jws = await signedPayload("SUB-MTLS-ROGUE");
  const attempt = await post(port, jws, { ca, cert: rogue.cert, key: rogue.key });
  assert.equal(attempt.status, 0, "a certificate outside the local ca must not reach intake");
  assert.ok(attempt.error, "the handshake must fail on the foreign chain");
});

test("a registered client certificate carries a signed submission", { skip }, async () => {
  const ca = readFileSync(join(certDir, "ca.pem"));
  const cert = readFileSync(join(certDir, "client.pem"));
  const key = readFileSync(join(certDir, "client.key"));
  const jws = await signedPayload("SUB-MTLS-GOOD");
  const attempt = await post(port, jws, { ca, cert, key });
  assert.equal(attempt.error, null);
  assert.equal(attempt.status, 201);
  assert.equal(attempt.protocol, "TLSv1.3");
  const receipt = JSON.parse(attempt.body) as { caseRef: string; destination: string };
  assert.ok(receipt.caseRef.startsWith("BR-2026-"));
  assert.equal(receipt.destination, "test_receiver");
});

test("plain http against the mtls port never answers", { skip }, async () => {
  const jws = await signedPayload("SUB-MTLS-PLAIN");
  const attempt = await postPlain(port, jws);
  assert.equal(attempt.status, 0, "a tls listener must not serve a plain request");
  assert.ok(attempt.error, "the plain request must fail at the connection");
});
