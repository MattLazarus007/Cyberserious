import { query } from "./db.ts";

const REFRESH_MS = 30_000;
let cached = new Set<string>();
let loadedAt = 0;

export function resetBanCache(): void {
  cached = new Set();
  loadedAt = 0;
}

function normalize(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export async function refreshBans(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < REFRESH_MS) return;
  const rows = await query(
    "select ip from banned_ips where expires_at is null or expires_at > now()"
  );
  cached = new Set(rows.rows.map((row) => row.ip as string));
  loadedAt = Date.now();
}

export async function isBanned(ip: string): Promise<boolean> {
  await refreshBans();
  return cached.has(normalize(ip));
}

export async function banIp(
  ip: string,
  reason: string,
  actor: string,
  minutes = 60
): Promise<void> {
  const expires = minutes > 0 ? new Date(Date.now() + minutes * 60_000) : null;
  await query(
    `insert into banned_ips (ip, reason, banned_by, expires_at)
     values ($1, $2, $3, $4)
     on conflict (ip) do update set reason = excluded.reason, banned_by = excluded.banned_by,
       banned_at = now(), expires_at = excluded.expires_at`,
    [normalize(ip), reason, actor, expires]
  );
  await refreshBans(true);
}

export async function unbanIp(ip: string): Promise<boolean> {
  const done = await query("delete from banned_ips where ip = $1 returning ip", [normalize(ip)]);
  await refreshBans(true);
  return done.rows.length > 0;
}

export async function listBans(): Promise<Array<{ ip: string; reason: string; bannedAt: string; expiresAt: string | null }>> {
  const rows = await query(
    `select ip, reason, banned_at as "bannedAt", expires_at as "expiresAt"
       from banned_ips where expires_at is null or expires_at > now() order by banned_at desc`
  );
  return rows.rows.map((row) => ({
    ip: row.ip,
    reason: row.reason,
    bannedAt: new Date(row.bannedAt).toISOString(),
    expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
  }));
}
