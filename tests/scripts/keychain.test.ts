import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const KEYCHAIN_SERVICE = "cyberserious-test";
const name = `roundtrip-${process.pid}`;

function run(...args: string[]) {
  return spawnSync("bash", ["scripts/keychain.sh", ...args], {
    encoding: "utf8",
    env: { ...process.env, KEYCHAIN_SERVICE },
  });
}

test("a generated secret round trips and is removed", () => {
  const generated = run("generate", name);
  assert.equal(generated.status, 0, generated.stderr);

  const exists = run("exists", name);
  assert.equal(exists.status, 0);

  const value = run("get", name);
  assert.equal(value.status, 0);
  assert.match(value.stdout.trim(), /^[0-9a-f]{64}$/);

  const removed = run("delete", name);
  assert.equal(removed.status, 0);
  assert.notEqual(run("exists", name).status, 0);
});

test("an empty secret is refused", () => {
  const out = spawnSync("bash", ["scripts/keychain.sh", "set", `${name}-empty`], {
    input: "",
    encoding: "utf8",
    env: { ...process.env, KEYCHAIN_SERVICE },
  });
  assert.notEqual(out.status, 0);
  assert.match(out.stderr, /empty secret/);
});
