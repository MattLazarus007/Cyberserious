import { execFileSync } from "node:child_process";
import { orgApp } from "../../apps/organisation/server/index.ts";

export const orgDbUrl = process.env.ORG_DATABASE_URL_TEST as string;

process.env.DATABASE_URL = orgDbUrl;

export function resetOrgDb(): void {
  execFileSync("psql", [orgDbUrl, "-c", "drop schema public cascade; create schema public;"], { stdio: "pipe" });
  execFileSync("node", ["apps/organisation/server/migrate.ts"], {
    env: { ...process.env, ORG_DATABASE_URL: orgDbUrl, DATABASE_URL: orgDbUrl },
    stdio: "pipe",
  });
  execFileSync("node", ["db/seed_org.ts"], {
    env: { ...process.env, ORG_DATABASE_URL: orgDbUrl, DATABASE_URL: orgDbUrl },
    stdio: "pipe",
  });
}

export async function startOrgApp(): Promise<{ base: string; close: () => Promise<void> }> {
  const server = await new Promise<ReturnType<typeof orgApp.listen>>((resolve) => {
    const s = orgApp.listen(0, () => resolve(s));
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
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

export async function orgLogin(base: string, username: string, secret: string): Promise<string> {
  const res = await fetch(`${base}/api/v1/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: secret }),
  });
  if (res.status !== 200) throw new Error(`org login failed for ${username}: ${res.status}`);
  const cookie = takeCookie(res);
  const { createHash } = await import("node:crypto");
  const pg = (await import("pg")).default;
  const conn = new pg.Client({ connectionString: orgDbUrl });
  await conn.connect();
  await conn.query(
    "update sessions set otp_hash = $1, otp_expires_at = now() + interval '5 minutes', otp_attempts = 0 where id = $2",
    [createHash("sha256").update("123456").digest("hex"), cookie.split("=")[1]]
  );
  await conn.end();
  const otp = await fetch(`${base}/api/v1/login/otp`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ code: "123456" }),
  });
  if (otp.status !== 200) throw new Error(`org otp failed for ${username}: ${otp.status}`);
  return takeCookie(otp);
}
