# CyberSerious brief

This is the one document to read if the project is new to you. It explains what
the system is for, who uses it, what happens to one report, and what a marker is
likely to ask. Every claim here can be checked in the files named along the way.

## 1. What this project is

CyberSerious is a lab implementation of one legal duty. When personal
information is compromised, a South African organisation must tell the
Information Regulator and the people whose information was exposed. The system
has two sides. An organisation writes a report, approves it and sends it. The
regulator receives it, opens a case, checks it against internal rules and
records what happens next. The organisation also records a notice to every
affected person and reports the counts back.

The project was built by Group 1 for the Eduvos ITNPA3 module. It is a working
system, not a set of screens. Reports are signed, cases persist, counts add up
and every important write is recorded. All records are synthetic. The official
channel for a real report is the Regulator's eServices Portal, and the system
says so on every receipt.

## 2. The law in plain words

Section 22 of the Protection of Personal Information Act deals with a
compromise of personal information. In plain words, the organisation responsible
for the information must tell two parties. It must notify the Information
Regulator. It must also notify the affected data subjects. The law expects this
as soon as reasonably possible after the compromise is discovered.

That duty is mostly a paper trail. Someone discovers an incident, writes down
what happened, gets approval from the right person, sends the notification,
keeps proof of sending, and answers follow-up questions. A quick demo that only
shows a dashboard cannot support that trail. It stores nothing and proves
nothing. CyberSerious turns the trail into two connected applications.

The system does not give legal advice and never calls a case compliant. It
records what people did and when they did it. A human reads the facts and makes
the finding. Internal timers are labelled as internal and never as legal
deadlines.

## 3. The two systems and the people who use them

| Side | Address | Accounts | Job |
|---|---|---|---|
| Regulator workspace | http://localhost:8100 | analyst1, supervisor1, reviewer1, admin1 | triage, notes, transitions, audit, alerts |
| Organisation portal | http://localhost:8200 | steward1, io1, so1 | draft, approve, sign, send, notify |
| Rules worker | no address | none | leases outbox jobs, evaluates the rules, opens alerts |

The two applications keep separate databases. The regulator database holds
cases, alerts and the audit chain. The portal database holds drafts, synthetic
recipients and dispatch runs. The only bridge is the signed intake endpoint.
The portal signs a report with a private key. The regulator verifies it with the
matching public key from its sender registry.

Four roles work on the regulator side. An analyst reads cases, writes notes and
works alerts. A supervisor also moves cases through the lifecycle and assigns
them to analysts. An audit reviewer reads the hash-chained audit trail and
nothing else. A system administrator manages accounts and has no access to case
content. Three roles work on the portal side. A data steward writes drafts. An
information officer approves, signs, sends and records the affected-person
notice. A security officer can draft and read.

Every account and every sign-in path is listed in README.md. That file is the
single place for passwords, the group passphrase, the Keycloak users and the
machine channels.

## 4. One incident from start to finish

The following is one complete run through both systems. The numbers come from
the seeded demo, and the screens and endpoints are real.

A data steward signs in to the portal and opens `drafts.html`. The steward
writes the report: a category, a narrative, and 25 affected people. The draft is
saved with revision 1. The steward sends it for approval.

The information officer signs in, opens the same draft and approves it. The
approval binds that exact revision and a hash of its fields. If anyone edits the
draft after approval, the hash no longer matches and the approval is cleared.

The officer clicks Sign and send. The portal builds the canonical report and
signs it with the organisation's private key. It posts a JWS to
`POST /intake/v1/submissions` on port 8100. The regulator verifies the signature
over the exact bytes before it parses anything. It then writes a case, the
incident facts, a notification, the first immutable version, a receipt, an audit
row and an outbox job in one transaction. The response carries a case reference,
for example BR-2026-0107, and the portal stores that receipt.

An analyst signs in to the regulator and opens `notifications.html`. The
register lists the cases. The analyst opens the new case in `breach.html` and
reads the facts, the duties for that case and the activity history. A note can
be added, and the note is kept with the author and the time.

The worker leases the outbox job, evaluates the rules against the case, and
opens alerts. The analyst sees them on `alerts.html`, where each alert carries a
rule id, a readable reason, a priority and a dedupe key. The analyst can
acknowledge, snooze or resolve an alert. Each action is audited.

The information officer returns to the portal and records the affected-person
notice. The portal writes one delivery row per synthetic recipient and two audit
rows, then posts the counts to `POST /api/v1/intake/affected-notices` with a
signature. In the demo, 24 of 25 messages are recorded as sent and one is
recorded as failed. The regulator stores the notice, attaches it to the case and
opens one medium shortfall alert.

The case page now shows the notice: 24 of 25 notified by email, with the
shortfall. A supervisor moves the case through the lifecycle and closes it with
a recorded reason. The move lands in `case_events` and in the audit chain.

## 5. When things go wrong

| Situation | What the system does |
|---|---|
| The acknowledgement is lost and the sender retries | The same bytes and the same id return the original receipt. One case exists. |
| The same id arrives with different bytes | 409 and an audit row. Nothing is overwritten. |
| The signature is wrong or the sender is unknown | 401 and an audit row. No case is created. |
| The regulator is offline during send | The draft moves to RetryPending and the portal answers 502. |
| The regulator is offline during the affected notice | The local run stays complete, regulatorStatus is failed, and the portal returns a warning instead of a false success. |
| Fewer people were reached than claimed | One medium AFFECTED-NOTICE-SHORTFALL alert, deduplicated by notice key. |
| The same notice arrives twice | 200 with duplicate true. One row. |
| Five wrong passwords | 429 for 15 minutes for that username. |
| Three wrong one-time codes | The session is destroyed. The code lives 5 minutes. |
| A burst of unauthenticated requests | The service locks. The operator reopens with TRIP_OPEN=1 or by deleting data/trip.lock. |
| A sensor ships faster than its limit | 429, counted as refused. The shipper does not stop. |

These behaviours are not aspirational. Most of them have a row in
`docs/TEST_LOG.md`, and the integration tests exercise them directly.

## 6. The data, in plain words

| Record | What it holds |
|---|---|
| organisations | the fictional companies in the lab |
| users, memberships, sessions | people, their role per organisation, and sign-in state |
| cases, case_facts | the regulator's work record and the incident facts |
| notifications, notification_versions | the organisation's report, kept as immutable versions |
| intake_receipts | the proof that a submission was accepted |
| case_notes, case_events | human notes and the state and assignment history |
| alerts | rule hits with a readable reason and a dedupe key |
| outbox_jobs | work the rules worker leases |
| audit_events | the hash-chained record of every important write |
| obligations, case_obligations | the section 22 duties and their status per case |
| research_cases, research_sources, research_findings | the four case studies with sources and confidence labels |
| evidence | uploaded files, quarantined until a supervisor clears them |
| sender_keys | the public keys allowed to post signed intake |
| affected_notices | the signed counts sent back after notifying affected people |
| drafts, affected_recipients, notification_runs, notification_deliveries, org_audit_events | the portal side: drafts, synthetic contacts, dispatch runs, per-person rows and the portal audit |

Two ideas hold the model together. First, nothing that was received is
rewritten. A supplement becomes a new notification version that points at its
predecessor. Second, every important write joins the audit chain. Each row
hashes its own content and the previous hash. If someone changes an old row,
the chain breaks at that row.

## 7. The rules and the shortfall alert

| Rule | Fires when | Priority |
|---|---|---|
| RULE-01 | severity is high or critical | high |
| RULE-02 | the notification arrived more than 72 hours after discovery | high |
| RULE-03 | the affected count is 1000 or more | medium |
| RULE-04 | the count, the discovery time or the narrative is missing | high |
| RULE-05 | an incident has no linked notification and is not closed | high |
| RULE-06 | triage was confirmed 48 hours ago with no notification | medium at 48 hours, high after 72 |
| AFFECTED-NOTICE-SHORTFALL | sent is less than the affected total on a notice | medium |

The first five rules come from the D3 rules table. RULE-06 instruments the D3
timing section as an internal work queue timer. The alert text says internal
timer and not legal deadline. The shortfall rule belongs to the affected-person
duty and runs at intake, not in the worker.

Each alert names the rule and the case and gives a reason a person can read. A
dedupe key stops the same rule from opening the same alert twice for the same
case and the same input. An analyst acknowledges, snoozes with a reason and a
return date, or resolves with a resolution. A snooze sweep reopens what expires.

## 8. Security controls and why they exist

| Control | Why it exists |
|---|---|
| One permission gate, deny by default | every route asks the same matrix, so a missing grant denies |
| scrypt password hashes with per-secret salt | a stolen dump is expensive to crack |
| sessions expire after 15 minutes idle and 8 hours absolute | a stolen cookie dies |
| console one-time code, 5 minutes, 3 tries | a password alone is not enough |
| login lockout, 5 failures for 15 minutes | slows guessing |
| 404 for missing and forbidden records | identifiers cannot be probed |
| parameterised queries and text-node rendering | no injection and no markup injection |
| JWS over the exact bytes | the report cannot change in transit |
| immutable notification versions | supplements never rewrite history |
| hash-chained audit | tampering breaks the chain at the altered row |
| evidence quarantine by allowlist | unknown files never become downloadable |
| extraction notices | bulk copying becomes visible without blocking work |
| trip wire | a request burst locks the service, and only an operator reopens it |
| mTLS intake on 8101 | a client certificate is required before a byte is read |
| OIDC with PKCE S256 | the lab can show a real identity provider, with roles still local |
| sensor token | only the shipper can open sensor alerts |

Three of these deserve a sentence more. The permission gate is one function,
`can(role, action)` in `apps/regulator/server/policy.ts`. Every route asks it,
and a role with no grant is denied. The audit chain proves that a row was not
changed after it was written. It does not prove that the original entry was
true. That is a narrower claim, and the honest one. The trip wire is a blunt
instrument on purpose. A burst of unauthenticated requests from one address
locks the service, kills every session and writes an audit row and a high
alert. An operator reopens it.

## 9. What was built

The work went through gates, and each gate closed with tests and evidence.

Gate A fixed the interface. Synthetic banners, a real not-found state, badges
bound to the right record, one definition per count, text-only rendering and
fictional organisations. The old pages could not be trusted with data.

Gate B built the backend. Postgres with numbered migrations, a deterministic
seed, password and session handling, the permission matrix, notes, transitions
with conflict handling, assignments, imports with immutable versions, a rules
worker, alerts, a research register and the duties on each case.

Gate C connected the two systems. The organisation portal drafts, approves at an
exact revision, signs and sends. Signed intake verifies, claims idempotency,
writes the case and returns a receipt. Retries and conflicts behave.

The hardening pass added evidence quarantine, redacted exports, security
headers, queue-aware health checks, backups with a timed restore rehearsal and
runbooks with dated exercise notes.

The stretch pass added three optional lab paths. Keycloak single sign-on with
PKCE, mutual TLS on a second intake port, and a Suricata sensor that watches the
app ports and ships alerts to the regulator inbox. The Wazuh manager is the one
gap, and section 11 explains it.

The last feature added the affected-person notice. The portal records one
dispatch per draft, one delivery row per synthetic recipient, and reports the
counts to the regulator. The case page shows sent of total and the shortfall.

## 10. How it is tested

There are two suites. `npm test` runs 118 tests: unit tests, integration tests
and security tests. `npm run test:e2e` runs 11 browser flows on Chromium.

The unit tests cover passwords, the contracts, the rule functions, the policy
matrix, the audit hash and the seal. The integration tests run real HTTP
against a real database. They cover sign-in, scoping, case work, intake,
retries, evidence, the trip wire, Keycloak, mutual TLS, the sensor and the
affected notices. The browser flows cover sign-in, the dashboard, the register,
a case, the denied move, the lock overlay, the group passphrase and the full
notification chain.

Every acceptance result has a row in `docs/TEST_LOG.md`, from T-01 to T-77.
Each row names the test or the command and the result that was seen. Where a
test cannot run in this environment, the row says so.

## 11. Honest limits

1. The Wazuh manager does not run on the arm64 lab machine. The amd64 image
   exits 139 under emulation after about 100 ms and writes no log line. The
   delivered sensor is Suricata, and no Wazuh claim is made. Evidence is in
   `docs/PROGRESS.md` and `docs/runbooks/sensor.md`.
2. Everything runs on one machine over plain HTTP, except the optional mTLS
   listener.
3. The console code is not real multi-factor authentication. Keycloak is the
   stronger lab path.
4. The shared group passphrase carries no per-person attribution.
5. The timers pace the work and never claim legal force.
6. The lab accounts are synthetic and public in this repository. Never reuse
   them anywhere else.

## 12. Questions a marker may ask

| Question | Answer | Open first |
|---|---|---|
| What is this in one sentence? | A two-system lab for the POPIA section 22 duty: an organisation reports a breach, the regulator works the case, and the affected people are notified. | this brief |
| What does section 22 require? | The responsible party must tell the Information Regulator and the affected people after a compromise, as soon as reasonably possible. | section 2 |
| Who uses each side? | Organisation staff at 8200 and regulator staff at 8100, with four regulator roles and three organisation roles. | section 3, README |
| What happens to one report? | Draft, approve at a hash-bound revision, sign, send, triage, rules, affected notice, close. | section 4 |
| How do you prove a report was not changed? | A JWS over the exact bytes, immutable versions and the hash-chained audit. | section 8, docs/TEST_LOG.md |
| What are the rules? | Six rules on severity, lateness, count size, missing facts, missing notification and the triage clock, plus the shortfall alert. | section 7 |
| How is it tested? | 118 automated tests and 11 browser flows. Every result has a row in docs/TEST_LOG.md. | section 10 |
| How do I run it? | The README quick start, then docs/SETUP.md for an empty machine. | README |
| How do I sign in? | README lists every account, the group passphrase, the Keycloak users and the machine channels. | README |
| Is this the real regulator portal? | No. The official channel is the Regulator's eServices Portal, and receipts say test_receiver. | section 11 |
| What is not finished? | The Wazuh manager on arm64 and the D4 disclosure wording. Everything else is built. | section 11, docs/PROGRESS.md |
| Where is the design reasoning? | The ADRs, the risk register and the NIST mapping. | docs/adr, docs/RISKS.md, docs/NIST_MAP.md |

## 13. Words used here

- POPIA: the Protection of Personal Information Act.
- Section 22: the duty to notify after a compromise.
- Responsible party: the organisation that holds the information.
- Data subject: the person the information is about.
- Notification: the report an organisation sends about an incident.
- Case: the regulator's work record for one incident.
- Receipt: the regulator's proof that a submission was accepted.
- JWS: a signed JSON payload. The signature covers the exact bytes.
- Audit chain: rows linked by hashes, so a change breaks the chain.
- Quarantine: holding an uploaded file until a supervisor clears it.
- Shortfall: fewer people reached than the notice claims.
- Alert: a rule hit with a readable reason.

The full list is in `docs/GLOSSARY.md`.

## 14. Reading paths

- Marker: this brief, then `docs/TEST_LOG.md`, then `docs/D4_MAPPING.md`.
- New group member: this brief, then `docs/PROGRESS.md`, then `docs/DEMO.md`.
- Operator: `README.md`, then `docs/SETUP.md`, then `docs/runbooks/`.
