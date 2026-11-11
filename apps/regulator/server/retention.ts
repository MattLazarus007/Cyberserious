import { query, withTransaction } from "./db.ts";

const securityDays = Number(process.env.SECURITY_EVENT_DAYS ?? 90);
export const SECURITY_EVENT_DAYS = Math.max(30, Number.isFinite(securityDays) ? securityDays : 90);
export const RESOLVED_ALERT_DAYS = 180;
export const DEAD_JOB_DAYS = 30;

export interface SweepResult {
  sessions: number;
  alerts: number;
  jobs: number;
  securityEvents: number;
}

export async function sweepRetention(): Promise<SweepResult> {
  return withTransaction(async (client) => {
    const sessions = await client.query(
      `delete from sessions
        where created_at < now() - interval '12 hours'
           or last_seen_at < now() - interval '30 minutes'`
    );
    const alerts = await client.query(
      `delete from alerts
        where state = 'resolved' and last_seen_at < now() - ($1 || ' days')::interval`,
      [String(RESOLVED_ALERT_DAYS)]
    );
    const jobs = await client.query(
      `delete from outbox_jobs
        where state in ('done','failed','dead') and next_attempt_at < now() - ($1 || ' days')::interval`,
      [String(DEAD_JOB_DAYS)]
    );
    // Security events are hash chained. Removing a row would break every later
    // link, so the sweep reports the count that is older than the window and
    // leaves deletion to the anchor archive. Audit events are never deleted.
    const security = await client.query(
      `select count(*)::int as n from security_events
        where created_at < now() - ($1 || ' days')::interval`,
      [String(SECURITY_EVENT_DAYS)]
    );
    return {
      sessions: sessions.rowCount ?? 0,
      alerts: alerts.rowCount ?? 0,
      jobs: jobs.rowCount ?? 0,
      securityEvents: security.rows[0].n as number,
    };
  });
}
