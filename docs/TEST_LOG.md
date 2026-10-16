# Acceptance test log

Every test below ran against the build on this machine. Dates and
counts are the actual results, not the hoped-for ones. Automated
tests live in tests/ and run with npm test or npm run test:e2e.
Manual evidence names the command and what it printed.

Seeded baseline for every automated run: 7 cases, 6 notifications,
10 open alerts, 1 pending case, 5 open cases, 11 research sources.

| ID | Name | Result 16 Oct 2026 | Evidence |
| --- | --- | --- | --- |
| T-01 | Dashboard seed consistency | Pass | cases.test.ts: 7 / 6 / 5 / 1 / 10 / 0 |
| T-02 | Search, filter, empty results | Pass | cases.test.ts: 7 total, 2 closed, Karoo-only on q=Karoo |
| T-03 | Open each valid case | Pass | cases.test.ts: every reference opens with its own badges |
| T-04 | Missing and invalid case id | Pass | cases.test.ts: random uuid answers 404 with no leak |
| T-05 | Save note, refresh, restart | Pass | casework.test.ts: note survives server restart |
| T-06 | Valid and invalid transitions | Pass | casework.test.ts: illegal move 422, closure needs reason |
| T-07 | Concurrent edits | Pass | casework.test.ts: stale version 409 with both numbers |
| T-08 | Cross-organisation access | Pass | cases.test.ts: org identity denied on six surfaces |
| T-09 | Assignment scope | Open | Assignments record, but reads are not yet limited by assignee. Scoped reads by assignee are booked as follow-up work. |
| T-10 | Administrator reads content | Pass | cases.test.ts: admin signs in, cases answer 403/404 |
| T-11 | MFA, timeout, revocation | Pass | auth.test.ts plus disabled-account test in hardening.test.ts |
| T-12 | CSRF and unauthorised write | Pass by control | SameSite=Lax cookies, no token needed for same-origin forms. Negative write tests across suites. |
| T-13 | Hostile strings in text fields | Pass | hardening.test.ts: marker round-trips verbatim, never executes |
| T-14 | Injection and mass assignment | Pass | hardening.test.ts: injected query harmless, smuggled fields ignored |
| T-15 | Approved revision edited | Pass | org.test.ts: edit resets approval, send binds hash |
| T-16 | Submission happy path | Pass | intake.test.ts: 201 with labelled receipt and stored case |
| T-17 | Lost acknowledgement retry | Pass | intake.test.ts: retry returns the original receipt, one case |
| T-18 | Same id, changed bytes | Pass | intake.test.ts: 409 with security audit row |
| T-19 | Bad signature or sender | Pass | intake.test.ts: stranger and tampered bodies refused |
| T-20 | Failure before commit | Pass | intake.test.ts: bad org leaves no receipt, good leaves one case and one job |
| T-21 | Worker after intake | Pass | alerts.test.ts: jobs lease, alerts open |
| T-22 | Same inputs rerun | Pass | alerts.test.ts: refresh only, count unchanged |
| T-23 | Snooze, resolve, recurrence | Pass | alerts.test.ts: ack, snooze, resolve with reasons |
| T-24 | Unknown dates and counts | Pass | alerts.test.ts: RULE-04 stands, no duplicates |
| T-25 | Stale feed and leases | Pass | alerts.test.ts: expired lease recovers, snooze reopens |
| T-26 | Receipt known, notice unknown | Pass | hardening.test.ts: S22-01 attended, S22-02 pending on one case |
| T-27 | Supplement arrives | Pass | imports.test.ts: original hash unchanged, revision 2 linked |
| T-28 | Unsafe or oversized file | Pass | evidence.test.ts: exe refused, quarantine holds |
| T-29 | Export authorised and not | Pass | evidence.test.ts: redacted export audited, admin denied |
| T-30 | Audit failure behaviour | Pass | hardening.test.ts: mutation fails closed, zero silent rows |
| T-31 | Audit tamper in a copy | Pass | hardening.test.ts: verify reports the altered row |
| T-32 | Network reachability, plain HTTP | Pass manual | curl 16 Oct over plain HTTP: live 200, ready 200, cases 401, unknown 404. Reachability only. TLS undemonstrated and booked as Phase 12 work. |
| T-33 | Backup restoration | Pass manual | exercises/restore-2026-10-16.md: 7/6/10 match, checksums clean |
| T-34 | Mobile, labels, zoom, flows | Pass | test:e2e: 4 browser flows green on Chromium |
| T-35 | Backend error and retry | Pass by control | Idempotency keys on notes, receipts on intake. Double-submit tests prove no duplication. |
| T-36 | Workload | Pass manual | 100 authed dashboard reads: 100 ok in 773ms. 200 anonymous: rejected at 0.3ms each. |

Two items stay open by choice. T-09 needs assignment-scoped reads,
which the group booked as follow-up. Keycloak-backed sign-in (the
full T-11 story) waits in Phase 12.
