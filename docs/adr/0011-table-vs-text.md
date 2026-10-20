# ADR-0011: Where D3 Table 6.2 loses to D3 prose

Date: 2026-10-16. Owner: Group 1.

D3 section 2 says analysts add notes and investigate cases, but
Table 6.2 lists analysts as read-only. Prose wins for case work:
analysts may write notes and work alerts. Submitted evidence itself
stays immutable, so versions and receipts never change.

Audit reading sits with a separate audit_reviewer role. The table
lets the information officer read audit rows. Separation is stronger
when audit reads sit outside case work, so no case role reads the
chain except through this role.

A regulator_supervisor role exists for transitions and assignments.
The table has no such role. Case progress still needs an owner for
state moves and task assignment. That is the whole of the role,
nothing wider.
