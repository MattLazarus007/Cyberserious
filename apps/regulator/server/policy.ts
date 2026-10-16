export type Action =
  | "read_cases" | "read_case" | "write_note" | "transition_case"
  | "assign_case" | "read_audit" | "manage_users" | "import_record";

const GRANTS: Record<string, Action[]> = {
  regulator_analyst: ["read_cases", "read_case", "write_note", "import_record"],
  regulator_supervisor: ["read_cases", "read_case", "write_note", "transition_case", "assign_case", "import_record"],
  system_administrator: ["manage_users"],
  audit_reviewer: ["read_audit"],
  data_steward: [],
  security_officer: [],
  information_officer: [],
};

export function can(role: string | undefined, action: Action): boolean {
  if (!role) return false;
  return (GRANTS[role] ?? []).includes(action);
}
