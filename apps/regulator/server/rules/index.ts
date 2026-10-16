import { createHash } from "node:crypto";

export interface RuleInput {
  caseId: string;
  reference: string;
  state: string;
  severity: string | null;
  affectedCount: number | null;
  countPrecision: string;
  discoveredAt: string | null;
  discoveredPrecision: string;
  firstReceivedAt: string | null;
  narrative: string | null;
}

export interface RuleHit {
  ruleId: string;
  version: number;
  priority: "low" | "medium" | "high";
  reason: string;
  dedupeKey: string;
  inputHash: string;
}

function hashOf(input: RuleInput, ruleId: string, version: number): string {
  return createHash("sha256")
    .update([ruleId, version, input.caseId, input.severity ?? "", input.affectedCount ?? "",
      input.countPrecision, input.discoveredAt ?? "", input.firstReceivedAt ?? ""].join("|"))
    .digest("hex");
}

function hit(input: RuleInput, ruleId: string, priority: RuleHit["priority"], reason: string): RuleHit {
  const version = 1;
  return {
    ruleId,
    version,
    priority,
    reason,
    dedupeKey: `${ruleId}:v${version}:${input.caseId}`,
    inputHash: hashOf(input, ruleId, version),
  };
}

const INTERNAL = "internal timer, not a legal deadline";
const HOUR = 3600 * 1000;

export function ruleHighSeverity(input: RuleInput): RuleHit | null {
  if (input.severity !== "high" && input.severity !== "critical") return null;
  return hit(input, "RULE-01", "high",
    `Severity is recorded as ${input.severity} on ${input.reference}.`);
}

export function ruleLateSubmission(input: RuleInput): RuleHit | null {
  if (!input.firstReceivedAt || !input.discoveredAt) return null;
  const gap = new Date(input.firstReceivedAt).getTime() - new Date(input.discoveredAt).getTime();
  if (!(gap > 72 * HOUR)) return null;
  const days = Math.round(gap / (24 * HOUR));
  return hit(input, "RULE-02", "high",
    `Notification arrived about ${days} days after discovery on ${input.reference} (72h ${INTERNAL}).`);
}

export function ruleHighCount(input: RuleInput): RuleHit | null {
  if (input.affectedCount === null || input.affectedCount < 1000) return null;
  return hit(input, "RULE-03", "medium",
    `${input.affectedCount.toLocaleString("en-ZA")} people in scope on ${input.reference}. Count is ${input.countPrecision}.`);
}

export function ruleLackOfInformation(input: RuleInput): RuleHit | null {
  const gaps: string[] = [];
  if (input.affectedCount === null) gaps.push("affected count unknown");
  if (!input.discoveredAt || input.discoveredPrecision === "unknown") gaps.push("discovery time unknown");
  if (!input.narrative) gaps.push("no narrative recorded");
  if (gaps.length === 0) return null;
  return hit(input, "RULE-04", "high",
    `${input.reference} is missing ${gaps.join(", ")}. Scope must be confirmed.`);
}

export function ruleNoSubmission(input: RuleInput): RuleHit | null {
  if (input.firstReceivedAt || input.state === "Closed") return null;
  return hit(input, "RULE-05", "high",
    `An incident is on record for ${input.reference} with no linked notification.`);
}

export const RULES = [ruleHighSeverity, ruleLateSubmission, ruleHighCount, ruleLackOfInformation, ruleNoSubmission];

export function evaluateAll(input: RuleInput): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const rule of RULES) {
    const hit = rule(input);
    if (hit) hits.push(hit);
  }
  return hits;
}
