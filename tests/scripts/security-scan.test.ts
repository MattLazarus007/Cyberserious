import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("the tool check names every scanner", () => {
  const out = spawnSync("bash", ["scripts/security-scan.sh", "--check-tools"], { encoding: "utf8" });
  for (const tool of ["gitleaks", "osv-scanner", "trivy", "semgrep"]) {
    assert.match(out.stdout, new RegExp(tool));
  }
  assert.equal(out.status, 0, "all four must be installed for a full run");
});

test("an unknown mode is refused", () => {
  const out = spawnSync("bash", ["scripts/security-scan.sh", "vibes"], { encoding: "utf8" });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage/);
});
