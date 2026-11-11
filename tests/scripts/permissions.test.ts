import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("sourcing env.sh sets a private umask", () => {
  const out = spawnSync("bash", ["-c", "source scripts/env.sh && umask"], { encoding: "utf8" });
  assert.equal(out.status, 0);
  assert.equal(out.stdout.trim(), "0077");
});
