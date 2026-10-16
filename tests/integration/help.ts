import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import pg from "pg";
import { app } from "../../apps/regulator/server/index.ts";

export const dbUrl = process.env.DATABASE_URL_TEST as string;

// The server reads DATABASE_URL when it first queries. Point it at the
// test database before any test runs, so integration traffic never
// touches development data.
process.env.DATABASE_URL = dbUrl;

export function resetDb(): void {
  execFileSync("psql", [dbUrl, "-c", "drop schema public cascade; create schema public;"], { stdio: "pipe" });
  execFileSync("node", ["apps/regulator/server/db/migrate.ts"], {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });
  execFileSync("node", ["db/seed.ts"], {
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });
}

export interface TestApp {
  base: string;
  close: () => Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    base: `http://localhost:${port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((err: unknown) => (err ? reject(err) : resolve()));
    }),
  };
}

export function takeCookie(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw.split(";")[0];
}

export async function loginPassword(base: string, username: string, secret: string): Promise<string> {
  const res = await fetch(`${base}/api/v1/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: secret }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status}`);
  return takeCookie(res);
}

export async function fixOtp(cookie: string, code = "123456", minutes = 5): Promise<void> {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  const hash = createHash("sha256").update(code).digest("hex");
  await conn.query(
    `update sessions set otp_hash = $1, otp_expires_at = now() + ($2 || ' minutes')::interval, otp_attempts = 0
      where id = $3`,
    [hash, String(minutes), cookie.split("=")[1]]
  );
  await conn.end();
}

export async function loginFull(base: string, username: string, secret: string): Promise<string> {
  const cookie = await loginPassword(base, username, secret);
  await fixOtp(cookie);
  const res = await fetch(`${base}/api/v1/login/otp`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ code: "123456" }),
  });
  if (res.status !== 200) throw new Error(`otp step failed for ${username}: ${res.status}`);
  return takeCookie(res);
}
