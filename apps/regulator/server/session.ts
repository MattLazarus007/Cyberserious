import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { query } from "./db.ts";

export const SESSION_COOKIE = "cs_sid";
const IDLE_MS = 15 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;

export interface Actor {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  role: string;
  orgId: string | null;
  mfaOk: boolean;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function sessionCookieHeader(sid: string): string {
  // Localhost runs plain http, so no Secure flag here. The TLS deployment sets it.
  return `${SESSION_COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function createSession(userId: string): Promise<string> {
  const sid = randomBytes(32).toString("hex");
  await query("insert into sessions (id, user_id) values ($1, $2)", [sid, userId]);
  return sid;
}

export async function destroySession(sid: string): Promise<void> {
  await query("delete from sessions where id = $1", [sid]);
}

export async function readSession(sid: string): Promise<Actor | null> {
  const found = await query(
    `select s.id, s.user_id, s.mfa_ok, s.created_at, s.last_seen_at,
            u.username, u.display_name, u.email, u.phone, u.enabled, m.role, m.org_id
       from sessions s
       join users u on u.id = s.user_id
       left join memberships m on m.user_id = u.id
      where s.id = $1`,
    [sid]
  );
  if (found.rows.length === 0) return null;
  const row = found.rows[0];
  const age = Date.now() - new Date(row.created_at).getTime();
  const idle = Date.now() - new Date(row.last_seen_at).getTime();
  if (age > ABSOLUTE_MS || idle > IDLE_MS) {
    await destroySession(sid);
    return null;
  }
  if (!row.enabled) return null;
  await query("update sessions set last_seen_at = now() where id = $1", [sid]);
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role,
    orgId: row.org_id,
    mfaOk: row.mfa_ok,
  };
}

export function sameCode(given: string, storedHex: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(storedHex);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function requireSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  const sid = readCookie(req, SESSION_COOKIE);
  if (!sid) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  const actor = await readSession(sid);
  if (!actor) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  (req as Request & { actor: Actor }).actor = actor;
  next();
}
