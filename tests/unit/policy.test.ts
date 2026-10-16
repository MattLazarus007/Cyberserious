import test from "node:test";
import assert from "node:assert/strict";
import { can, type Action } from "../../apps/regulator/server/policy.ts";

const roles = [
  "regulator_analyst",
  "regulator_supervisor",
  "system_administrator",
  "audit_reviewer",
  "data_steward",
  "security_officer",
  "information_officer",
];
const actions: Action[] = [
  "read_cases", "read_case", "write_note", "transition_case",
  "assign_case", "read_audit", "manage_users", "import_record",
  "update_alert",
];

const expected: Record<string, Action[]> = {
  regulator_analyst: ["read_cases", "read_case", "write_note", "import_record", "update_alert"],
  regulator_supervisor: ["read_cases", "read_case", "write_note", "transition_case", "assign_case", "import_record", "update_alert"],
  system_administrator: ["manage_users"],
  audit_reviewer: ["read_audit"],
  data_steward: [],
  security_officer: [],
  information_officer: [],
};

test("full role by action matrix matches the permission table", () => {
  for (const role of roles) {
    for (const action of actions) {
      assert.equal(can(role, action), (expected[role] ?? []).includes(action), `${role} ${action}`);
    }
  }
});

test("headline denials hold", () => {
  assert.equal(can("system_administrator", "read_case"), false);
  assert.equal(can("regulator_analyst", "transition_case"), false);
  assert.equal(can("nobody_at_all", "read_cases"), false);
  assert.equal(can(undefined, "read_cases"), false);
});

test("D3 Table 6.2 in five rows: analyst reads, supervisor moves, admin manages, reviewer audits, org roles wait", () => {
  assert.equal(can("regulator_analyst", "read_cases"), true);
  assert.equal(can("regulator_analyst", "write_note"), true);
  assert.equal(can("regulator_supervisor", "transition_case"), true);
  assert.equal(can("regulator_supervisor", "assign_case"), true);
  assert.equal(can("system_administrator", "manage_users"), true);
  assert.equal(can("system_administrator", "read_cases"), false);
  assert.equal(can("audit_reviewer", "read_audit"), true);
  assert.equal(can("audit_reviewer", "read_case"), false);
  assert.equal(can("information_officer", "read_cases"), false);
});
