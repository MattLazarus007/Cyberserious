# Understanding CyberSerious

Written for the group member who has to explain this system to a
marker, and for the marker who wants to know where everything lives.

## 1. The problem in one page

Section 22 of POPIA says a responsible party must tell the
Information Regulator, and the affected people, when personal
information has been compromised, and must do it as soon as
reasonably possible. In practice that duty is a paper trail: someone
discovers an incident, writes down what happened, gets approval,
sends the notification, keeps the receipt, and answers follow-up
questions. CyberSerious turns that trail into software with two
sides. Organisations draft and submit. Regulator analysts triage,
investigate and close. The dashboard prototype was not enough
because it stored nothing, proved nothing and confused counts on
nearly every screen.

## 2. System tour

Two applications share one repository. The regulator workspace runs
on port 8100 with its own database. The organisation portal runs on
port 8200 with a separate database. A background worker leases jobs
from the regulator outbox and evaluates the alert rules. The only
bridge between the sides is the signed intake endpoint: the
organisation signs its approved draft and posts it, the regulator
verifies, stores and receipts it. Shared vocab lives in
packages/contracts. Uploaded files rest under data/, which never
enters version control.

## 3. Data model story

A case is the regulator's work record. A notification is a message
about an incident, kept as immutable versions so supplements never
rewrite history. An alert is a pointer raised by a named rule, with
a reason a human can read. A signal is an unverified report with no
notification yet. Row versions guard concurrent edits: a stale
writer gets a 409 with both numbers. The audit chain hashes each row
into the previous one, so tampering breaks the chain at exactly the
altered point. None of this proves honesty by itself. It proves
tampering afterwards, which is a narrower and a truthful claim.
Lifecycle words map to D3 as follows. Draft is draft,
ReadyForApproval and Approved are approved steps, Acknowledged after
send matches submitted, Sending and RetryPending are transit, and
Rejected is terminal. Pending, UnderReview and AwaitingInformation
mean under investigation, Closed means closed. The receipt path also
uses the word submitted.

## 4. Three journeys through the files

An organisation discovers an incident. A steward opens drafts.html,
writes the draft (apps/organisation/server/drafts.ts), sends it for
approval, the information officer approves the exact revision with
its hash, and sending signs those bytes (jose) to POST
/intake/v1/submissions (apps/regulator/server/routes/intake.ts).
The intake verifies over the exact bytes, claims idempotency, writes
case, facts, notification, version, receipt, audit and outbox rows
in one transaction, and returns the receipt the portal stores.

An analyst opens a case. The register (notifications.html with
js/app.js) lists from GET /api/v1/cases. The detail page
(breach.html) loads GET /api/v1/cases/:id with duties beside it.
Notes post to routes/notes.ts with idempotency keys. Transitions go
through routes/transitions.ts with version checks. Closure needs a
reason. Every step lands in case_events and the audit chain.

The worker wakes (worker.ts), leases outbox rows with skip locked,
evaluates the five rules (rules/index.ts) with input hashes, opens
or refreshes alerts without duplicates, and sweeps expired snoozes.
Analysts acknowledge, snooze and resolve from the alerts page
(routes/alerts.ts), each action audited.

## 5. Security decisions and their why

Deny by default sits in policy.ts: one function, every route, no
match means no access. Scoping keeps organisations out of regulator
content and strangers out of drafts. Missing and forbidden detail
requests both answer 404 so identifiers cannot be probed. Passwords
use scrypt with per-secret salts. Sessions expire twice, idle and
absolute, and the console code dies after three tries or five
minutes. Group demo nights can switch on LAB_SIMPLE_LOGIN, which
skips the code step with a warning line in the server log. Lab only,
never beyond it. Every query is parameterised. Every record renders
through text nodes. Uploads quarantine by allowlist until a
supervisor clears them. Intake verifies signatures before parsing and answers
retries from the stored receipt. Each control maps to a risk in
docs/RISKS.md, which names the test that proves it.

## 6. Group access

Group lab sessions can switch on a shared passphrase gate with
GROUP_LOGIN=1 and GROUP_PASSPHRASE set in the environment, on both
the regulator and the organisation portal, which mount the same
auth router. With the switch off, POST /api/v1/login/group answers
404, so the route cannot be probed. A wrong passphrase answers 401
with the same body as a wrong password, the secret compare is a
constant-time equal on equal-length buffers, and after five failures
the next fifteen minutes answer 429, so a steady attacker on
localhost gets about twenty guesses an hour, roughly 480 a day; the
counters live in the server process, so a restart clears them and
the passphrase still needs to be long. Every attempt, success,
refusal or rate limit, lands in the audit chain as auth.group with
actor "group", and no seed file creates a group user: db/seed.ts
holds no such account, and the row is born on the first successful
sign-in with an unusable password hash. The honest catch is that one
shared secret cannot say who typed it, so every action through the
gate lands on "group", which is fine for lab demos and not fine for
assessed work, which stays on personal logins with console codes.
The lab serves plain HTTP, so keeping the passphrase off the wire is
the operator's job until the TLS path in Phase 12. Reads stay free,
but every evidence download and case export writes an audit row and
queues an extraction notice that the worker turns into a high
priority supervisor alert in its next sweep, so bulk copying becomes
visible without ever blocking a legitimate download.

## 7. Legal-honesty rules

The system never computes words like compliant. Review outcomes are
recorded human findings. Internal timers say internal wherever they
appear. Test receipts say test_receiver. The four seeded case
studies are research rows with sources, while the seven operational
cases use invented organisations. Absence of a report is never
presented as proof of non-reporting. The official channel is the
Regulator's eServices Portal.

## 8. Questions the marker may ask

How do you collect data? Secondary-source analysis, method and
limits in docs/RESEARCH_METHOD.md. Where is multi-factor sign-in?
Console code for the lab, Keycloak path recorded in ADR-0003. How
do teammates sign in without the code dance? LAB_SIMPLE_LOGIN=1 for
group sessions, documented in docs/SETUP.md. Where are emails and
numbers? On every account, returned by GET /api/v1/me, and new
accounts come from the administrator endpoint. Is
this the regulator portal? No, and every receipt says so. Real
reports go through the Regulator's eServices Portal.
How do you know the counts are right? T-01 with one definition per
metric, plus the dashboard aggregates. What happens on duplicate
submit? T-17 and T-18: same bytes return the receipt, changed bytes
conflict. What if two analysts edit at once? T-07: the second gets
a 409 with both versions. How are alerts deduplicated? Rule, case
and input hash, proven by T-22. Where is the evidence? TEST_LOG.md
points at every test. What remains open? T-09 assignment scoping
and Keycloak, both named in TEST_LOG.md. How do I run it? README.md
and docs/SETUP.md, start to finish.

## 9. Known limits

One lab machine holds everything. The prose gates use the repo's
own checks, which lower machine-like tells without promising any
score on outside classifiers. Postgres 16 serves while newer majors
exist, documented in ADR-0002. The console code is weaker than real
multi-factor sign-in. Browser coverage is four Chromium flows.
Docker files exist but the daemon was down, so digests wait for the
first real pull. The audit table reseeds empty, so chain
verification proves the mechanism on live rows, not on history.
