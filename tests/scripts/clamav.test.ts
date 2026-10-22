import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const CONF = "data/clamav/clamd.conf";
const SOCKET = "data/clamav/clamd.sock";

test("setup renders a private config with no placeholders", () => {
  const out = spawnSync("bash", ["scripts/clamav.sh", "setup"], { encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  const conf = readFileSync(CONF, "utf8");
  assert.doesNotMatch(conf, /@REPO@/);
  assert.match(conf, /LocalSocketMode 600/);
  assert.match(conf, /Foreground true/);
  assert.equal(statSync(CONF).mode & 0o777, 0o600);
});

test("an unknown command is refused", () => {
  const out = spawnSync("bash", ["scripts/clamav.sh", "quarantine-all"], { encoding: "utf8" });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage/);
});

test("the EICAR file is detected when the daemon is up", { skip: !existsSync(SOCKET) }, () => {
  const out = spawnSync("bash", ["scripts/clamav.sh", "test"], { encoding: "utf8" });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /Eicar-Test-Signature FOUND/);
  assert.match(out.stdout, /EICAR detected as expected/);
});
