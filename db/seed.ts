import { createHash } from "node:crypto";
import pg from "pg";
import { hashPassword } from "../apps/regulator/server/passwords.ts";

const now = new Date(process.env.FIXTURE_NOW ?? "2026-10-13T08:00:00Z");
const day = 24 * 3600 * 1000;
const at = (daysAgo: number): string =>
  new Date(now.getTime() - daysAgo * day).toISOString();

const conn = new pg.Client({ connectionString: process.env.DATABASE_URL });
await conn.connect();

if (process.argv.includes("--reset")) {
  await conn.query("drop schema public cascade; create schema public;");
  const { execFileSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  execFileSync("node", [join(here, "..", "apps", "regulator", "server", "db", "migrate.ts")], {
    env: process.env,
    stdio: "inherit",
  });
}

const orgs = [
  { reference: "DEMO-ORG-01", display_name: "Karoo Retail Holdings", sector: "retail" },
  { reference: "DEMO-ORG-02", display_name: "Umhlanga Logistics", sector: "freight" },
  { reference: "DEMO-ORG-03", display_name: "Thabazimbi Health Group", sector: "health" },
];
const orgIds: Record<string, string> = {};
for (const org of orgs) {
  const row = await conn.query(
    `insert into organisations (reference, display_name, sector)
     values ($1, $2, $3)
     on conflict (reference) do update set display_name = excluded.display_name
     returning id`,
    [org.reference, org.display_name, org.sector]
  );
  orgIds[org.reference] = row.rows[0].id;
}

const seedUsers = [
  { username: "analyst1", display: "Regulator Analyst", secret: "demo-analyst-pass", role: "regulator_analyst", org: null as string | null },
  { username: "supervisor1", display: "Regulator Supervisor", secret: "demo-supervisor-pass", role: "regulator_supervisor", org: null },
  { username: "admin1", display: "System Administrator", secret: "demo-admin-pass", role: "system_administrator", org: null },
  { username: "io1", display: "Information Officer", secret: "demo-io-pass", role: "information_officer", org: "DEMO-ORG-01" },
  { username: "steward1", display: "Data Steward", secret: "demo-steward-pass", role: "data_steward", org: "DEMO-ORG-01" },
];
const userIds: Record<string, string> = {};
for (const seed of seedUsers) {
  const stored = await hashPassword(seed.secret);
  const row = await conn.query(
    `insert into users (username, display_name, password_hash)
     values ($1, $2, $3)
     on conflict (username) do update set password_hash = excluded.password_hash
     returning id`,
    [seed.username, seed.display, stored]
  );
  userIds[seed.username] = row.rows[0].id;
  await conn.query(
    `insert into memberships (user_id, org_id, role)
     values ($1, $2, $3)
     on conflict (user_id, org_id, role) do nothing`,
    [row.rows[0].id, seed.org ? orgIds[seed.org] : null, seed.role]
  );
}

const seedCases = [
  { ref: "BR-2026-0001", org: "DEMO-ORG-01", state: "UnderReview", severity: "high", priority: "urgent", days: 161, notified: true, occurred: "2026-05-04T10:00:00Z", occurredP: "date", discovered: "2026-05-05T08:30:00Z", discoveredP: "exact", count: 2450, countP: "exact", category: "unauthorised access" },
  { ref: "BR-2026-0002", org: "DEMO-ORG-02", state: "Closed", severity: "medium", priority: "routine", days: 175, notified: true, occurred: "2026-04-21T09:00:00Z", occurredP: "date", discovered: "2026-04-21T14:00:00Z", discoveredP: "date", count: 830, countP: "exact", category: "unauthorised access" },
  { ref: "BR-2026-0003", org: "DEMO-ORG-03", state: "Pending", severity: "high", priority: "urgent", days: 183, notified: true, occurred: "2026-04-12T09:00:00Z", occurredP: "approximate", discovered: "2026-04-13T10:00:00Z", discoveredP: "date", count: 5100, countP: "estimate", category: "data exposure" },
  { ref: "BR-2026-0004", org: "DEMO-ORG-01", state: "UnderReview", severity: "medium", priority: "urgent", days: 218, notified: true, occurred: "2026-03-08T09:00:00Z", occurredP: "date", discovered: "2026-03-09T11:00:00Z", discoveredP: "minute", count: 1120, countP: "estimate", category: "unauthorised access" },
  { ref: "BR-2026-0005", org: "DEMO-ORG-02", state: "Closed", severity: "medium", priority: "routine", days: 236, notified: true, occurred: "2026-02-18T09:00:00Z", occurredP: "date", discovered: "2026-02-19T08:00:00Z", discoveredP: "minute", count: 640, countP: "exact", category: "data exposure" },
  { ref: "BR-2026-0006", org: "DEMO-ORG-03", state: "UnderReview", severity: "high", priority: "urgent", days: 250, notified: true, occurred: "2026-02-04T09:00:00Z", occurredP: "approximate", discovered: "2026-02-05T15:00:00Z", discoveredP: "minute", count: null as number | null, countP: "unknown", category: "unauthorised access" },
  { ref: "BR-2026-0007", org: "DEMO-ORG-01", state: "AwaitingInformation", severity: "medium", priority: "routine", days: 258, notified: false, occurred: "2026-01-27T09:00:00Z", occurredP: "approximate", discovered: null as string | null, discoveredP: "unknown", count: 210, countP: "range", category: "data exposure" },
];

const caseIds: Record<string, string> = {};
for (const seed of seedCases) {
  const closed = seed.state === "Closed";
  const row = await conn.query(
    `insert into cases (reference, org_id, state, severity, priority, opened_at, closed_at, closure_reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (reference) do update set state = excluded.state
     returning id`,
    [seed.ref, orgIds[seed.org], seed.state, seed.severity, seed.priority,
     at(seed.days), closed ? at(seed.days - 7) : null,
     closed ? "Review finished. Outcome recorded on the case." : null]
  );
  caseIds[seed.ref] = row.rows[0].id;
  await conn.query(
    `insert into case_facts (case_id, incident_occurred_at, occurred_precision,
       discovered_at, discovered_precision, discovery_source, triaged_at,
       breach_status, category, affected_count, count_precision,
       data_categories, narrative)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (case_id) do update set incident_occurred_at = excluded.incident_occurred_at`,
    [row.rows[0].id, seed.occurred, seed.occurredP, seed.discovered, seed.discoveredP,
     "organisation report", at(seed.days - 1), "reported", seed.category,
     seed.count, seed.countP, ["names", "contact information"],
     `Synthetic fixture for ${seed.ref}. No real persons are involved.`]
  );
  if (seed.notified) {
    const note = await conn.query(
      `insert into notifications (case_id, sender_org_id, channel, first_received_at)
       values ($1, $2, 'manual_import', $3)
       on conflict do nothing returning id`,
      [row.rows[0].id, orgIds[seed.org], at(seed.days - 1)]
    );
    let noteId: string;
    if (note.rows.length > 0) {
      noteId = note.rows[0].id;
    } else {
      const found = await conn.query(
        "select id from notifications where case_id = $1", [row.rows[0].id]);
      noteId = found.rows[0].id;
    }
    const body = JSON.stringify({ reference: seed.ref, channel: "manual_import" });
    const hash = createHash("sha256").update(body).digest("hex");
    await conn.query(
      `insert into notification_versions (notification_id, revision, payload, payload_hash, received_at)
       values ($1, 1, $2::jsonb, $3, $4)
       on conflict (notification_id, revision) do nothing`,
      [noteId, body, hash, at(seed.days - 1)]
    );
  }
}

const seedAlerts = [
  { ref: "BR-2026-0001", rule: "RULE-01", version: 1, priority: "high", reason: "High severity case opened within the review window." },
  { ref: "BR-2026-0003", rule: "RULE-03", version: 1, priority: "medium", reason: "Affected count is an estimate. Exact scope still open." },
  { ref: "BR-2026-0006", rule: "RULE-04", version: 1, priority: "high", reason: "Affected count unknown. Scope must be confirmed." },
];
for (const seed of seedAlerts) {
  const input = `${seed.rule}:v${seed.version}:${seed.ref}`;
  const hash = createHash("sha256").update(input).digest("hex");
  await conn.query(
    `insert into alerts (case_id, rule_id, rule_version, dedupe_key, priority, reason, input_hash, state)
     values ($1, $2, $3, $4, $5, $6, $7, 'open')
     on conflict (dedupe_key) do nothing`,
    [caseIds[seed.ref], seed.rule, seed.version, input, seed.priority, seed.reason, hash]
  );
}

const counts = await conn.query(
  `select (select count(*) from cases) as cases,
          (select count(*) from notifications) as notes,
          (select count(*) from alerts where state = 'open') as alerts`);
console.log(`seeded cases=${counts.rows[0].cases} notifications=${counts.rows[0].notes} alerts=${counts.rows[0].alerts}`);
await conn.end();
