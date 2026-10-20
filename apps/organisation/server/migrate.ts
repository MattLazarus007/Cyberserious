import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const sources = [
  join(root, "db", "migrations", "001_core.sql"),
  join(root, "db", "migrations", "005_session_mfa.sql"),
  join(root, "db", "migrations", "011_user_contact.sql"),
  join(root, "db", "migrations", "012_sealed_contact.sql"),
  ...readdirSync(join(root, "db", "org-migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(root, "db", "org-migrations", f)),
];

const conn = new pg.Client({ connectionString: process.env.ORG_DATABASE_URL ?? process.env.DATABASE_URL });
await conn.connect();
await conn.query(`create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`);
const applied = new Set(
  (await conn.query("select name from schema_migrations")).rows.map((r) => r.name)
);
for (const file of sources) {
  const name = file.split("/").slice(-2).join("/");
  if (applied.has(name)) continue;
  await conn.query("begin");
  try {
    await conn.query(readFileSync(file, "utf8"));
    await conn.query("insert into schema_migrations (name) values ($1)", [name]);
    await conn.query("commit");
    console.log("applied", name);
  } catch (err) {
    await conn.query("rollback");
    console.error("failed", name, (err as Error).message);
    process.exitCode = 1;
    break;
  }
}
await conn.end();
