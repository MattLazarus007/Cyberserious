# Status

Date: 22 October 2026. Branch `build`.

## What works

The lab runs a POPIA breach register with a TLS edge, Keycloak and local OTP,
role-scoped access, a WAF, per-address login limits, IP bans, hash-chained
audit and security events, correlation into alerts, heartbeats, an encrypted
vault, AES-GCM evidence, ClamAV upload scanning, encrypted age backups, a
vector telemetry pipeline, osquery inventory, Suricata replay detection, a
security page, a one-command verifier, and a CI workflow.

Proof: `npm test` 164 pass, Playwright 12 pass, ZAP 0 high or medium, gitleaks,
OSV, Trivy and Semgrep clean, Lynis index 75. See `docs/TEST_LOG.md` and
`docs/security/`.

## What is partial

- Suricata live capture starts but produced no alert; pcap replay is proven.
- Vector config validates; a launchd job is not installed.
- osquery inventory works; Full Disk Access needs an owner approval.
- Keycloak OIDC works; Keycloak-side TOTP enrollment is not configured. The
  app enforces its own OTP step.
- Evidence export has a manifest and marking; a hard row and size cap is open.
- Audit chains verify rows; a daily external anchor is open.

## What is blocked

- Wazuh manager segfaults under qemu on arm64. No Wazuh row is claimed.
- System keychain trust for the Caddy CA was denied by macOS without user
  interaction. Login keychain trust works.
- Push is intentionally disabled.

## Manual owner steps

1. Grant Full Disk Access to osquery in System Settings.
2. Decide whether Keycloak should require TOTP or WebAuthn at the realm.
3. Install launchd jobs for Caddy and Vector if the lab must survive logout.
4. Run `bash scripts/verify.sh` before a demo and keep the output.
5. Do not present the local controls as a commercial SOC, EDR, SIEM or DLP.
