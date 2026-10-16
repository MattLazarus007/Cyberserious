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
  { username: "analyst1", display: "Regulator Analyst", secret: "demo-analyst-pass", role: "regulator_analyst", org: null as string | null, email: "analyst1@regulator.example", phone: "+27 82 555 0101" },
  { username: "supervisor1", display: "Regulator Supervisor", secret: "demo-supervisor-pass", role: "regulator_supervisor", org: null, email: "supervisor1@regulator.example", phone: "+27 82 555 0102" },
  { username: "admin1", display: "System Administrator", secret: "demo-admin-pass", role: "system_administrator", org: null, email: "admin1@regulator.example", phone: "+27 82 555 0103" },
  { username: "io1", display: "Information Officer", secret: "demo-io-pass", role: "information_officer", org: "DEMO-ORG-01", email: "io1@karoo-retail.example", phone: "+27 82 555 0104" },
  { username: "steward1", display: "Data Steward", secret: "demo-steward-pass", role: "data_steward", org: "DEMO-ORG-01", email: "steward1@karoo-retail.example", phone: "+27 82 555 0105" },
  { username: "so1", display: "Security Officer", secret: "demo-so-pass", role: "security_officer", org: "DEMO-ORG-01", email: "so1@karoo-retail.example", phone: "+27 82 555 0107" },
  { username: "reviewer1", display: "Audit Reviewer", secret: "demo-reviewer-pass", role: "audit_reviewer", org: null as string | null, email: "reviewer1@regulator.example", phone: "+27 82 555 0106" },
];
const userIds: Record<string, string> = {};
for (const seed of seedUsers) {
  const stored = await hashPassword(seed.secret);
  const row = await conn.query(
    `insert into users (username, display_name, password_hash, email, phone)
     values ($1, $2, $3, $4, $5)
     on conflict (username) do update set password_hash = excluded.password_hash, email = excluded.email, phone = excluded.phone
     returning id`,
    [seed.username, seed.display, stored, seed.email, seed.phone]
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
  { ref: "BR-2026-0004", org: "DEMO-ORG-01", state: "UnderReview", severity: "medium", priority: "urgent", days: 218, notified: true, occurred: "2026-03-08T09:00:00Z", occurredP: "date", discovered: "2026-03-01T09:00:00Z", discoveredP: "minute", count: 1120, countP: "estimate", category: "unauthorised access" },
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

const { evaluateAll } = await import("../apps/regulator/server/rules/index.ts");
for (const seed of seedCases) {
  if (seed.state === "Closed") continue;
  const received = seed.notified ? at(seed.days - 1) : null;
  const hits = evaluateAll({
    caseId: caseIds[seed.ref],
    reference: seed.ref,
    state: seed.state,
    severity: seed.severity,
    affectedCount: seed.count,
    countPrecision: seed.countP,
    discoveredAt: seed.discovered,
    discoveredPrecision: seed.discoveredP,
    firstReceivedAt: received,
    triagedAt: at(seed.days - 1),
    narrative: `Synthetic fixture for ${seed.ref}. No real persons are involved.`,
  });
  for (const hit of hits) {
    await conn.query(
      `insert into alerts (case_id, rule_id, rule_version, dedupe_key, priority, reason, input_hash, state)
       values ($1, $2, $3, $4, $5, $6, $7, 'open')
       on conflict (dedupe_key) do nothing`,
      [caseIds[seed.ref], hit.ruleId, hit.version, hit.dedupeKey, hit.priority, hit.reason, hit.inputHash]
    );
  }
}

const researchCases = [
  { reference: "RES-GP-01", name: "Gauteng Provincial Government", sector: "public", period: "Jan-May 2026",
    summary: "Provincial government data breach reported in March 2026, described in coverage as a multi-terabyte exposure. Studied for notification timing and public communication.",
    confidence: "medium" },
  { reference: "RES-SSA-01", name: "Statistics South Africa", sector: "public", period: "Jan-May 2026",
    summary: "Stats SA confirmed a data breach at the end of March 2026 with a reported ransom demand. Studied for regulator notification and continuity of a national data agency.",
    confidence: "medium" },
  { reference: "RES-SB-01", name: "Standard Bank", sector: "finance", period: "Jan-May 2026",
    summary: "Standard Bank incident with rolling data disclosures through April 2026 and regulator interest. Studied for supplement handling and customer notice at scale.",
    confidence: "medium" },
  { reference: "RES-LG-01", name: "Liberty Group", sector: "insurance", period: "Jan-May 2026",
    summary: "Liberty data breach discussed alongside the Standard Bank matter in April 2026 coverage. Studied for parallel-incident handling and corporate communication.",
    confidence: "medium" },
];
for (const row of researchCases) {
  await conn.query(
    `insert into research_cases (reference, name, sector, period, summary, confidence)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (reference) do update set summary = excluded.summary`,
    [row.reference, row.name, row.sector, row.period, row.summary, row.confidence]
  );
}

const { seal: sealDetail } = await import("../apps/regulator/server/encrypt.ts");
let labKey = process.env.RESEARCH_KEY ?? null;
if (!labKey) {
  const { randomBytes: randBytes } = await import("node:crypto");
  labKey = randBytes(32).toString("hex");
  console.log("note: RESEARCH_KEY unset, sealed source notes use an ephemeral key for this run");
}

const researchSources: Array<{ ref: string; title: string; outlet: string; on: string | null; confidence: string; note: string }> = [
  { ref: "RES-GP-01", title: "Gauteng was lucky with latest 3.8TB data breach, but the luck will run out", outlet: "Daily Maverick", on: "2026-03-17", confidence: "medium", note: "Single incident report for the Gauteng case study." },
  { ref: "RES-SSA-01", title: "Stats SA confirms data breach as hackers demand ransom", outlet: "ITWeb", on: "2026-03-30", confidence: "high", note: "Primary incident report for the Stats SA case study." },
  { ref: "RES-SB-01", title: "Standard Bank is discovering the extent of the cyberattack in the daily data dumps", outlet: "Daily Maverick", on: "2026-04-17", confidence: "high", note: "Rolling-disclosure pattern, informs supplement design." },
  { ref: "RES-SB-01", title: "An important data incident update", outlet: "Standard Bank", on: null, confidence: "high", note: "Organisation's own notice, informs the organisation-side workflow." },
  { ref: "RES-SB-01", title: "Full disclosure: watchdog wants answers on Standard Bank, Liberty data breach", outlet: "News24", on: "2026-04-09", confidence: "high", note: "Regulator interest covering both the bank and the insurer." },
  { ref: "RES-LG-01", title: "Liberty data breach underscores urgent need for corporate cybersecurity overhaul", outlet: "IOL", on: "2026-03-30", confidence: "medium", note: "Liberty incident coverage, exact figures need a second source." },
  { ref: "RES-GP-01", title: "Step-by-step guide: notification of personal data breaches in terms of section 22 of POPIA", outlet: "Information Regulator", on: "2025-05-01", confidence: "high", note: "Regulator guide behind the obligation table." },
  { ref: "RES-SSA-01", title: "Protection of Personal Information Act 4 of 2013", outlet: "Republic of South Africa", on: "2013-11-26", confidence: "high", note: "Section 22 wording behind every duty in the obligations table." },
  { ref: "RES-LG-01", title: "The NIST Cybersecurity Framework (CSF) 2.0", outlet: "NIST", on: "2024-02-26", confidence: "high", note: "Functions behind the finding labels." },
  { ref: "RES-SB-01", title: "The cyber threat landscape in South Africa: a 10-year review", outlet: "Pieterse, African Journal of Information and Communication", on: "2021-01-01", confidence: "low", note: "Background on local incident patterns." },
  { ref: "RES-GP-01", title: "An analysis of cyber-incidents in South Africa", outlet: "Van Niekerk, African Journal of Information and Communication", on: "2017-01-01", confidence: "low", note: "Background on incident analysis method." },
  { ref: "RES-GP-01", title: "Guidance module: notification of personal data breaches in terms of section 22 of POPIA", outlet: "Information Regulator", on: "2022-01-01", confidence: "high", note: "Earlier regulator module, source of the 72-hour guidance." },
  { ref: "RES-GP-01", title: "Incident response communication and data breach notification practice", outlet: "Issues in Information Systems", on: "2017-01-01", confidence: "low", note: "Background reading that supports the communication finding." },
];
for (const row of researchSources) {
  await conn.query(
    `insert into research_sources (case_ref, title, outlet, published_on, confidence, detail_sealed)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (case_ref, title) do nothing`,
    [row.ref, row.title, row.outlet, row.on, row.confidence, sealDetail(row.note, labKey as string)]
  );
}

const researchFindings: Array<{ ref: string; fn: string; finding: string; confidence: string }> = [
  { ref: "RES-GP-01", fn: "Detect", finding: "Exposure volume became clear through external reporting rather than a single internal announcement.", confidence: "medium" },
  { ref: "RES-GP-01", fn: "Respond", finding: "Public communication shaped the response narrative as much as the technical containment.", confidence: "medium" },
  { ref: "RES-SSA-01", fn: "Respond", finding: "Confirmation came with continuity pressure: a statistics agency must keep publishing while investigating.", confidence: "medium" },
  { ref: "RES-SSA-01", fn: "Recover", finding: "Ransom demands add a second decision track beside notification duties.", confidence: "low" },
  { ref: "RES-SB-01", fn: "Respond", finding: "Rolling disclosures fit the supplement model: each drop is a new immutable version, not an edit.", confidence: "high" },
  { ref: "RES-SB-01", fn: "Govern", finding: "Regulator questions followed within weeks, which sets the pace for analyst review.", confidence: "medium" },
  { ref: "RES-LG-01", fn: "Govern", finding: "Parallel incidents at two firms drew a joint regulatory response, not two separate ones.", confidence: "medium" },
  { ref: "RES-LG-01", fn: "Protect", finding: "Coverage points at corporate controls rather than a single missing patch.", confidence: "low" },
];
for (const row of researchFindings) {
  await conn.query(
    "insert into research_findings (case_ref, csf_function, finding, confidence) values ($1, $2, $3, $4) on conflict do nothing",
    [row.ref, row.fn, row.finding, row.confidence]
  );
}

await conn.query(
  `insert into policy_versions (version, body, effective_from)
   values (1, $1, '2026-05-01') on conflict (version) do nothing`,
  [`Incident notification policy v1. Any suspected compromise of personal information is reported internally within one working day. The information officer decides on regulator notification. Supplements go out as new versions with their own timestamps. Timings here pace our own work and state no legal deadline.`]
);

const duties = [
  { code: "S22-01", duty: "Notify the Information Regulator of a personal information breach", trigger: "reasonable grounds to believe personal information was accessed or acquired by an unauthorised person", timing: "as soon as reasonably possible. No fixed hour count in the Act." },
  { code: "S22-02", duty: "Notify the affected data subjects", trigger: "breach confirmed with identifiable affected persons", timing: "as soon as reasonably possible. Direct notice, or public notice where direct notice is impractical." },
  { code: "S22-03", duty: "Describe consequences, measures taken and recommendations in the notice", trigger: "any notification under S22-01 or S22-02", timing: "with the notice itself, updated by supplement where facts change." },
  { code: "S22-04", duty: "Preserve evidence for investigation", trigger: "any suspected breach from discovery onward", timing: "continuous until the case closes." },
];
for (const row of duties) {
  await conn.query(
    "insert into obligations (code, duty, trigger, timing_note) values ($1, $2, $3, $4) on conflict (code) do nothing",
    [row.code, row.duty, row.trigger, row.timing]
  );
}

for (const seed of seedCases) {
  const caseId = caseIds[seed.ref];
  const links: Array<{ code: string; status: string; note: string }> = [
    { code: "S22-01", status: seed.notified ? "attended" : "open", note: seed.notified ? "Notification on record." : "No notification linked yet." },
    { code: "S22-02", status: seed.state === "Closed" ? "attended" : "pending", note: "Subject notice tracked per case." },
    { code: "S22-03", status: seed.notified ? "attended" : "open", note: seed.notified ? "Content held in version 1." : "Content outstanding." },
    { code: "S22-04", status: "attended", note: "Evidence handling assumed from triage." },
  ];
  for (const link of links) {
    await conn.query(
      "insert into case_obligations (case_id, obligation_code, status, note) values ($1, $2, $3, $4) on conflict do nothing",
      [caseId, link.code, link.status, link.note]
    );
  }
}

const counts = await conn.query(
  `select (select count(*) from cases) as cases,
          (select count(*) from notifications) as notes,
          (select count(*) from alerts where state = 'open') as alerts,
          (select count(*) from research_sources) as sources`);
console.log(`seeded cases=${counts.rows[0].cases} notifications=${counts.rows[0].notes} alerts=${counts.rows[0].alerts} sources=${counts.rows[0].sources}`);
await conn.end();
