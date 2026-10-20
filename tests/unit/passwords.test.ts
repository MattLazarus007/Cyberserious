import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../../apps/regulator/server/passwords.ts";

test("hash verifies and rejects", async () => {
  const stored = await hashPassword("demo-analyst-pass");
  assert.equal(await verifyPassword("demo-analyst-pass", stored), true);
  assert.equal(await verifyPassword("wrong", stored), false);
  assert.match(stored, /^scrypt\$/);
});

test("two hashes of one secret differ", async () => {
  const first = await hashPassword("demo-analyst-pass");
  const second = await hashPassword("demo-analyst-pass");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("demo-analyst-pass", second), true);
});
