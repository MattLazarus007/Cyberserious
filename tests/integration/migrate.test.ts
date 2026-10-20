import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const dbUrl = process.env.DATABASE_URL_TEST as string;

test("migrations create the core tables on a clean database", () => {
  assert.ok(dbUrl, "DATABASE_URL_TEST must be set");
  execFileSync("psql", [dbUrl, "-c",
    "drop schema public cascade; create schema public;"], { stdio: "pipe" });
  const out = execFileSync("node", ["apps/regulator/server/db/migrate.ts"], {
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
  });
  assert.match(out, /applied 001_core\.sql/);
  assert.match(out, /applied 004_work\.sql/);
  const tables = execFileSync("psql", [dbUrl, "-tAc",
    "select count(*) from information_schema.tables where table_schema='public'"],
    { encoding: "utf8" });
  assert.ok(Number(tables.trim()) >= 13, "expected at least 13 tables, got " + tables);
});
