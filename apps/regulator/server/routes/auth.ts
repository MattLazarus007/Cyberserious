import { Router } from "express";
import type { Request, Response } from "express";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { query } from "../db.ts";
import { verifyPassword } from "../passwords.ts";
import { createSession, destroySession, readCookie, sameCode, sessionCookieHeader, clearCookieHeader, SESSION_COOKIE } from "../session.ts";
import { recordAudit } from "../audit.ts";
import { oidcEnabled, startOidc, handleCallback } from "../oidc.ts";

export const authRouter = Router();

// The identity provider calls back at the site root, not under
// /api/v1, so these two live on their own router. Both stay hidden
// until OIDC_ISSUER is set, the same way the group gate stays hidden.
export const oidcRouter = Router();

function guarded(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    handler(req, res).catch((err: unknown) => {
      console.error("[oidc] route failed", err);
      if (!res.headersSent) res.status(400).json({ error: "invalid sign-in" });
    });
  };
}

oidcRouter.get("/auth/oidc", guarded(startOidc));
oidcRouter.get("/auth/oidc/callback", guarded(handleCallback));

// shortcut: in-memory counters, fine for one lab server. A shared
// deployment would keep these in the database or the proxy.
const failures = new Map<string, number[]>();

function recentFailures(name: string): number[] {
  const cutoff = Date.now() - 15 * 60 * 1000;
  const kept = (failures.get(name) ?? []).filter((t) => t > cutoff);
  failures.set(name, kept);
  return kept;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function groupMatches(given: unknown): boolean {
  if (typeof given !== "string") return false;
  const expected = process.env.GROUP_PASSPHRASE;
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function simpleLogin(): boolean {
  return process.env.LAB_SIMPLE_LOGIN === "1";
}

authRouter.get("/auth-mode", (req, res) => {
  res.json({
    otpRequired: !simpleLogin(),
    groupOpen: process.env.GROUP_LOGIN === "1",
    oidcEnabled: oidcEnabled(),
  });
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  if (recentFailures(username).length >= 5) {
    res.status(429).json({ error: "too many attempts, try again later" });
    return;
  }
  const found = await query("select id, password_hash, enabled from users where username = $1", [username]);
  const row = found.rows[0];
  const ok = row && row.enabled && (await verifyPassword(password, row.password_hash));
  if (!ok) {
    recentFailures(username).push(Date.now());
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  failures.delete(username);
  const sid = await createSession(row.id);
  if (simpleLogin()) {
    await query("update sessions set mfa_ok = true where id = $1", [sid]);
    console.log(`[login] ${username} signed in without a code (lab simple sign-in)`);
    res.setHeader("Set-Cookie", sessionCookieHeader(sid));
    res.json({ ok: true, username });
    return;
  }
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await query(
    "update sessions set mfa_ok = false, otp_hash = $1, otp_expires_at = now() + interval '5 minutes', otp_attempts = 0 where id = $2",
    [hashCode(code), sid]
  );
  console.log(`[otp] code for ${username}: ${code} (5 min)`);
  res.setHeader("Set-Cookie", sessionCookieHeader(sid));
  res.json({ mfaRequired: true });
});

authRouter.post("/login/group", async (req, res) => {
  if (process.env.GROUP_LOGIN !== "1") {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (recentFailures("group").length >= 5) {
    await recordAudit({ actor: "group", action: "auth.group", resource: "group", result: "denied" });
    res.status(429).json({ error: "too many attempts, try again later" });
    return;
  }
  const { passphrase } = req.body ?? {};
  if (!groupMatches(passphrase)) {
    recentFailures("group").push(Date.now());
    await recordAudit({ actor: "group", action: "auth.group", resource: "group", result: "denied" });
    res.status(401).json({ error: "invalid credentials" });
    return;
  }
  failures.delete("group");
  await query(
    "insert into users (username, display_name, password_hash) values ('group', 'Group Sign-in', 'disabled-group-login') on conflict (username) do nothing"
  );
  const found = await query("select id from users where username = 'group'");
  const userId = found.rows[0].id;
  await query(
    "insert into memberships (user_id, org_id, role) values ($1, null, 'regulator_analyst') on conflict (user_id, org_id, role) do nothing",
    [userId]
  );
  const sid = await createSession(userId);
  await query("update sessions set mfa_ok = true where id = $1", [sid]);
  await recordAudit({ actor: "group", action: "auth.group", resource: "group", result: "ok" });
  console.log("[login] group sign-in used (shared credential)");
  res.setHeader("Set-Cookie", sessionCookieHeader(sid));
  res.json({ ok: true, username: "group" });
});

authRouter.post("/login/otp", async (req, res) => {
  const sid = readCookie(req, SESSION_COOKIE);
  if (!sid) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const { code } = req.body ?? {};
  if (typeof code !== "string") {
    res.status(401).json({ error: "invalid code" });
    return;
  }
  const found = await query(
    "select s.user_id, s.mfa_ok, s.otp_hash, s.otp_expires_at, s.otp_attempts, s.created_at, u.username from sessions s join users u on u.id = s.user_id where s.id = $1",
    [sid]
  );
  const row = found.rows[0];
  if (!row || row.mfa_ok) {
    res.status(401).json({ error: "invalid code" });
    return;
  }
  if (new Date(row.otp_expires_at).getTime() < Date.now() || row.otp_attempts >= 3) {
    await destroySession(sid);
    res.setHeader("Set-Cookie", clearCookieHeader());
    res.status(401).json({ error: "code expired" });
    return;
  }
  if (!row.otp_hash || !sameCode(hashCode(code.trim()), row.otp_hash)) {
    await query("update sessions set otp_attempts = otp_attempts + 1 where id = $1", [sid]);
    const left = 2 - row.otp_attempts;
    if (left <= 0) {
      await destroySession(sid);
      res.setHeader("Set-Cookie", clearCookieHeader());
    }
    res.status(401).json({ error: "invalid code" });
    return;
  }
  const { randomBytes } = await import("node:crypto");
  const fresh = randomBytes(32).toString("hex");
  await query(
    "insert into sessions (id, user_id, mfa_ok, created_at) values ($1, $2, true, $3)",
    [fresh, row.user_id, row.created_at]
  );
  await destroySession(sid);
  res.setHeader("Set-Cookie", sessionCookieHeader(fresh));
  res.json({ ok: true, username: row.username });
});

authRouter.post("/logout", async (req, res) => {
  const sid = readCookie(req, SESSION_COOKIE);
  if (sid) await destroySession(sid);
  res.setHeader("Set-Cookie", clearCookieHeader());
  res.json({ ok: true });
});
