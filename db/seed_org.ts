import pg from "pg";
import { hashPassword } from "../apps/regulator/server/passwords.ts";

const url = process.env.ORG_DATABASE_URL ?? process.env.DATABASE_URL;
const conn = new pg.Client({ connectionString: url });
await conn.connect();

if (process.argv.includes("--reset")) {
  await conn.query("drop schema public cascade; create schema public;");
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", ["apps/organisation/server/migrate.ts"], { env: process.env, stdio: "inherit" });
}

await conn.query(
  `insert into organisations (reference, display_name, sector)
   values ('DEMO-ORG-01', 'Karoo Retail Holdings', 'retail')
   on conflict (reference) do nothing`
);

const people = [
  { username: "steward1", display: "Data Steward", secret: "demo-steward-pass", role: "data_steward", email: "steward1@karoo-retail.example", phone: "+27 82 555 0105" },
  { username: "io1", display: "Information Officer", secret: "demo-io-pass", role: "information_officer", email: "io1@karoo-retail.example", phone: "+27 82 555 0104" },
  { username: "so1", display: "Security Officer", secret: "demo-so-pass", role: "security_officer", email: "so1@karoo-retail.example", phone: "+27 82 555 0107" },
];
const { seal: sealContact } = await import("../apps/regulator/server/encrypt.ts");
// Contact detail reuses RESEARCH_KEY so no new secret is needed.
let orgKey = process.env.RESEARCH_KEY ?? null;
if (!orgKey) {
  const { randomBytes: randBytes } = await import("node:crypto");
  orgKey = randBytes(32).toString("hex");
  console.log("note: RESEARCH_KEY unset, sealed contact detail uses an ephemeral key for this run");
}
for (const person of people) {
  const stored = await hashPassword(person.secret);
  const row = await conn.query(
    `insert into users (username, display_name, password_hash, email, phone, email_sealed, phone_sealed)
     values ($1, $2, $3, null, null, $4, $5) on conflict (username) do update set password_hash = excluded.password_hash, email = null, phone = null, email_sealed = excluded.email_sealed, phone_sealed = excluded.phone_sealed returning id`,
    [person.username, person.display, stored, sealContact(person.email, orgKey as string), sealContact(person.phone, orgKey as string)]
  );
  await conn.query(
    `insert into memberships (user_id, org_id, role)
     values ($1, (select id from organisations where reference = 'DEMO-ORG-01'), $2)
     on conflict (user_id, org_id, role) do nothing`,
    [row.rows[0].id, person.role]
  );
}

const counts = await conn.query("select (select count(*) from users) as users, (select count(*) from drafts) as drafts");
console.log(`org seeded users=${counts.rows[0].users} drafts=${counts.rows[0].drafts}`);
await conn.end();
