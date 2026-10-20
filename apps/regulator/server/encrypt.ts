import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export function seal(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("research key must be 32 bytes in hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: body.toString("base64"),
  });
}

export function open(sealed: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) throw new Error("research key must be 32 bytes in hex");
  const parts = JSON.parse(sealed) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parts.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function researchKey(): string | null {
  const key = process.env.RESEARCH_KEY;
  if (!key) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error("RESEARCH_KEY must be 64 hex characters");
  return key;
}
