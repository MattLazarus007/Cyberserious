# Status

Date: 22 October 2026. Branch `build`.

## What works

The lab runs a POPIA breach register with a TLS edge, Keycloak and local OTP,
role-scoped access, a WAF, per-address login limits, IP bans, hash-chained
audit and security events, six correlation rules, heartbeats, a daily HMAC
anchor, retention and dead-letter handling, an encrypted vault, AES-GCM
evidence, export manifests with row and size caps, ClamAV upload scanning,
encrypted age backups, a supervised Vector telemetry pipeline, osquery
inventory, Suricata replay detection, a security page, a one-command
verifier, and a CI workflow.

Proof: `npm test` 178 pass, Playwright 12 pass, ZAP 0 high or medium,
gitleaks, OSV, Trivy and Semgrep clean, Lynis index 75, ZAP 0 high and 1 accepted medium. See
`docs/TEST_LOG.md` and `docs/security/`.

## What is partial

- Suricata runs under a root launchd daemon on loopback. A live
  `http://127.0.0.1:8100/waf-test` probe raised SID 9000004 and Vector wrote it
  to `security_events`. The kernel still prints a capture capability ioctl
  warning; `-k none` makes loopback parsing work.
- Vector and the worker run under launchd agents; the worker writes the daily
  anchor, runs correlation and sweeps expiry.
- osquery inventory works; Full Disk Access needs an owner approval.
- Keycloak OIDC works; Keycloak-side TOTP enrollment is not configured. The
  app enforces its own OTP step.
- The daily anchor is local HMAC, not an external timestamp authority.
- Security events are chained, so retention reports age but does not delete.

## What is blocked

- Wazuh manager segfaults under qemu on arm64. No Wazuh row is claimed.
- System keychain trust for the Caddy CA was denied by macOS without user
  interaction. Login keychain trust works.
- Push is intentionally disabled.

## Manual owner steps

1. Grant Full Disk Access to osquery in System Settings.
2. Decide whether Keycloak should require TOTP or WebAuthn at the realm.
3. Run `bash scripts/verify.sh` before a demo and keep the output.
4. Do not present the local controls as a commercial SOC, EDR, SIEM or DLP.
