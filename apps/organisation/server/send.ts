import { readFileSync } from "node:fs";
import * as jose from "jose";

export function senderConfig(): { keyPath: string | undefined; senderId: string } {
  return {
    keyPath: process.env.ORG_SENDER_KEY,
    senderId: process.env.ORG_SENDER_ID ?? "org-karoo-01",
  };
}

export async function signBody(body: string): Promise<string> {
  const { keyPath, senderId } = senderConfig();
  if (!keyPath) throw new Error("no sender key configured");
  const privateKey = await jose.importJWK(JSON.parse(readFileSync(keyPath, "utf8")), "ES256");
  return new jose.CompactSign(Buffer.from(body, "utf8"))
    .setProtectedHeader({ alg: "ES256", kid: senderId })
    .sign(privateKey);
}

export async function postSigned(url: string, body: string): Promise<Response> {
  const jws = await signBody(body);
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/jose" },
    body: jws,
  });
}

// The intake answers JSON in the normal case. A proxy or a misconfigured
// receiver can answer text, and reading it as JSON would throw after the
// regulator already accepted the draft. Keep the raw text in that case.
export async function receiptBody(answer: Response): Promise<unknown> {
  const text = await answer.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}
