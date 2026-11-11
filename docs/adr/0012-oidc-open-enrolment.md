# ADR-0012: OIDC creates a local analyst for an unknown name

Date: 2026-11-09. Owner: Group 1.

A successful single sign-on with a name the local table does not hold creates one regulator analyst row with no organisation. A known name keeps its existing memberships and gets no second row.

The alternative is to refuse an unknown name and answer 403 at the callback. The lab keeps enrolment open because the group signs in with a shared test realm, and a refused first sign-in would block a marker who uses a different account. The local role map still decides what the new row may do, and the analyst grant is the smallest one in the table.

The check that protects this choice is the issuer and the client registration, not the name. Production would refuse an unknown name, or provision from a directory group. `apps/regulator/server/oidc.ts` names the insert in one place, and `tests/integration/oidc.test.ts` pins the current behaviour.
