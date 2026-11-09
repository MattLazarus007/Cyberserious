# Status

Date: 9 November 2026. Branch `build`.

## What works

The lab runs a POPIA breach register with a TLS edge, Keycloak and local OTP,
role-scoped access, a WAF, per-address login limits, IP bans, a two-stage
trip wire, hash-chained audit and security events, six correlation rules,
heartbeats, a daily HMAC anchor, retention and dead-letter handling, an
encrypted vault, AES-GCM evidence, export manifests with row and size caps,
ClamAV upload scanning, encrypted age backups, a supervised Vector telemetry
pipeline, osquery inventory, Suricata replay detection, a security page, a
one-command verifier, a CI workflow and a Docker lab stack.

Proof: live acceptance 36 of 36 on the host and 36 of 36 on Docker. `npm test` 202 pass, Playwright 12 pass, `npm run test:coverage` 90.50
percent lines with a floor of 90, ZAP 0 high and 1 accepted medium, gitleaks,
OSV, Trivy and Semgrep clean, Lynis index 75. See `docs/TEST_LOG.md` and
`docs/security/`.

## What is partial

- Suricata runs under a root launchd daemon on loopback. A live
  `http://127.0.0.1:8100/waf-test` probe raised SID 9000004 and Vector wrote it
  to `security_events`. The kernel still prints a capture capability ioctl
  warning; `-k none` makes loopback parsing work.
- Vector and the worker run under launchd agents; the worker writes the daily
  anchor, runs correlation and sweeps expiry.
- osquery runs as a user daemon with a five-minute inventory schedule, and a
  heartbeat reaches the regulator. Full Disk Access is still needed for
  protected paths and event tables.
- Keycloak OIDC works. Realm-side TOTP is configured: user mfa1 must complete
  Mobile Authenticator setup before any client signs it in. The other lab users
  carry no OTP credential and are not asked for a code.
- The daily anchor is local HMAC, not an external timestamp authority.
- Security events are chained, so retention reports age but does not delete.
- The Docker lab seeds both databases on every `up`, and both apps speak plain HTTP inside the compose network. It is a test lab, not the TLS deployment.
- The two-stage trip wire counts one address and one process. A distributed burst does not trip it.

## What is blocked

- The Wazuh cluster and indexer are not built. One manager and one agent run
  natively on arm64 and a FIM alert reaches the regulator inbox.
- System keychain trust for the Caddy CA was denied by macOS without user
  interaction. Login keychain trust works.
- Push is intentionally disabled.

## Manual owner steps

1. Grant Full Disk Access to osquery in System Settings if you want protected
   paths and event tables.
2. Optional: enrol the mfa1 TOTP secret in an authenticator app.
3. Run `bash scripts/verify.sh` before a demo and keep the output.
4. Do not present the local controls as a commercial SOC, EDR, SIEM or DLP.
5. Start the Docker lab with `docker compose -f infra/docker-compose.yml up --build` and open http://localhost:9100 and http://localhost:9200.
