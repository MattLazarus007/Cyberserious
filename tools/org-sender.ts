import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import * as jose from "jose";
import pg from "pg";

// Lab sender simulator. Registers a sender key and posts one signed
// submission to the test receiver. Destination is always labelled
// test_receiver on the stored receipt, never an official channel.

const senderId = process.env.ORG_SENDER_ID ?? "org-karoo-01";
// MTLS=1 switches the send onto the mutual tls listener. Anything
// else keeps the plain intake url, so nothing existing changes.
const useMtls = process.env.MTLS === "1";
const intakeUrl = useMtls
  ? process.env.REGULATOR_MTLS_URL ?? "https://localhost:8101/intake/v1/submissions"
  : process.env.REGULATOR_INTAKE_URL ?? "http://localhost:8100/intake/v1/submissions";
const keyPath = process.env.ORG_SENDER_KEY ?? "keys/org-sender.json";
const certDir = process.env.MTLS_CERT_DIR ?? "certs/mtls";

// The mutual tls path goes through the built in https client, because
// the global fetch cannot carry a client certificate. The chain is
// checked against the local authority and the floor stays at TLS 1.3.
function sendTls(url: string, jws: string): Promise<{ status: number; text: string }> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: target.hostname,
        port: target.port || "443",
        path: target.pathname + target.search,
        method: "POST",
        agent: false,
        headers: {
          "content-type": "application/jose",
          "content-length": Buffer.byteLength(jws),
          connection: "close",
        },
        cert: readFileSync(join(certDir, "client.pem")),
        key: readFileSync(join(certDir, "client.key")),
        ca: readFileSync(join(certDir, "ca.pem")),
        rejectUnauthorized: true,
        servername: target.hostname,
        minVersion: "TLSv1.3",
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("error", reject);
    req.end(jws);
  });
}

if (process.argv.includes("--register")) {
  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
  const publicJwk = await jose.exportJWK(publicKey);
  const privateJwk = await jose.exportJWK(privateKey);
  const conn = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await conn.connect();
  const org = await conn.query("select id from organisations where reference = 'DEMO-ORG-01'");
  await conn.query(
    `insert into sender_keys (sender_id, org_id, public_jwk, active)
     values ($1, $2, $3::jsonb, true)
     on conflict (sender_id) do update set public_jwk = excluded.public_jwk, active = true`,
    [senderId, org.rows[0].id, JSON.stringify(publicJwk)]
  );
  await conn.end();
  mkdirSync("keys", { recursive: true });
  writeFileSync(keyPath, JSON.stringify(privateJwk));
  console.log(`registered ${senderId}, private key at ${keyPath}`);
} else if (process.argv.includes("--send")) {
  if (useMtls && !existsSync(join(certDir, "client.pem"))) {
    console.error(`no client certificate in ${certDir}, run bash scripts/gen-mtls-certs.sh first`);
    process.exitCode = 1;
  } else if (!existsSync(keyPath)) {
    console.error(`no key at ${keyPath}, run with --register first`);
    process.exitCode = 1;
  } else {
    const privateKey = await jose.importJWK(JSON.parse(readFileSync(keyPath, "utf8")), "ES256");
    const submissionId = `LAB-${Date.now()}`;
    const body = JSON.stringify({
      submissionId,
      orgRef: "DEMO-ORG-01",
      category: "unauthorised access",
      narrative: "Lab rehearsal submission from the sender simulator.",
      severity: "medium",
      priority: "routine",
      affectedCount: 3,
      revision: 1,
    });
    const sendOnce = async (): Promise<{ status: number; text: string }> => {
      const jws = await new jose.CompactSign(Buffer.from(body, "utf8"))
        .setProtectedHeader({ alg: "ES256", kid: senderId })
        .sign(privateKey);
      if (!useMtls) {
        const res = await fetch(intakeUrl, {
          method: "POST",
          headers: { "content-type": "application/jose" },
          body: jws,
        });
        return { status: res.status, text: await res.text() };
      }
      return sendTls(intakeUrl, jws);
    };
    const first = await sendOnce();
    console.log("first send:", first.status, first.text);
    const retry = await sendOnce();
    console.log("retry (lost ack rehearsal):", retry.status, retry.text);
  }
} else {
  console.log("use --register then --send");
}
