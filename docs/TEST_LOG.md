# Acceptance test log

Every test below ran against the build on this machine. Dates and
counts are the actual results, not the hoped-for ones. Automated
tests live in tests/ and run with npm test or npm run test:e2e.
Manual evidence names the command and what it printed.

Seeded baseline for every automated run: 7 cases, 6 notifications,
11 open alerts, 1 pending case, 5 open cases, 13 research sources.

| ID | Name | Result 16 Oct 2026 | Evidence |
| --- | --- | --- | --- |
| T-01 | Dashboard seed consistency | Pass | cases.test.ts: 7 / 6 / 5 / 1 / 11 / 0 |
| T-02 | Search, filter, empty results | Pass | cases.test.ts: 7 total, 2 closed, Karoo-only on q=Karoo |
| T-03 | Open each valid case | Pass | cases.test.ts: every reference opens with its own badges |
| T-04 | Missing and invalid case id | Pass | cases.test.ts: random uuid answers 404 with no leak |
| T-05 | Save note, refresh, restart | Pass | casework.test.ts: note survives server restart |
| T-06 | Valid and invalid transitions | Pass | casework.test.ts: illegal move 422, closure needs reason |
| T-07 | Concurrent edits | Pass | casework.test.ts: stale version 409 with both numbers |
| T-08 | Cross-organisation access | Pass | cases.test.ts: org identity denied on six surfaces |
| T-09 | Assignment scope | Pass | cases.test.ts T-09: analyst sees own plus unassigned, other 404 on detail notes events export obligations, supervisor sees 7 |
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
| T-34 | Mobile, labels, zoom, flows | Pass | test:e2e: 5 browser flows green on Chromium |
| T-35 | Backend error and retry | Pass by control | Idempotency keys on notes, receipts on intake. Double-submit tests prove no duplication. |
| T-36 | Workload | Pass manual | 100 authed dashboard reads: 100 ok in 773ms. 200 anonymous: rejected at 0.3ms each. |

One item stays open by choice. Keycloak-backed sign-in (the
full T-11 story) waits in Phase 12.

## Group access + extraction watch (17 October 2026)

Same machine, same seeded baseline, run at the task 8 gate walk.
`npm test` gave 87 pass 0 fail. `npm run test:e2e` gave 8 pass.
`node db/seed.ts --reset` still prints 7 / 6 / 11 / 13.

| ID | Name | Result 17 Oct 2026 | Evidence |
| --- | --- | --- | --- |
| T-37 | Group sign-in with the shared passphrase | Pass | auth.test.ts "group passphrase signs straight in when open" (groupOpen true, one step, no code). flows.spec.ts "group passphrase signs in with no code step" on its own server at 8102 |
| T-38 | Wrong group passphrase refused and locked out | Pass | auth.test.ts "wrong group passphrase is refused like a wrong password" (401, same body as wrong password) plus "sixth group failure in fifteen minutes is rate limited" (429) |
| T-39 | Closed group gate answers 404 | Pass | auth.test.ts "closed group gate is not found", GROUP_LOGIN unset, 404 with no hint the route exists |
| T-40 | Topbar swaps sign in for the member name | Pass | flows.spec.ts "topbar shows sign in when signed out and name when signed in": "Sign in" before, "Regulator Analyst" after |
| T-41 | Blur lock on a stranger dashboard, data stays shut | Pass | flows.spec.ts "signed-out dashboard shows blur lock, data stays locked": #screen-lock role alertdialog with a Sign in link, request to /api/v1/cases answers 401 while the overlay is up, dashboard fields fill only after sign-in |
| T-42 | Extraction notice on download, export and denial | Pass | evidence.test.ts "a clean download raises an extraction notice for supervisors", "a case export raises the same extraction notice", "a blocked download raises its notice too": high priority, open state, named analyst, case ref and filename in the reason |
| T-43 | Download survives a dead outbox | Pass | evidence.test.ts "a broken notice queue never blocks the download itself": outbox_jobs renamed away, download still 200 with the file bytes, evidence.download audit row still written |
| T-44 | API answers never cache, static pages still do | Pass | cases.test.ts "api responses are never cached" (Cache-Control no-store, Pragma no-cache on /api/v1/cases) and "static html keeps its normal caching" (login.html stays cacheable) |

Push stays blocked: `git remote -v | grep -c DISABLED` gives 1.

## Breach response (17 October 2026)

Same machine, same seeded baseline, run at the closeout gate after the
trip-wire and console tamper work landed. `npm test` gave 92 pass
0 fail. `npm run test:e2e` gave 9 pass.

| ID | Name | Result 17 Oct 2026 | Evidence |
| --- | --- | --- | --- |
| T-45 | Burst past the threshold trips the service | Pass | security.test.ts "an unauthenticated burst past the threshold trips the service": four 401s then 503 "service locked", every sessions row deleted, data/trip.lock written, one audit row action security.trip result denied, one high open SECURITY-TRIP alert with the burst reason |
| T-46 | Tripped state survives a restart | Pass | security.test.ts "a fresh boot with the flag file stays tripped": fresh child process answers ready {ok:true, locked:true}, /api/v1/me 503, flag file still on disk |
| T-47 | TRIP_OPEN reopens for the operator | Pass | security.test.ts "boot with TRIP_OPEN=1 clears the flag and serves": flag file consumed, /health/live 200, /api/v1/me back to 401 |
| T-48 | Valid session refused while tripped | Pass | security.test.ts "a valid session is refused while the service is tripped": a live cookie and a fresh sign-in both answer 503 "service locked" |
| T-49 | Below threshold does not trip | Pass | security.test.ts "four unauthenticated requests under the threshold do not trip": four 401s, no flag file, ready has no locked key |
| T-50 | Console removal reveals no data | Pass | flows.spec.ts "console removal of the lock reveals no data": #screen-lock count 0, 0 record strings and no address in body text, cases alerts and evidence each 401, three counters 0 and one Loading demonstration records row |

## OpenID Connect sign-in (17 October 2026)

Phase 12 stretch item one, run on the same machine. `source
scripts/env.sh`, then `npm test` gave 102 pass 0 fail and `npm run
test:e2e` gave 10 pass. The first six rows ride the stub provider
inside tests/integration/oidc.test.ts, the seventh rides the browser
suite, and the last two are manual runs against the Keycloak 26.0
container from scripts/keycloak.sh.

| ID | Name | Result 17 Oct 2026 | Evidence |
| --- | --- | --- | --- |
| T-51 | Authorize sends the browser to the provider with state, pkce and nonce | Pass | oidc.test.ts "authorize sends the browser to the provider with state, pkce and nonce": 302 to the provider authorize path, state of 64 hex characters, nonce present, code_challenge_method S256, challenge the sha256 of the stored verifier, oidc_state cookie HttpOnly SameSite=Lax Max-Age=600 |
| T-52 | A callback with the wrong state is refused and opens nothing | Pass | oidc.test.ts "a callback with the wrong state is refused and opens nothing": 400 {"error":"invalid sign-in"}, no session cookie, token endpoint hit zero times, /api/v1/me answers 401 |
| T-53 | A matching callback exchanges the code and opens a local session | Pass | oidc.test.ts "a matching callback exchanges the code and opens a local session": 302 /index.html, token call carries code, grant_type authorization_code, client_id and a verifier that hashes to the challenge, /api/v1/me 200 analyst1 regulator_analyst mfaOk true, one auth.oidc ok audit row |
| T-54 | An unknown name gets one local role and an existing name keeps its rows | Pass | oidc.test.ts "an unknown name gets one local role and an existing name keeps its rows": newbie1 created once with regulator_analyst and a null organisation, analyst1 still one row holding regulator_analyst and regulator_supervisor |
| T-55 | A tampered token or a foreign issuer is refused and logged | Pass | oidc.test.ts "a tampered token or a foreign issuer is refused and logged": both attempts 400 with no session, two auth.oidc denied audit rows, analyst1 still one row |
| T-56 | Auth-mode carries the provider switch and hides the route when it is off | Pass | oidc.test.ts "auth-mode carries the provider switch and hides the route when it is off": oidcEnabled false and /auth/oidc 404 {"error":"not found"} while off, oidcEnabled true once the switch is set |
| T-57 | Single sign-on link appears only when the provider switch is on | Pass | flows.spec.ts "single sign-on link appears only when the provider switch is on": no link on the main server, one link with href /auth/oidc on a server started with OIDC_ISSUER set |
| T-58 | Live sign-in through Keycloak lands on the seeded analyst | Pass | `OIDC_ISSUER=http://localhost:18080/realms/cyberserious OIDC_CLIENT_ID=regulator-web node apps/regulator/server/index.ts`, then curl /auth/oidc -> 302 to the real authorize endpoint with state, nonce and a S256 challenge, the login form posted with analyst1 and kc-analyst-pass-2026 -> 200 /index.html, `/api/v1/me` -> {"username":"analyst1","role":"regulator_analyst","mfaOk":true}, audit seq 22 action auth.oidc result ok. The same run as demo created the local row with regulator_analyst and no organisation (seq 23) while io1 kept its organisation and information_officer |
| T-59 | Five wrong passwords at the provider lock it for thirty seconds | Pass | curl loop against the Keycloak login form as demo: failures 1 to 5 answer 200, the correct password is still refused, after `sleep 32` the correct password answers 302. An authorize request with no code challenge answers 302 with error_description "Missing parameter: code_challenge_method", so PKCE S256 is required by the provider |
