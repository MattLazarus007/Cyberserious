import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const service = "cyberserious-test";
const dir = mkdtempSync(join(tmpdir(), "cyberserious-seal-test-"));
const pub = join(dir, "backup.pub");
const plain = join(dir, "plain.txt");
const sealed = join(dir, "plain.txt.age");
const opened = join(dir, "opened.txt");
const env = { ...process.env, KEYCHAIN_SERVICE: service, BACKUP_PUB: pub };

function run(...args: string[]) {
  return spawnSync("bash", ["scripts/seal.sh", ...args], { encoding: "utf8", env });
}

test.before(() => {
  spawnSync("bash", ["scripts/keychain.sh", "delete", "backup-key"], { env, encoding: "utf8" });
});

test.after(() => {
  spawnSync("bash", ["scripts/keychain.sh", "delete", "backup-key"], { env, encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
});

test("a sealed file round trips and the plaintext is not in the ciphertext", () => {
  assert.equal(run("init").status, 0);
  assert.match(readFileSync(pub, "utf8"), /^age1/);
  writeFileSync(plain, "case notes that must stay private\n");
  assert.equal(run("seal", plain, sealed).status, 0);
  assert.notEqual(readFileSync(sealed).toString("binary"), readFileSync(plain, "utf8"));
  assert.equal(run("unseal", sealed, opened).status, 0);
  assert.equal(readFileSync(opened, "utf8"), readFileSync(plain, "utf8"));
});

test("init refuses to replace an existing identity", () => {
  const again = run("init");
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /already exists/);
});

test("an unknown command is refused", () => {
  const out = run("shred");
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage/);
});
