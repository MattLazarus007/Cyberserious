import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const script = "scripts/install-security-tools.sh";

function run(args: string[], env: NodeJS.ProcessEnv = process.env) {
  return spawnSync("bash", [script, ...args], { encoding: "utf8", env });
}

test("the manifest lists the required security tools", () => {
  const out = run(["--list"]);
  assert.equal(out.status, 0);
  for (const name of ["clamav", "semgrep", "gitleaks", "trivy", "osv-scanner", "lynis", "caddy", "syft", "suricata"]) {
    assert.match(out.stdout, new RegExp(`^${name}\\s`, "m"));
  }
});

test("dry run prints an install command and changes nothing", () => {
  const out = run(["--dry-run"], { ...process.env, PATH: "/usr/bin:/bin" });
  assert.equal(out.status, 0);
  assert.match(out.stdout, /brew install/);
  assert.doesNotMatch(out.stdout, /^installing /m);
});

test("an unknown mode is refused", () => {
  const out = run(["--nonsense"]);
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage/);
});
