import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAll, ruleLateSubmission, ruleTriageClock, type RuleInput } from "../../apps/regulator/server/rules/index.ts";

function base(over: Partial<RuleInput> = {}): RuleInput {
  return {
    caseId: "case-1",
    reference: "BR-2026-0001",
    state: "UnderReview",
    severity: "medium",
    affectedCount: 100,
    countPrecision: "exact",
    discoveredAt: "2026-05-01T08:00:00Z",
    discoveredPrecision: "exact",
    firstReceivedAt: "2026-05-02T08:00:00Z",
    triagedAt: null,
    narrative: "a narrative",
    ...over,
  };
}

test("quiet cases raise nothing", () => {
  assert.deepEqual(evaluateAll(base()), []);
});

test("high severity raises RULE-01", () => {
  const hits = evaluateAll(base({ severity: "high", affectedCount: 10 }));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].ruleId, "RULE-01");
  assert.equal(hits[0].priority, "high");
});

test("late arrival names the internal timer", () => {
  const hit = ruleLateSubmission(base({ discoveredAt: "2026-05-01T08:00:00Z", firstReceivedAt: "2026-05-05T08:00:00Z" }));
  assert.ok(hit);
  assert.match(hit!.reason, /internal timer/);
  assert.equal(ruleLateSubmission(base()), null);
});

test("big counts raise RULE-03, unknown counts raise RULE-04", () => {
  const big = evaluateAll(base({ affectedCount: 5100, countPrecision: "estimate" }));
  assert.ok(big.some((h) => h.ruleId === "RULE-03"));
  const thin = evaluateAll(base({ affectedCount: null, countPrecision: "unknown" }));
  assert.ok(thin.some((h) => h.ruleId === "RULE-04"));
});

test("a signal with no notification raises RULE-05 unless closed", () => {
  const hits = evaluateAll(base({ firstReceivedAt: null, state: "AwaitingInformation" }));
  assert.ok(hits.some((h) => h.ruleId === "RULE-05"));
  const closed = evaluateAll(base({ firstReceivedAt: null, state: "Closed" }));
  assert.ok(!closed.some((h) => h.ruleId === "RULE-05"));
});

test("dedupe keys are stable per rule and case", () => {
  const [first] = evaluateAll(base({ severity: "critical", affectedCount: 5 }));
  const [second] = evaluateAll(base({ severity: "critical", affectedCount: 5 }));
  assert.equal(first.dedupeKey, second.dedupeKey);
  assert.equal(first.inputHash, second.inputHash);
});

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

test("triage over 72h with no notice raises RULE-06", () => {
  const input = base({ triagedAt: hoursAgo(80), firstReceivedAt: null, state: "UnderReview" });
  const hit = ruleTriageClock(input);
  assert.ok(hit);
  assert.equal(hit!.ruleId, "RULE-06");
  assert.equal(hit!.priority, "high");
  assert.match(hit!.reason, /triage clock/i);
  assert.match(hit!.reason, /internal timer/);
  assert.ok(evaluateAll(input).some((h) => h.ruleId === "RULE-06"));
});

test("triage at 48h nudges the information officer", () => {
  const input = base({ triagedAt: hoursAgo(50), firstReceivedAt: null, state: "UnderReview" });
  const hit = ruleTriageClock(input);
  assert.ok(hit);
  assert.equal(hit!.ruleId, "RULE-06");
  assert.equal(hit!.priority, "medium");
  assert.match(hit!.reason, /48 hours/);
  assert.match(hit!.reason, /Information Officer/);
  assert.match(hit!.reason, /internal timer/);
});

test("unknown triage time invents no clock", () => {
  const input = base({ triagedAt: null, firstReceivedAt: null, state: "AwaitingInformation" });
  assert.equal(ruleTriageClock(input), null);
  assert.ok(!evaluateAll(input).some((h) => h.ruleId === "RULE-06"));
});

test("notified cases never get RULE-06", () => {
  const triaged = hoursAgo(80);
  const input = base({ triagedAt: triaged, firstReceivedAt: new Date().toISOString(), state: "UnderReview" });
  assert.equal(ruleTriageClock(input), null);
  assert.ok(!evaluateAll(input).some((h) => h.ruleId === "RULE-06"));
});
