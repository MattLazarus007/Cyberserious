# Control equivalence: requested technologies to lab controls

Date: 22 October 2026. Scope: the CyberSerious lab on one macOS host.
Every row names the control that exists here, the command that proves it, and
the gap that remains. A plan is not a tick. Where a technology is absent, the
row says N/A and names the compensating control.

## Requested security technologies

| Requested | Lab control | Where it lives | Proof | Status |
|---|---|---|---|---|
| Firewall | macOS application firewall on, pf anchor limited to loopback ports 8100, 8101, 8200, 8443, 8444, persistent bad-address table | `infra/pf/cyberserious.anchor`, `scripts/pf-firewall.sh` | `sudo pfctl -a cyberserious -sr`; `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate` | Installed and applied |
| IDS / IPS | Suricata 8.0.7 with four local lab rules, pcap replay and a live loopback capture under launchd | `infra/sensor/`, `scripts/suricata.sh` | `bash scripts/suricata.sh replay`; `curl http://127.0.0.1:8100/waf-test` while the daemon runs; `infra/sensor/out/eve.json` shows SID 9000004 | IDS installed, replay and live alert proven. Inline IPS is N/A: no inline network segment |
| EDR | osquery 5.24 inventory daemon plus application audit trail and file change review. No kernel sensor or response agent | `/usr/local/bin/osqueryi`, `/var/osquery/io.osquery.agent.plist` | `bash scripts/osquery.sh status`; `bash scripts/osquery.sh query "select * from listening_ports;"` | Partial. Commercial EDR is N/A. Full Disk Access and EndpointSecurity approval are owner steps |
| SIEM | Chained `security_events` store, ingest API, six correlation rules, heartbeats, security page, supervised Vector 0.60 pipeline | `apps/regulator/server/securitylog.ts`, `correlation.ts`, `routes/security-ingest.ts`, `infra/vector/vector.toml` | `curl` a signed ingest event; `GET /api/v1/security/state`; `node scripts/verify-chain.mjs`; `bash scripts/vector.sh status`; a live Suricata alert reached `security_events` | Partial. Local SIEM pattern, no external SIEM. Wazuh manager crashes under qemu on arm64 |
| DLP | Export manifests and audit notices on every extraction, row cap (5000) and size cap (5 MiB), PII counts without values, ciphertext evidence, no endpoint or mail DLP | `apps/regulator/server/dlp.ts`, `routes/evidence.ts`, `docs/security/DATA_CLASSIFICATION.md` | `GET /api/v1/cases/:id/export` returns a manifest and marking; `tests/integration/dlp.test.ts` refuses 5001 rows and a 5 MiB body | Partial. Endpoint and CASB DLP are N/A in a single-host lab |
| Antivirus | ClamAV 1.5.4 daemon, freshclam every 6 hours, upload scan before storage, EICAR proof, quarantine and reviewer verdict | `infra/clamav/`, `scripts/clamav.sh`, `apps/regulator/server/scan.ts` | `bash scripts/clamav.sh test`; upload EICAR -> 422 | Installed and proven. `CLAMAV_REQUIRED=1` is the production setting. The default lab is fail-open with an audit event |
| Email security gateway | N/A. The lab has no mail surface; notices are synthetic records and recorded dispatch | `docs/security/THREAT_MODEL.md` | `docs` statement and org notice tests | N/A with compensating control: no inbound mail, no link clicking, notices never claim delivery |
| Cloud WAF | N/A. No cloud edge. Application WAF, Caddy TLS edge, CSP, origin guard and IP rate limits stand in | `waf.ts`, `infra/caddy/Caddyfile`, `rate-limit.ts` | WAF probe returns 403 and writes an event; ZAP baseline 0 high or medium | N/A with compensating control: local WAF plus edge headers |

## Additional controls built here

| Control | Implementation | Proof |
|---|---|---|
| TLS edge | Caddy internal CA, HTTP/2, HSTS, no Server header, 12 MB body cap | `bash scripts/caddy.sh status`; `curl -sI https://localhost:8443/health/live` |
| mTLS intake | Client certificate listener on 8101 | `npm test -- mtls` (suite) |
| Identity and session | Keycloak 18080 OIDC, app OTP step, session revocation, role policy | `tests/integration/oidc.test.ts`, `auth.test.ts`, `tests/unit/policy.test.ts` |
| Authorization | Role by action matrix, org scoping, analyst assignment scope | `tests/unit/policy.test.ts`, `tests/integration/security-controls` |
| Audit integrity | SHA-256 hash chain over audit events and security events | `GET /api/v1/audit/verify`; `GET /api/v1/security/verify`; T-31 |
| Secrets | macOS Keychain, sealed vault identity, base64 storage for multiline values | `bash scripts/keychain.sh exists vault`; `bash scripts/vault.sh status` |
| Encrypted storage | AES-256-GCM evidence at rest when `EVIDENCE_KEY` is set; 8 GiB encrypted sparsebundle | `tests/integration/evidence-sealed.test.ts`; `hdiutil info` |
| Backup and restore | age-sealed archive, checksum, unseal and `pg_restore` rehearsal | `bash scripts/backup.sh --dry-run`; `docs/runbooks/restore.md` |
| Vulnerability management | gitleaks, OSV, Trivy, Semgrep, dependency audit, ZAP baseline | `bash scripts/security-scan.sh all`; `docs/security/SCANS.md`; `docs/security/DAST_REPORT.md` |
| Host audit | Lynis 3.1.7 report with hardening index and decisions | `docs/security/LYNIS-2026-10-22.txt` |
| Monitoring | Sensor and collector heartbeats, 15 minute silence flag, queue readiness | `GET /api/v1/security/state`; `GET /health/ready` |
| Incident response | Severity runbook with containment, evidence, POPIA internal clock | `docs/runbooks/incident.md` |
| Log anchor | Daily HMAC-SHA-256 anchor row written by the supervised worker, verified by CLI | `apps/regulator/server/anchor.ts`, `scripts/anchor.mjs` | `bash scripts/anchor.mjs verify` prints `{"ok":true,...}` |
| Service supervision | launchd agents for regulator, organisation, Caddy, Vector, worker, ClamAV and osquery; root daemon for Suricata | `infra/launchd/`, `scripts/{regulator,organisation,caddy,vector,worker,suricata}.sh` | `launchctl print gui/$(id -u)/com.cyberserious.worker`; kill a PID and see it return |
| Retention | Sessions (12 h or 30 min idle), resolved alerts (180 d), terminal jobs (30 d), dead-letter alert at 8 attempts. Chained events are counted, not deleted | `apps/regulator/server/retention.ts`, `worker.ts` | `tests/integration/retention.test.ts` |

## Deviations and honest limits

1. **No external penetration test.** ZAP baseline and the manual checklist are not a substitute. The record says so.
2. **No inline IPS.** Suricata observes; it does not drop packets on a span port here.
3. **No commercial EDR or SIEM.** osquery plus the local chained store show the pattern, not 24/7 coverage.
4. **Wazuh manager fails on arm64 under qemu.** The attempt is recorded; no Wazuh row is claimed as working.
5. **Keycloak TOTP is optional in the realm export.** The application enforces its own per-session OTP. Keycloak MFA enrollment needs an owner decision.
6. **The anchor is local.** The worker writes one HMAC anchor per UTC day and the CLI verifies it. It is not published to an external timestamp authority. Security events are not deleted by the retention sweep because deleting a row would break the hash chain; the sweep reports the count older than 90 days instead.
7. **osquery Full Disk Access is an owner approval.** The daemon is loaded and inventory queries work; endpoint security events need the approval.
8. **Caddy trust is in the login keychain.** The system keychain trust prompt was denied by macOS; the user trust works for this account.
