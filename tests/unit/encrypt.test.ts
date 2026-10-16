import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal, open } from "../../apps/regulator/server/encrypt.ts";

const key = randomBytes(32).toString("hex");

test("sealed detail opens with the same key", () => {
  const sealed = seal("field notes from the transcript", key);
  assert.equal(open(sealed, key), "field notes from the transcript");
});

test("two seals of one note differ", () => {
  assert.notEqual(seal("same words", key), seal("same words", key));
});

test("a flipped byte fails the check", () => {
  const sealed = JSON.parse(seal("untouched", key)) as { data: string };
  const raw = Buffer.from(sealed.data, "base64");
  raw[0] = raw[0] ^ 1;
  sealed.data = raw.toString("base64");
  assert.throws(() => open(JSON.stringify(sealed), key));
});

test("the wrong key fails the check", () => {
  const sealed = seal("untouched", key);
  assert.throws(() => open(sealed, randomBytes(32).toString("hex")));
});
