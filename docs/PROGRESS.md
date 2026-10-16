# Where the project stands

Group 1, Eduvos ITNPA3. Last updated 16 October 2026, after the
evening build session. The upstream prototype arrived on 15 October
and the working system below grew from it in two days.

## Done and proven

The prototype was corrected first: synthetic banners, a real
not-found state, badges bound to records, one case-state list,
counts from one definition each, text-only rendering, a single
bootstrap, fictional organisations and a rewritten introduction.
That closed Gate A.

Then the backend arrived. Postgres holds ten migration files of
schema, a deterministic seed and six users across two roles
families. Sign-in pairs passwords with console codes under lockout
and expiry. One permission gate guards every route. The four pages
read from the API with a login page beside them. Notes, transitions
with conflict handling, assignments, imports with immutable
versions, a rules worker with five evaluated rules, alert actions,
a research register with sealed notes and duties on every case.
That closed Gate B.

Then the second system. The organisation portal drafts, approves at
an exact revision and hash, signs and sends. Signed intake
verifies, claims idempotency and receipts with the test label. That
closed the Gate C intake boxes.

Then the hardening. Evidence quarantine with review and redacted
exports. Security headers with a strict content policy. Queue-aware
health checks. Nightly checksummed backups with a timed restore
rehearsal. Runbooks with dated exercise notes. Four green browser
flows. That leaves the build at 63 automated tests passing with two
honest gaps: assignment-scoped reads and managed identity sign-in.

## What remains

Stretch work waits for a group decision: Keycloak sign-in, intake
over mutual TLS and a lab sensor. The disclosure wording for
Deliverable 4 belongs to the whole group, not to this log. The
standing rules hold throughout: no pushes, every task logged,
local artifacts ignored, no personal details from the deliverable
documents committed.
