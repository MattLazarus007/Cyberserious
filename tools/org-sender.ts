import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import * as jose from "jose";
import pg from "pg";

// Lab sender simulator. Registers a sender key and posts one signed
// submission to the test receiver. Destination is always labelled
// test_receiver on the stored receipt, never an official channel.

const senderId = process.env.ORG_SENDER_ID ?? "org-karoo-01";
const intakeUrl = process.env.REGULATOR_INTAKE_URL ?? "http://localhost:8100/intake/v1/submissions";
const keyPath = process.env.ORG_SENDER_KEY ?? "keys/org-sender.json";

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
  if (!existsSync(keyPath)) {
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
      const res = await fetch(intakeUrl, {
        method: "POST",
        headers: { "content-type": "application/jose" },
        body: await new jose.CompactSign(Buffer.from(body, "utf8"))
          .setProtectedHeader({ alg: "ES256", kid: senderId })
          .sign(privateKey),
      });
      return { status: res.status, text: await res.text() };
    };
    const first = await sendOnce();
    console.log("first send:", first.status, first.text);
    const retry = await sendOnce();
    console.log("retry (lost ack rehearsal):", retry.status, retry.text);
  }
} else {
  console.log("use --register then --send");
}
