import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("vault status reports not mounted without creating anything", () => {
  const out = spawnSync("bash", ["scripts/vault.sh", "status"], {
    encoding: "utf8",
    env: { ...process.env, VAULT_MOUNT: "/tmp/cyberserious-vault-absent" },
  });
  assert.equal(out.status, 1);
  assert.match(out.stdout, /not mounted/);
});

test("an unknown vault command is refused", () => {
  const out = spawnSync("bash", ["scripts/vault.sh", "nonsense"], { encoding: "utf8" });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage/);
});
