import { z } from "zod";

export const caseStateSchema = z.enum(["Pending", "UnderReview", "AwaitingInformation", "Closed"]);

export const breachStatusSchema = z.enum(["suspected", "reported", "substantiated", "not_substantiated"]);

export const countPrecisionSchema = z.enum(["exact", "estimate", "range", "unknown"]);

export const alertStateSchema = z.enum(["open", "acknowledged", "snoozed", "resolved"]);

export const roleSchema = z.enum([
  "data_steward",
  "security_officer",
  "information_officer",
  "regulator_analyst",
  "regulator_supervisor",
  "system_administrator",
  "audit_reviewer",
]);

export const caseSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  orgName: z.string(),
  state: caseStateSchema,
  priority: z.string().nullable(),
  openedAt: z.string().datetime(),
});

export const noteInputSchema = z.object({
  body: z.string().min(1).max(4000),
});
