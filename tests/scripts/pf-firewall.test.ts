import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("print shows default deny and the loopback ports", () => {
  const out = spawnSync("bash", ["scripts/pf-firewall.sh", "--print"], { encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /block drop in quick on !lo0 all/);
  assert.match(out.stdout, /cyberserious_bad/);
  for (const port of ["8100", "8101", "8200", "8443", "8444"]) {
    assert.match(out.stdout, new RegExp(port));
  }
});

test("an unknown command is refused", () => {
  const out = spawnSync("bash", ["scripts/pf-firewall.sh", "open-wide"], { encoding: "utf8" });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage/);
});

test("apply without the confirmation flag is refused before any change", () => {
  const out = spawnSync("bash", ["scripts/pf-firewall.sh", "apply"], { encoding: "utf8" });
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /root|--yes/);
});
