import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("the Caddyfile validates", () => {
  const out = spawnSync("bash", ["scripts/caddy.sh", "validate"], { encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout + out.stderr, /Valid configuration/);
});

test("the proxy targets loopback and sets transport headers", () => {
  const conf = readFileSync("infra/caddy/Caddyfile", "utf8");
  assert.match(conf, /reverse_proxy 127\.0\.0\.1:8100/);
  assert.match(conf, /Strict-Transport-Security/);
  assert.match(conf, /max_size 12MB/);
});

test("an unknown command is refused", () => {
  const out = spawnSync("bash", ["scripts/caddy.sh", "open"], { encoding: "utf8" });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage/);
});
