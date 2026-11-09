import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { query, withTransaction } from "./db.ts";
import { recordAuditTx, verifyChain } from "./audit.ts";
import { verifySecurityChain } from "./securitylog.ts";

export const CORRELATION_WINDOW = "10 minutes";
export const SENSOR_SILENCE_SECONDS = 15 * 60;
export const BACKUP_MAX_AGE_SECONDS = 36 * 60 * 60;

interface Candidate {
  rule: string;
  subject: string;
  priority: "low" | "medium" | "high";
  reason: string;
  bucket: string;
  standing?: boolean;
}

function bucketFor(now: Date, seconds = 600): string {
  return new Date(Math.floor(now.getTime() / (seconds * 1000)) * seconds * 1000).toISOString();
}

async function openCandidate(candidate: Candidate): Promise<number> {
  // A burst rule keeps one alert per window. A standing condition keeps one
  // alert per subject until someone resolves it, so a silent sensor does not
  // open a new alert every ten minutes.
  const dedupe = candidate.standing
    ? `${candidate.rule}:${candidate.subject}`
    : `${candidate.rule}:${candidate.subject}:${candidate.bucket}`;
  const inputHash = dedupe;
  return withTransaction(async (client) => {
    const done = await client.query(
      `insert into alerts (case_id, rule_id, rule_version, dedupe_key, priority, reason, input_hash, state)
       values (null, $1, 1, $2, $3, $4, $5, 'open')
       on conflict (dedupe_key) do update set
         last_seen_at = now(),
         reason = excluded.reason,
         state = case when alerts.state = 'resolved' then 'open' else alerts.state end,
         resolution = case when alerts.state = 'resolved' then null else alerts.resolution end
       returning (xmax = 0) as inserted`,
      [candidate.rule, dedupe, candidate.priority, candidate.reason, inputHash]
    );
    const inserted = Boolean(done.rows[0]?.inserted);
    if (inserted) {
      await recordAuditTx(client, {
        actor: "worker",
        action: "correlation.open",
        resource: candidate.rule,
        result: "ok",
        meta: { subject: candidate.subject },
      });
    }
    return inserted ? 1 : 0;
  });
}

function newestBackupAgeSeconds(root: string, now: Date): number | null {
  if (!existsSync(root)) return null;
  let newest = 0;
  for (const name of readdirSync(root)) {
    if (!name.endsWith(".age")) continue;
    const at = statSync(join(root, name)).mtimeMs;
    if (at > newest) newest = at;
  }
  if (newest === 0) return null;
  return Math.floor((now.getTime() - newest) / 1000);
}

export async function runCorrelation(now = new Date()): Promise<{ opened: number; rules: string[] }> {
  const candidates: Candidate[] = [];
  const bucket = bucketFor(now);

  const auth = await query(
    `select src, count(*)::int as n from security_events
      where kind = 'auth.failed' and src is not null
        and created_at > now() - interval '${CORRELATION_WINDOW}'
      group by src having count(*) >= 5`
  );
  for (const row of auth.rows) {
    candidates.push({
      rule: "AUTH-BURST",
      subject: String(row.src),
      priority: "high",
      reason: `${row.n} failed sign-ins from one address in ten minutes`,
      bucket,
    });
  }

  const rbac = await query(
    `select actor, count(*)::int as n from audit_events
      where result = 'denied' and created_at > now() - interval '${CORRELATION_WINDOW}'
      group by actor having count(*) >= 5`
  );
  for (const row of rbac.rows) {
    candidates.push({
      rule: "RBAC-PROBE",
      subject: String(row.actor),
      priority: "medium",
      reason: `${row.n} refused actions by one identity in ten minutes`,
      bucket,
    });
  }

  const extract = await query(
    `select actor, count(*)::int as n from audit_events
      where action = 'case.export' and result = 'ok'
        and created_at > now() - interval '${CORRELATION_WINDOW}'
      group by actor having count(*) >= 5`
  );
  for (const row of extract.rows) {
    candidates.push({
      rule: "EXTRACT-BURST",
      subject: String(row.actor),
      priority: "high",
      reason: `${row.n} case exports by one identity in ten minutes`,
      bucket,
    });
  }

  const securityChain = await verifySecurityChain();
  if (!securityChain.ok) {
    candidates.push({
      rule: "CHAIN-BREAK",
      subject: `security:${securityChain.brokenAt ?? "unknown"}`,
      priority: "high",
      reason: "security event chain failed verification",
      bucket,
      standing: true,
    });
  }
  const auditChain = await verifyChain();
  if (!auditChain.ok) {
    candidates.push({
      rule: "CHAIN-BREAK",
      subject: `audit:${auditChain.brokenAt ?? "unknown"}`,
      priority: "high",
      reason: "audit chain failed verification",
      bucket,
      standing: true,
    });
  }

  const dead = await query("select id, attempts from outbox_jobs where state = 'dead' order by id asc limit 20");
  for (const row of dead.rows) {
    candidates.push({
      rule: "DEAD-LETTER",
      subject: String(row.id),
      priority: "high",
      reason: `job ${row.id} stopped after ${row.attempts} attempts`,
      bucket,
      standing: true,
    });
  }

  const beats = await query(
    `select source, extract(epoch from (now() - last_seen_at))::int as age
       from security_heartbeats where last_seen_at < now() - ($1 || ' seconds')::interval`,
    [String(SENSOR_SILENCE_SECONDS)]
  );
  for (const row of beats.rows) {
    candidates.push({
      rule: "SENSOR-SILENT",
      subject: String(row.source),
      priority: "medium",
      reason: `${row.source} has been silent for ${row.age} seconds`,
      bucket,
      standing: true,
    });
  }

  const backupRoot = process.env.BACKUP_ROOT ?? "data/backups";
  const backupAge = newestBackupAgeSeconds(backupRoot, now);
  if (backupAge !== null && backupAge > BACKUP_MAX_AGE_SECONDS) {
    candidates.push({
      rule: "BACKUP-MISS",
      subject: "backup",
      priority: "high",
      reason: `newest sealed backup is ${backupAge} seconds old`,
      bucket,
      standing: true,
    });
  }

  let opened = 0;
  const rules: string[] = [];
  for (const candidate of candidates) {
    const count = await openCandidate(candidate);
    if (count > 0) {
      opened += 1;
      rules.push(candidate.rule);
    }
  }
  return { opened, rules };
}
