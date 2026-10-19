# Where the project stands

Group 1, Eduvos ITNPA3. Last updated 19 October 2026. The upstream
prototype arrived on 15 October. The working system below grew from it
over four days.

## Done and proven

The prototype was corrected first: synthetic banners, a real not-found
state, badges bound to records, one case-state list, counts from one
definition each, text-only rendering, a single bootstrap, fictional
organisations and a rewritten introduction. That closed Gate A.

Then the backend. Postgres holds thirteen regulator migrations, two
organisation migrations, a deterministic seed and users across the roles
of D3 Table 6.2. Sign-in pairs passwords with console codes under
lockout and expiry. One permission gate guards every route. Notes,
transitions with conflict handling, assignments, imports with immutable
versions, a rules worker with six evaluated rules, alert actions, a
research register with sealed notes and duties on every case. That
closed Gate B.

Then the second system. The organisation portal drafts, approves at an
exact revision and hash, signs and sends. Signed intake verifies, claims
idempotency and receipts with the test label. That closed the Gate C
intake boxes.

Then the POPIA section 22 duty to the affected people. The information
officer records one dispatch per draft. The portal writes a delivery row
per person and two audit rows, then reports the counts to the regulator
as a signed notice. A claim wider than the recipient register is
refused. A shortfall raises one medium alert and the case page shows the
sent and total counts. Every label says recorded dispatch (lab
simulation).

Then the hardening and the stretch items. Evidence quarantine with
review and redacted exports. Security headers with a strict content
policy. Queue-aware health checks. Nightly checksummed backups with a
timed restore rehearsal. Runbooks with dated exercise notes. Keycloak
single sign-in under a local role map. Intake over mutual TLS. A
Suricata lab sensor with three rules, a fixture replay and a shipper to
the regulator inbox. The Wazuh manager cannot run on this arm64 host,
because the amd64 image exits 139 under emulation. That gap is recorded
in STATUS and docs/runbooks/sensor.md. No Wazuh claim is made.

The build stands at 118 automated tests and 11 browser flows, all
passing.

## What remains

The push waits on the owner naming the repository. The only configured
remote is the upstream prototype with its push URL disabled.

The disclosure wording for Deliverable 4 belongs to the whole group, not
to this log.

The Wazuh path waits for a linux/amd64 host. `scripts/wazuh.sh` carries
the steps.

A live demo rehearsal is a demo-time step: reseed both databases, start
the regulator, the organisation portal and the worker, and read the
one-time codes from the server terminals.

Standing rules: no pushes without a named target, every task logged,
local artifacts ignored, no personal details from the deliverable
documents committed.
