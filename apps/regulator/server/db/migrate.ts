import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "..", "..", "db", "migrations");

const conn = new pg.Client({ connectionString: process.env.DATABASE_URL });
await conn.connect();
await conn.query(`create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`);

const applied = new Set(
  (await conn.query("select name from schema_migrations")).rows.map((r) => r.name)
);

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  await conn.query("begin");
  try {
    await conn.query(sql);
    await conn.query("insert into schema_migrations (name) values ($1)", [file]);
    await conn.query("commit");
    console.log("applied", file);
  } catch (err) {
    await conn.query("rollback");
    console.error("failed", file, (err as Error).message);
    process.exitCode = 1;
    break;
  }
}
await conn.end();
