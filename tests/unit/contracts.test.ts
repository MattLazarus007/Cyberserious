import test from "node:test";
import assert from "node:assert/strict";
import { caseStateSchema, noteInputSchema } from "../../packages/contracts/contracts.ts";

test("case states reject the legacy Alert value", () => {
  assert.equal(caseStateSchema.safeParse("Alert").success, false);
  assert.equal(caseStateSchema.safeParse("UnderReview").success, true);
});

test("notes need a body within bounds", () => {
  assert.equal(noteInputSchema.safeParse({ body: "" }).success, false);
  assert.equal(noteInputSchema.safeParse({ body: "x".repeat(4001) }).success, false);
  assert.equal(noteInputSchema.safeParse({ body: "called the IO" }).success, true);
});
