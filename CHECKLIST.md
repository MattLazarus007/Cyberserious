# Implementation checklist

Date: 22 October 2026. Status words: Done, Partial, Owner, N/A.
A Done row has a command or test in `docs/TEST_LOG.md`.

## Phase 0: baseline

- [x] Note host, tools, ports, database and listening sockets. Done.
- [x] Read the plan and the source bible constraints. Done.

## Phase 1: install

- [x] Install manifest and `--check` mode. Done.
- [x] suricata, gitleaks, docker/colima, clamav, semgrep, trivy, osv-scanner, lynis, caddy, syft, yq, vector, age, osquery. Done.
- [ ] Wazuh manager. Blocked: segfault under qemu on arm64. Documented as not working.
- [x] ZAP via Docker image. Done.

## Phase 2: keys, vault and secrets

- [x] Keychain helper and names. Done.
- [x] Vault sparsebundle create, mount, status. Done.
- [x] age recipient and backup identity. Done.
- [x] Evidence and research keys generated outside source. Done.
- [x] No secret in git. gitleaks clean.

## Phase 3: host, permissions and network

- [x] umask, file modes, evidence and log permissions. Done.
- [x] Application firewall on. Done.
- [x] pf anchor with loopback ports and bad table. Done.
- [x] Regulator and organisation bind loopback. Done.
- [x] TLS edge with trusted local CA. Done for the login keychain.
- [ ] System keychain trust. Owner: macOS denied the prompt. Login keychain trust works.
- [x] mTLS intake. Done.
- [x] Request origin guard and body limits. Done.

## Phase 4: application controls

- [x] Header policy, CSP, HSTS, COOP, CORP, COEP. Done.
- [x] WAF signatures and audit. Done.
- [x] Login throttle and IP ban. Done.
- [x] Session, role, OTP and trip wire. Done.
- [x] Upload allowlist, magic bytes and AV gate. Done.
- [x] Evidence AES-GCM at rest. Done.
- [ ] Keycloak TOTP or WebAuthn enrollment. Partial: app OTP enforced; realm policy needs an owner decision.

## Phase 5: antivirus, backup and scanning

- [x] ClamAV supervised, EICAR proof, upload scan. Done.
- [x] Sealed backup and restore rehearsal. Done.
- [x] gitleaks, OSV, Trivy, Semgrep. Done.
- [x] ZAP baseline with triage. Done.
- [x] Lynis host audit. Done.

## Phase 6: detection and monitoring

- [x] Security event store with hash chain. Done.
- [x] Ingest API with shared token and rate limit. Done.
- [x] High severity correlation into alerts. Done.
- [x] Heartbeats and 15 minute silence. Done.
- [x] Security page with state and verify. Done.
- [x] Vector pipeline config validated. Done.
- [x] Vector running under a launchd agent. Done.
- [x] Suricata local rules and replay proof. Done.
- [x] Suricata live alerts. Done: SID 9000004 fired and reached the store.
- [x] Daily audit anchor with HMAC and immutable flag fallback. Done.
- [x] DLP export row and size cap. Done.

## Phase 7: assurance

- [x] Secrets, dependency, filesystem and SAST gates. Done.
- [x] Integration and browser suites. Done.
- [x] Security page browser test. Done.
- [x] One command verifier. `bash scripts/verify.sh`.
- [x] CI workflow. File exists; it runs on a host that can push.
- [x] Manual pentest checklist with honest gaps. Done.
- [ ] External penetration test. N/A with recorded limit.

## Phase 8: documentation

- [x] Install stack runbook. Done.
- [x] Monitoring, host telemetry, ingress, key rotation, vulnerability management. Done.
- [x] Control equivalence matrix. Done.
- [x] Threat model, data classification, program, operations. Done.
- [x] DAST report and pentest record. Done.
- [x] Host baseline re-run and test log. Done.

## Phase 9: closeout

- [x] Honest status and owner steps. This file and `STATUS.md`.
- [x] Commit in coherent batches.
- [ ] Push. N/A: remote is intentionally disabled.
- [ ] Keycloak realm MFA. Owner/open. External anchor remains local, by design.
