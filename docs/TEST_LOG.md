# Acceptance test log

Every test below ran against the build on this machine. Dates and
counts are the actual results, not the hoped-for ones. Automated
tests live in tests/ and run with npm test or npm run test:e2e.
Manual evidence names the command and what it printed.

## Where each test ran

Every result names its place. The four places are:

- `host`: the launchd services on this Mac, on the dev databases.
- `docker`: the compose lab on ports 9100 and 9200, on its own database pair.
- `test runner`: `npm test` on the test databases, each file resetting its schema.
- `browser`: Playwright, on the test databases unless a row says otherwise.
- `ci`: the GitHub workflow on an ubuntu-24.04 runner with a Postgres 16 service.

A row without a place in its text ran in the suite that its section names.

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
| T-15 | Approved revision edited | Pass | org.test.ts: edit resets approval, send binds hash, a 500 answer leaves RetryPending and the next send answers 200 with the test_receiver receipt |
| T-16 | Submission happy path | Pass | intake.test.ts: 201 with labelled receipt and stored case |
| T-17 | Lost acknowledgement retry | Pass | intake.test.ts: retry returns the original receipt, one case |
| T-18 | Same id, changed bytes | Pass | intake.test.ts: 409 with security audit row |
| T-19 | Bad signature or sender | Pass | intake.test.ts: stranger and tampered bodies refused |
| T-20 | Failure before commit | Pass | intake.test.ts: bad org leaves no receipt, a key registered to another organisation answers 422 and writes one denied audit row, good leaves one case and one job |
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
| T-31 | Audit tamper in a copy | Pass | hardening.test.ts: 20 concurrent writes keep one chain with no repeated predecessor, verify reports the altered row after the tamper |
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
| T-45 | A burst warns, a second burst locks the service | Pass | security.test.ts "a repeated burst locks the service after one warning": four 401s, one 429 warning, four more 401s, then 503 "service locked". Every sessions row deleted, data/trip.lock written, one security.trip_warn audit row and one security.trip audit row, one medium SECURITY-TRIP-WARN alert and one high SECURITY-TRIP alert. Updated 9 November for the two-stage wire |
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
| T-60 | Suricata replay fires all three lab rules | Pass | sensor.test.ts: fixture pcap built with real checksums, replay with infra/sensor/suricata.yaml and local.rules answers SIDs 9000001, 9000002 and 9000003, and the credential alert names port 8100 |
| T-61 | Sensor alert with the internal token lands in the inbox | Pass | sensor.test.ts: 201 created, one SENSOR-IDS alert, medium priority, reason "Suricata IDS: LAB cleartext credential post on an app port", null case, open state, visible to analyst1 on /api/v1/alerts |
| T-62 | Sensor alert without a valid token is refused | Pass | sensor.test.ts: missing and wrong token answer 401, no SENSOR-IDS row, two sensor.alert denied audit rows |
| T-63 | The same sensor event shipped twice keeps one row | Pass | sensor.test.ts: first 201 created true, retry 200 created false, one row with last_seen_at later than first_seen_at |
| T-64 | A Wazuh source label maps to the FIM reason | Pass | sensor.test.ts: a saved payload with source wazuh gives reason "Wazuh FIM: File added to a watched directory" and low priority. The manager itself is not running, see docs/runbooks/sensor.md |
| T-65 | A burst past the sensor rate limit is refused | Pass | sensor.test.ts: SENSOR_RATE_LIMIT 3, four posts answer 201, 200, 200, 429 |
| T-66 | The shipper carries replayed eve alerts into the inbox | Pass | sensor.test.ts: three parsed alerts shipped, sent 3 refused 0, three SENSOR-IDS rows with the three lab signatures. A 429 only server counts refused 3 and sent 0 |
| T-67 | The Wazuh parser maps levels and descriptions | Pass | sensor.test.ts: level 5 gives low, level 12 gives medium, the signature is the rule description, the source is the agent name. Saved file only |
| T-68 | Notify records a run, delivery counts and audit rows | Pass | org-notify.test.ts: 25 affected, 24 sent, 1 failed, run complete, org audit draft.notify.start and draft.notify.complete, delivery rows 24 sent and 1 failed, regulator affected_notices total 25 sent 24 failed 1, one AFFECTED-NOTICE-SHORTFALL alert with reason "24 of 25" at medium priority |
| T-69 | Notify keeps the local record when the regulator is offline | Pass | org-notify.test.ts: regulator URL points at port 1, the run still completes with 12 sent, the response carries a warning, the stored regulatorStatus is failed |
| T-70 | Notify stays scoped and gated | Pass | org-notify.test.ts: zero affected 400, steward 403, a submitted draft answers 409 before any notice, foreign draft 404 on both routes, a held sending run answers 409 |
| T-71 | A signed affected notice is stored and mapped to its case | Pass | affected-notices.test.ts: 201 with the case reference, affected_notices total 10 sent 8 failed 2 attached to the case, one intake.affected_notice audit row, case detail carries affectedSent 8, affectedTotal 10, channel email and the completion time |
| T-72 | A shortfall raises one medium alert | Pass | affected-notices.test.ts: first post 201, retry 200, one AFFECTED-NOTICE-SHORTFALL alert with reason "8 of 10", one notice row |
| T-73 | Full delivery records without a shortfall alert | Pass | affected-notices.test.ts: 6 of 6 by sms stores the notice, zero shortfall alerts |
| T-74 | Bad signatures and impossible counts are refused | Pass | affected-notices.test.ts: unregistered sender 401, tampered JWS 401, sent 9 and failed 2 of 10 answers 422, zero notice rows |
| T-75 | A claim wider than the register is refused | Pass | org-notify.test.ts: 30 affected against 25 synthetic recipients answers 409 "25 of 30 affected people", zero runs and zero deliveries |
| T-76 | Portal records a dispatch and the case shows the counts | Pass | notify.spec.ts: io1 creates a draft with 25 affected, submits, approves, signs and sends, then records an email dispatch. The page shows "Recorded dispatch (lab simulation): 24 of 25" and the run list. The analyst case detail shows "24 of 25 notified by email" and "Shortfall: 1." |
| T-77 | The documented restart block ends in a full demo walk-through | Pass manual | Reseeded both dev databases, `node tools/org-sender.ts --register`, then the three commands in SESSION_HANDOFF.md. health/ready answered on 8100 with an empty queue and on 8200. io1 created SUB-2026-0001 with 25 affected, submitted, approved, signed and sent (case BR-2026-0107), then recorded an email dispatch: run complete, 24 sent, 1 failed, regulatorStatus sent. Org rows: 24 sent and 1 failed deliveries, audit draft.notify.start and draft.notify.complete. Regulator rows: affected_notices 25/24/1 email, one intake.affected_notice audit, one open medium AFFECTED-NOTICE-SHORTFALL alert with reason "sent 24 of 25 by email, 1 short, 1 failed". The worker printed "1 jobs, 1 alerts opened". Browser: the case page shows "24 of 25 notified by email" and "Shortfall: 1", the portal shows the run history and the recorded dispatch label. Screenshots /tmp/rehearsal-regulator.png and /tmp/rehearsal-org.png. Both databases were reseeded after the run |

| T-78 | The install manifest names required and optional tools | Pass | install-manifest.test.ts: 3 of 3 |
| T-79 | A generated secret round trips through the keychain and is removed | Pass | keychain.test.ts: 2 of 2, generated value is 64 hex characters, empty secret refused |
| T-80 | The vault reports absence without creating state | Pass | vault.test.ts: 2 of 2, unknown command exits 2 |
| T-81 | Sourcing env.sh sets umask 0077 | Pass | permissions.test.ts: 1 of 1 |
| T-82 | The pf anchor prints default deny and loopback ports, and refuses unconfirmed apply | Pass | pf-firewall.test.ts: 3 of 3 |
| T-83 | Both apps bind loopback by default and timeouts are finite | Pass | bind.test.ts and org-bind.test.ts: address 127.0.0.1, request 30 s, headers 20 s, keep alive 5 s |
| T-84 | Cross-site and foreign-origin mutations are refused | Pass | csrf.test.ts: cross-site 403, wrong origin 403, same-origin and headerless requests reach the route |
| T-85 | Response headers carry the isolation and permissions policy | Pass | csrf.test.ts: COOP, CORP and cross-domain policies present |

| T-86 | The ClamAV config renders private and the daemon is supervised | Pass | clamav.test.ts: config has no placeholders, mode 600, Foreground true; launchctl shows one pid owned by launchd |
| T-87 | The EICAR test file is detected through the running daemon | Pass | clamav.sh test: "Eicar-Test-Signature FOUND", exit 0 with "EICAR detected as expected"; 3,628,191 signatures loaded |

| T-88 | An infected upload is refused and leaves no evidence row | Pass | upload-scan.test.ts: EICAR as text/plain answers 422 with the signature, evidence count 0, audit evidence.scan denied |
| T-89 | Clean uploads record the scan, and a required scanner that is down fails closed | Pass | upload-scan.test.ts: clean upload 201 with scan state and audit ok; CLAMAV_REQUIRED=1 with a bad config answers 503 and stores nothing |
| T-90 | A sealed backup restores into a scratch database | Pass | backup.sh wrote a 48 KB age archive to the vault, checksum verified, bundle held both dumps and evidence, pg_restore produced 7 cases and 6 audit rows, scratch database dropped |

### After the first security tranche, 22 October 2026

HEAD 0e65b58. `npm test` 147 pass, 0 fail in 223 seconds. Playwright 11
pass in 4.3 seconds. The count grew by 9 install, key, firewall, bind,
origin, scanner, and backup tests. The baseline above stays as the
starting point.

After the scan wrappers and the TLS front, HEAD 8262088: `npm test` 152
pass, 0 fail in 223 seconds, Playwright 11 pass. The five new tests cover
the four scanners and the Caddyfile. ClamAV stayed up through the run.

| T-91 | The four scanners run and report clean | Pass | security-scan.sh all: gitleaks 0, osv-scanner 0 of 84 packages, trivy 0 high or critical, semgrep 0 ERROR; GCM tag length fixed before the clean run |
| T-92 | The scan wrappers refuse unknown modes and name missing tools | Pass | security-scan.test.ts: 2 of 2 |

| T-93 | Caddy validates and serves the app over TLS on loopback | Pass | caddy.sh validate: "Valid configuration"; live proxy answered {"ok":true} on 8443 with HSTS, nosniff and DENY headers and no Server header |
## Security stack baseline, 22 October 2026

HEAD 79c3fa7. `npm test` 118 pass, 0 fail in 201 seconds. Postgres 16 up.
Free disk 20 GiB. Present: suricata, gitleaks, docker, colima, jq.
Missing: clamav, semgrep, trivy, osv-scanner, lynis, caddy, age, yq,
vector, osquery. These numbers are the starting point for the security
stack work, not a claim about controls that do not exist yet.

### Telemetry, WAF and evidence tranche, 22 October 2026

`npm test` 164 pass, 0 fail in 257 seconds. Playwright 12 pass in 5.4
seconds. The count grew by 12 tests: 5 security ingest, 5 WAF and ban,
and 2 sealed evidence. The browser count grew by one security page test.

| T-94 | Ingest refuses a bad token, extends the chain and records a heartbeat | Pass | security-ingest.test.ts: 401 without token with a denied audit row; 202 with sequence, chain verifier says intact |
| T-95 | A high severity event opens one deduplicated SECURITY-EVENT alert | Pass | security-ingest.test.ts: second identical event did not open a second alert |
| T-96 | Security state needs MFA and audit or security role, and tampering is detected | Pass | security-ingest.test.ts: analyst 403; reviewer 200; edited row fails at seq 2 |
| T-97 | WAF refuses traversal, SQL injection and null byte probes and audits each block | Pass | waf-ban.test.ts: 403 plus waf.block audit and kind=waf event |
| T-98 | A banned address is refused across routes and unban restores access | Pass | waf-ban.test.ts: 403 then 200 after DELETE |
| T-99 | Login attempts are throttled per address across usernames | Pass | waf-ban.test.ts: 11th attempt 429, audit row, successful login clears the window |
| T-100 | Evidence magic bytes must match the claimed type, and stored bytes are ciphertext | Pass | evidence-sealed.test.ts: 422 with evidence.magic audit; file did not start with plaintext; download round-trips |
| T-101 | The security page shows an intact chain and refuses an analyst | Pass | Playwright T-99: reviewer sees Intact and heartbeats; analyst gets the lock |
| T-102 | ZAP baseline finds no high or medium issue | Pass | docs/security/dast.json: 0 high, 0 medium, 6 low, 4 informational; each triaged in DAST_REPORT.md |
| T-103 | Lynis audits the host and the result is recorded | Pass with warnings | LYNIS-2026-10-22.txt: index 75, 176 tests, 2 warnings, 16 suggestions |
| T-104 | osquery is installed, loaded and answers inventory queries | Pass | `osqueryi` 5.24.0; launchctl shows io.osquery.agent active |
| T-105 | Suricata capture starts on loopback with the lab rules | Partial | engine started, no eve alerts generated; replay detection remains the proven path |
| T-106 | The application firewall and pf anchor are applied | Pass | socketfilterfw state 1; `pfctl -a cyberserious -sr` lists block and pass rules |
| T-107 | The TLS edge is trusted for the logged-in user | Pass | `security find-certificate -c "Caddy Local Authority"` in login keychain; HTTPS 200 over HTTP/2 |

### Final gate, 22 October 2026

`bash scripts/verify.sh` at HEAD 63503c1: 8 passed, 0 failed in 272
seconds. Gates: tool manifest, secrets, dependencies, static analysis,
test suite, browser suite, audit chains, backup dry run. Posture is
informational. This is the command to rerun before a demo.

### Correlation, anchor, DLP and supervision tranche, 22 October 2026

`npm test` 178 pass, 0 fail in 294 seconds. Playwright 12 pass. New
integration coverage:

| T-108 | Correlation opens AUTH-BURST, RBAC-PROBE and EXTRACT-BURST alerts with stable dedupe keys | Pass | correlation.test.ts: 5 of 5 |
| T-109 | The daily HMAC anchor writes once and the CLI verifies it | Pass | anchor.test.ts: 4 of 4; `bash scripts/anchor.mjs verify` printed `{"ok":true,"checked":1}` |
| T-110 | An export manifest records counts, not values, and refuses a 5001 row export | Pass | dlp.test.ts: 4 of 4, including the 5 MiB size cap |
| T-111 | The retention sweep removes expired sessions, resolved alerts and terminal jobs and leaves cases and audit rows alone | Pass | retention.test.ts: 2 of 2 |
| T-112 | A job that reaches 8 attempts becomes dead and raises one DEAD-LETTER alert | Pass | retention.test.ts: state dead, one alert for the job |
| T-113 | launchd restarts Caddy and Vector after a forced kill | Pass | killed both PIDs; `launchctl print` showed new PIDs; `https://localhost:8443/health/live` answered `{"ok":true}` |
| T-114 | The worker agent runs correlation, the anchor check and the sweep | Pass | `launchctl print gui/$(id -u)/com.cyberserious.worker` running; log line "anchor current, 52 expired rows swept" |
| T-115 | A live loopback probe raises the sensor rule and the alert reaches the app store | Pass | `curl http://127.0.0.1:8100/waf-test`; `infra/sensor/out/eve.json` SID 9000004; `security_events` row "LAB controlled waf-test probe" source suricata |
| T-116 | Vector ships a parsed eve alert to the ingest route with the Keychain token | Pass | sink answered 200; row seq 2; the token is rendered into a private runtime config, not committed |
| T-117 | All lab services are under launchd | Pass | `launchctl print` shows regulator, organisation, caddy, vector, worker, clamd, freshclam and the Suricata root daemon |
| T-118 | The lockfile carries no known advisory | Pass | osv-scanner reported GHSA-27r3-jxmh-p828 on body-parser 2.3.0; an npm override lifts it to 2.4.0; the dependency gate is clean |

### Sprint gate, 28 October 2026

`bash scripts/verify.sh` at HEAD 1590d14: 8 passed, 0 failed in 302
seconds. Gates: tool manifest, secrets, dependencies, static analysis,
test suite, browser suite, audit chains, backup dry run. Posture is
informational.

`node scripts/verify-chain.mjs` returns audit 1676 rows intact and
security 60 rows intact. `node scripts/anchor.mjs --verify` returns
`{"ok":true,"checked":7}`.

### Vulnerability and compliance tranche, 28 October 2026

`npm test` 184 pass, 0 fail. Playwright 12 pass. The four scanners write a
JSON artefact under `docs/security/scans/` and close clean.

| T-119 | The four scanners keep an artefact and close clean | Pass | `bash scripts/vulnerability-assessment.sh` printed "assessment scan: clean"; gitleaks 0, osv 0, trivy 0, semgrep 0 |
| T-120 | A malformed gzip body cannot stop the regulator | Pass | request answered 400; regulator pid stayed 727; `/health/live` answered ok |
| T-121 | The probe scripts print a transcript for the record | Pass | `docs/security/scans/probes.txt` holds the unauth and auth runs |
| T-122 | The affected notice carries the four section 22(5) particulars | Pass | `compliance.test.ts` C-01 |
| T-123 | A notice that misses a required particular is refused | Pass | `compliance.test.ts` C-02, answer 400 |
| T-124 | Every statutory delivery channel is accepted and an unknown one refused | Pass | `compliance.test.ts` C-03, letter and e-mail and website and news accepted, unknown refused |
| T-125 | Every "Met" row in the obligation matrix names a test that runs | Pass | `docs/security/COMPLIANCE.md` P-01 to P-16, E-01 to E-04, X-01 |
| T-126 | Both applications are reachable only over TLS 1.3 | Pass | `scans/probes.txt`: 8443 and 8444 answer 200 on 1.3, refuse 1.0, 1.1 and 1.2 |
| T-127 | The session cookie carries Secure behind TLS and stays usable on loopback http | Pass | `tests/unit/session-cookie.test.ts` 3 of 3; live set-cookie on 8443 and 8444 shows Secure, loopback 8100 does not |

### Closure tranche, 9 November 2026

The plan items from the 22 October handoff and the open defect register are
closed here. `npm test` gave 197 pass, 0 fail. `npm run test:coverage`
measured 90.50 percent lines against a floor of 90.

| T-128 | Two bursts cross a two-stage wire | Pass | security.test.ts "a repeated burst locks the service after one warning": one 429 warning, then the lock on the second burst, sessions revoked, flag written, one warning alert and one high alert |
| T-129 | Signed intake traffic counts toward the wire | Pass | security.test.ts "a signed intake burst counts toward the trip wire": four 401s then 429 on `/intake/v1/submissions`, no flag file |
| T-130 | A signed body above the cap answers 413 | Pass | intake.test.ts "T-21 a signed body above the cap answers 413": 300 KB body, 413 and a too-large error |
| T-131 | A note idempotency key is scoped to one case and one author | Pass | casework.test.ts "one key on two cases keeps two notes": both writes answer 201, each case lists its own note |
| T-132 | Concurrent captures get distinct references | Pass | imports.test.ts "concurrent captures get distinct references": five parallel writes, five 201s, five distinct `BR-2026-` references from `case_reference_seq` |
| T-133 | Alert reads follow case assignment | Pass | alerts.test.ts "an analyst sees alerts for unassigned cases and their own only": own and unassigned alerts listed, another analyst's case alert hidden, supervisor sees all |
| T-134 | Rule reasons use one count format | Pass | `rules/index.ts` builds the reason with `Intl.NumberFormat("en-US")`, so a marker reads 1,120 rather than 1 120 |
| T-135 | The compose file holds one build, two doors and an internal store | Pass | tests/scripts/compose.test.ts, six checks: one build context, ports 9100 and 9200, internal store network, init script, sender key volume, no missing secret file |
| T-136 | The Docker lab builds and serves both apps | Pass | `docker build` exit 0; `docker compose up -d`; `curl` on 9100 and 9200 answered 200; `/health/ready` answered ok on both |
| T-137 | A real sign-in works through the Docker regulator | Pass | analyst1 password then the code read from `docker compose logs regulator`; `/api/v1/me` showed mfaOk true; the dashboard read 7 cases and 11 alerts |
| T-138 | The trip drill runs in the Docker lab | Pass | `docs/project/exercises/incident-2026-11-09.md`: 429 warning, second-burst 503 lock, sessions 0, both alerts, both audit rows, flag present |
| T-139 | A standing condition keeps one alert | Pass | `correlation.test.ts` "a stale heartbeat raises SENSOR-SILENT": a second run eleven minutes later opens no new alert. 4,129 duplicate SENSOR-SILENT rows were resolved in the dev database in the same pass |
| T-140 | The alerts page says an alert is not a legal finding | Pass manual | `apps/regulator/web/alerts.html` intro carries the line, and the browser suite passed 12 of 12 after the edit |
| T-141 | The Wazuh manager and agent run natively on arm64 | Pass manual | `bash scripts/wazuh.sh start` exit 0; manager on 4.14.9 arm64; authd logged `Using password specified on file`; agent key issued for lab-agent |
| T-142 | A FIM probe raises a Wazuh alert and the row reaches the inbox | Pass manual | `/lab/probe-*.txt` raised rule 554 `File added to the system`; `wazuh.sh ship` stored `Wazuh FIM: File added to the system.` in the regulator alerts table |
| T-143 | Keycloak requires TOTP setup for the marked user | Pass manual | Admin API: `otpPolicyType totp`, `HmacSHA1`, 6 digits, period 30, lookAhead 1, and mfa1 `requiredActions [CONFIGURE_TOTP]`. Playwright: mfa1 lands on `login-actions/required-action?execution=CONFIGURE_TOTP` with `Mobile Authenticator Setup`; analyst1 reaches the account console with no code. Code acceptance is not claimed: a scripted TOTP entry did not complete |
| T-144 | osquery inventory runs and posts a heartbeat | Pass manual | `com.cyberserious.osquery` is loaded with pid 94513; the heartbeat agent wrote ingest 201 and `security_heartbeats` shows osquery at 18:16 |
| T-145 | A machine channel never trips the wire | Pass | security.test.ts "a request with the internal token does not count toward the wire": ten token requests answer 401, no flag file |
| T-146 | An idle database client cannot stop the process | Pass | `db.ts` attaches a pool `error` listener; the suite and the live service keep serving through the run |
| T-147 | A user with two memberships acts under the least privileged role | Pass | casework.test.ts "a user with two memberships acts under the least privileged one": the session role stays `regulator_analyst` after a supervisor row is added |
| T-148 | A malformed evidence id answers not found | Pass | evidence-sealed.test.ts "a malformed evidence id answers not found": 404, never a bad-uuid 500 |
| T-149 | A negative ban window becomes the default hour | Pass | waf-ban.test.ts "a negative ban window falls back to the default hour": 201, a listed ban with an expiry about an hour out |
| T-150 | A text receipt never strands a draft | Pass | org.test.ts T-15: an intake answer of `text/plain` is stored as `{raw}` and the draft reaches Acknowledged |
| T-151 | A bad config value falls back to the safe default | Pass manual | `dlp.ts` and `retention.ts` parse limits with a finite guard; a NaN value cannot remove a cap |
| T-152 | A multi-audience token must name this client | Pass manual | `oidc.ts` compares `azp` to the client id when the audience holds more than one value |
| T-153 | A hostile filename cannot break the download header | Pass manual | `evidence.ts` strips quotes and newlines from the content-disposition name |
| T-154 | The host pair passes the live acceptance sweep | Pass manual | 36 checks against 8100 and 8200: group and code sign-in, counts, note write, analyst refusal, supervisor move and return, alert acknowledge and resolve, chain intact, ban and unban, admin refusal, malformed id 404, evidence upload, review and download, portal draft to notice, new case visible |
| T-155 | The Docker pair passes the same sweep | Pass manual | 36 checks against 9100 and 9200, all pass, including the intake send and the affected notice |
| T-156 | Both dashboards render with no client errors | Pass manual | Playwright: 7 notifications and 14 alert cards on each; no pageerror, no console error, no 5xx |

### CI runs, 11 November 2026

The GitHub workflow runs on ubuntu-24.04 with Node 24 and a Postgres 16 service. Both runs pass at commit 44eeb96: the push run 42986720386 and the pull request run 42986735986.

The steps are: create both databases, migrate and seed, install the lab scanners, gitleaks, npm audit and osv-scanner, Semgrep, the test suite and the browser suite.

- Test suite: 202 tests, 198 pass, 0 fail, 4 skipped, 0 todo.
- Browser suite: 12 passed.
- Pull request: CLEAN and mergeable, 0 commits behind main.

The four skips need a tool the runner does not carry. One scan test needs the clamd socket, two sensor tests need the Suricata binary, and one upload test needs clamd. On this Mac all 202 pass with 0 skipped.

The workflow needed six fixes before it could pass: quoted lab keys (YAML read them as numbers), a real osv-scanner download with its checksum, pinned installs for gitleaks, trivy and caddy, a Semgrep note on the file download, a keychain file backend for the Linux runner, and a portable disk check. The test database URLs are now in the workflow environment.

### Gate, 9 November 2026

`bash scripts/verify.sh` on the final tree: 8 passed, 0 failed in 358
seconds at HEAD d84f435. Gates: tool manifest, secrets, dependencies, static
analysis, test suite, browser suite, audit chains, backup dry run. Posture is
informational. 202 tests and 12 browser flows pass. The runner reports 0
skipped, 0 todo and 0 cancelled tests.
