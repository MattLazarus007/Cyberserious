import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const runScrypt = promisify(scryptCb);

export async function hashPassword(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await runScrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 })) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const key = (await runScrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 })) as Buffer;
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}
