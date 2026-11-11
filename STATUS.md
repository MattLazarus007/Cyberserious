# Status

9 November 2026. Branch `build`.

## What works

The lab runs on one Apple Silicon Mac. The front edge carries a POPIA breach
register with a TLS edge, Keycloak and local OTP, plus role-scoped access. It
also has a WAF, per-address login limits, IP bans and a two-stage trip wire.
Behind the edge sit hash-chained audit and security events, six correlation
rules, heartbeats and a daily HMAC anchor. Retention and dead-letter handling
guard the queue. An encrypted vault holds AES-GCM evidence and export manifests
with row and size caps. ClamAV scans every upload and encrypted age backups
protect the data. A supervised Vector pipeline, osquery inventory and a
Suricata sensor feed the security console. One verifier command checks the
whole stack. A CI workflow and a Docker lab carry the same checks.

Wazuh runs natively on arm64 now. One manager and one agent handle enrollment
and file integrity. A probe under `/lab` raised rule 554 and the row reached
the regulator inbox.

Keycloak carries a realm TOTP policy. The user `mfa1` must complete Mobile
Authenticator setup before any client signs it in. Users without an OTP
credential are not asked.

osquery runs as two LaunchAgents. One collects the inventory every five
minutes. The other posts a heartbeat every fifteen minutes.

Proof: live acceptance 36 of 36 on the host pair and 36 of 36 on Docker.
`npm test` 202 pass, Playwright 12 pass, coverage 90.50 percent lines against
a floor of 90, ZAP 0 high and 1 accepted medium. gitleaks, OSV, Trivy and
Semgrep are clean. Lynis index 75. `scripts/verify.sh` passes 8 of 8 gates.
The GitHub workflow passes on both the push and the pull request run at
44eeb96. An independent black-box pass passed 41 checks on the host pair and
38 of 39 on the Docker pair, with one lab difference for the missing scanner.
See `docs/TEST_LOG.md`, `docs/security/PENTEST_REPORT.md` and
`docs/security/`.

## What is partial

- Suricata runs under a root launchd daemon on loopback. A live probe raised
  SID 9000004 and Vector wrote it to `security_events`. The kernel still prints
  a capture capability warning. `-k none` makes loopback parsing work.
- Vector and the worker run under launchd. The worker writes the daily anchor,
  runs correlation and sweeps expiry.
- osquery works without Full Disk Access. The permission only adds protected
  paths and event tables. It needs one click in System Settings.
- The daily anchor is a local HMAC file, not an external timestamp authority.
- Security events are chained. Retention reports their age but does not
  delete them.
- The Docker lab seeds both databases on every `up`. Both apps speak plain HTTP
  inside its own network. It is a test lab, not the TLS deployment.
- The two-stage trip wire counts one address and one process. A distributed
  burst does not trip it.
- A Keycloak sign-in trusts the provider for the second factor. Realm MFA
  policy is the control for that path.

## What is blocked

- The Wazuh cluster and indexer are not built. One manager and one agent run
  natively.
- System keychain trust for the Caddy CA was denied by macOS without user
  interaction. Login keychain trust works.
- Push is intentionally disabled by choice.

## Manual owner steps

1. Grant Full Disk Access to osquery if you want protected paths and event
   tables.
2. Enrol the `mfa1` TOTP secret in an authenticator app if you want to demo a
   full provider sign-in.
3. Run `bash scripts/verify.sh` before a demo and keep the output.
4. Do not present the local controls as a commercial SOC, EDR, SIEM or DLP.
5. Start the Docker lab with `docker compose -f infra/docker-compose.yml up --build`
   and open http://localhost:9100 and http://localhost:9200.
