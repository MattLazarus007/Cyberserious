import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { query } from "./db.ts";

export interface AnchorRow {
  day: string;
  auditSeq: number;
  auditHash: string | null;
  securitySeq: number;
  securityHash: string | null;
  auditCount: number;
  securityCount: number;
  hmac: string;
}

function canonical(row: Omit<AnchorRow, "hmac">): string {
  return JSON.stringify([
    row.day,
    row.auditSeq,
    row.auditHash,
    row.securitySeq,
    row.securityHash,
    row.auditCount,
    row.securityCount,
  ]);
}

function sign(row: Omit<AnchorRow, "hmac">, key: string): string {
  return createHmac("sha256", key).update(canonical(row)).digest("hex");
}

let cachedKey: string | null = null;

export function readAnchorKey(): string {
  if (process.env.ANCHOR_KEY) return process.env.ANCHOR_KEY;
  if (cachedKey !== null) return cachedKey;
  try {
    cachedKey = execFileSync("bash", ["scripts/keychain.sh", "get", "anchor-key"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    cachedKey = "";
  }
  return cachedKey;
}

export async function currentHeads(day: string): Promise<Omit<AnchorRow, "hmac">> {
  const audit = await query(
    `select coalesce(max(seq), 0)::bigint as seq, count(*)::bigint as n,
            (select entry_hash from audit_events order by seq desc limit 1) as hash
       from audit_events`
  );
  const security = await query(
    `select coalesce(max(seq), 0)::bigint as seq, count(*)::bigint as n,
            (select entry_hash from security_events order by seq desc limit 1) as hash
       from security_events`
  );
  return {
    day,
    auditSeq: Number(audit.rows[0].seq),
    auditHash: (audit.rows[0].hash as string | null) ?? null,
    securitySeq: Number(security.rows[0].seq),
    securityHash: (security.rows[0].hash as string | null) ?? null,
    auditCount: Number(audit.rows[0].n),
    securityCount: Number(security.rows[0].n),
  };
}

export async function writeAnchor(key: string, day = new Date().toISOString().slice(0, 10)): Promise<AnchorRow> {
  if (!key) throw new Error("anchor key is missing");
  const heads = await currentHeads(day);
  const hmac = sign(heads, key);
  const done = await query(
    `insert into anchors (day, audit_seq, audit_hash, security_seq, security_hash, audit_count, security_count, hmac)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (day) do nothing
     returning day::text, audit_seq as "auditSeq", audit_hash as "auditHash",
               security_seq as "securitySeq", security_hash as "securityHash",
               audit_count as "auditCount", security_count as "securityCount", hmac`,
    [heads.day, heads.auditSeq, heads.auditHash, heads.securitySeq, heads.securityHash, heads.auditCount, heads.securityCount, hmac]
  );
  void done;
  const existing = await query(
    `select day::text, audit_seq::int as "auditSeq", audit_hash as "auditHash",
            security_seq::int as "securitySeq", security_hash as "securityHash",
            audit_count::int as "auditCount", security_count::int as "securityCount", hmac
       from anchors where day = $1`,
    [day]
  );
  return existing.rows[0] as AnchorRow;
}

export async function verifyAnchors(key: string): Promise<{ ok: boolean; checked: number; brokenDay?: string }> {
  const rows = await query(
    `select day::text, audit_seq as "auditSeq", audit_hash as "auditHash",
            security_seq as "securitySeq", security_hash as "securityHash",
            audit_count as "auditCount", security_count as "securityCount", hmac
       from anchors order by day asc`
  );
  for (const row of rows.rows as AnchorRow[]) {
    const expected = sign(
      {
        day: row.day,
        auditSeq: Number(row.auditSeq),
        auditHash: row.auditHash,
        securitySeq: Number(row.securitySeq),
        securityHash: row.securityHash,
        auditCount: Number(row.auditCount),
        securityCount: Number(row.securityCount),
      },
      key
    );
    if (expected !== row.hmac) return { ok: false, checked: rows.rows.length, brokenDay: row.day };
    if (Number(row.auditSeq) > 0) {
      const live = await query("select entry_hash from audit_events where seq = $1", [row.auditSeq]);
      if (live.rows.length === 0 || live.rows[0].entry_hash !== row.auditHash) {
        return { ok: false, checked: rows.rows.length, brokenDay: row.day };
      }
    }
    if (Number(row.securitySeq) > 0) {
      const live = await query("select entry_hash from security_events where seq = $1", [row.securitySeq]);
      if (live.rows.length === 0 || live.rows[0].entry_hash !== row.securityHash) {
        return { ok: false, checked: rows.rows.length, brokenDay: row.day };
      }
    }
  }
  return { ok: true, checked: rows.rows.length };
}

export async function anchorIfDue(key = readAnchorKey()): Promise<boolean> {
  if (!key) return false;
  const day = new Date().toISOString().slice(0, 10);
  const exists = await query("select 1 from anchors where day = $1", [day]);
  if (exists.rows.length > 0) return false;
  await writeAnchor(key, day);
  return true;
}
