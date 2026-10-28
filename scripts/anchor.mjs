#!/usr/bin/env node
// Write today's anchor, verify existing anchors, or both.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { readAnchorKey, verifyAnchors, writeAnchor } from "../apps/regulator/server/anchor.ts";
import { closePool } from "../apps/regulator/server/db.ts";

const key = readAnchorKey();
if (!key) {
  console.error("anchor key is missing; run bash scripts/keychain.sh set anchor-key --generate");
  process.exit(1);
}

const mode = process.argv[2] ?? "--write";
if (mode === "--verify") {
  const result = await verifyAnchors(key);
  console.log(JSON.stringify(result));
  await closePool();
  process.exit(result.ok ? 0 : 1);
}

const row = await writeAnchor(key);
const dir = process.env.ANCHOR_DIR ?? "data/anchors";
mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = join(dir, `${row.day}.json`);
writeFileSync(file, JSON.stringify(row, null, 2) + "\n", { mode: 0o600 });
chmodSync(file, 0o600);
try {
  execFileSync("chflags", ["schg", file]);
  console.log(`anchored ${row.day} and marked ${file} immutable`);
} catch {
  try {
    execFileSync("chflags", ["uchg", file]);
    console.log(`anchored ${row.day} and marked ${file} user immutable`);
  } catch {
    console.log(`anchored ${row.day}; immutable flag could not be set on ${file}`);
  }
}
await closePool();
