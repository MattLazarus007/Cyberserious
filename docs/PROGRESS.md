# Where the project stands

Group 1, Eduvos ITNPA3. Last updated 9 November 2026.

The upstream prototype arrived on 15 October. The group rebuilt it into a
working regulator register and an organisation portal over the next four days.
The dashboard, the interface and the rest of the system came from the team. I
ran the November pass.

## How we built it

We corrected the prototype first. I removed the synthetic banners and added a
real not-found state. I bound the badges to records and kept one case-state
list. Each number now comes from one definition. I renamed the organisations to
fictional names and rewrote the introduction. That closed Gate A.

Then the backend. Postgres holds twenty regulator migrations and four
organisation migrations. A deterministic seed fills users across the roles of D3
Table 6.2.
Sign-in pairs passwords with console codes under lockout and expiry. One
permission gate guards every route. Case work covers notes, transitions with
optimistic locking and assignments. Imports keep immutable versions. A rules
worker evaluates six rules. Alert actions are audited. The research register
keeps sealed notes. Every case carries its duties. That closed Gate B.

Then the second system. The organisation portal drafts, approves at an exact
revision and hash, signs and sends. The regulator verifies the signature,
claims idempotency and returns a receipt. That closed the Gate C intake boxes.

The build also owes the affected people a notice under section 22. The
information officer records one dispatch per draft. The portal writes a
delivery row per person and two audit rows, then reports the counts to the
regulator as a signed notice. A claim wider than the recipient register is
refused. A shortfall raises one medium alert. Every label says recorded
dispatch (lab simulation).

## The security stack

After the first build the group installed a security stack. The edge has a two-stage
trip wire, per-address limits, bans and a WAF. Behind it run chained security
events, correlation alerts, heartbeats and a daily anchor. Retention and export
caps guard the data. Upload scanning sits in front of the evidence store.
Encrypted evidence and backups protect data at rest. Launchd supervises the
services. The console shows the state. One verifier command checks it all. Wazuh runs natively on arm64 with one manager and one agent. Keycloak
carries a realm TOTP policy for a marked user. osquery runs as a host inventory
with a heartbeat. The Docker lab brings up the two apps and the worker from one
compose file.

## Where it stands

The build stands at 202 automated tests and 12 browser flows, all passing.
Line coverage is 90.50 percent against a floor of 90. The live acceptance
sweep passes 36 checks on the host pair and 36 on the Docker pair.

## What remains

The push stays disabled until I ask for it. The remote guard is deliberate.

The disclosure wording for Deliverable 4 belongs to the whole group. I wrote a
draft in `~/cyberserious-notes/D4-DISCLOSURE-DRAFT.md` and a notice for the
three conflicts in `~/cyberserious-notes/GROUP-NOTICE.md`. Neither is a group
decision until the group confirms it.

The Wazuh cluster and indexer wait for a linux/amd64 host or a bigger lab.
`scripts/wazuh.sh` carries the steps.

The Keycloak `mfa1` enrolment needs an authenticator app. The realm already
requires it.

A live demo rehearsal is a demo-time step: reseed both databases, start the
regulator, the organisation portal and the worker. Read the one-time codes
from the server terminals. The Docker lab does the same work with one command.

Standing rules: no push without a named target, every task logged, local
artifacts ignored, no personal details from the deliverable documents
committed.
