# Criterion 4: Deploy security technologies and controls

Evidence pack for CyberSerious, captured on 22 October 2026.

This section answers the criterion in four steps: what was installed, how it
was configured, how it was proven to work, and what remains out of scope. The
proof is a mix of live commands, logs, database state, browser screens and
scanner reports. It does not rely on a claim that a tool was "installed". Each
tool has a running process, a configuration file, and an observable result.

## 4.1 Scope statement

The deployment is a security stack on a macOS 26.5 arm64 lab host. It uses the
host packet filter as the network boundary, a TLS reverse proxy as the only
inbound listener, loopback-only application services, a network sensor, a log
shipper, endpoint antivirus, integrity anchors, and a set of scanners used in
the build and test gates.

No dedicated physical security appliance was purchased. The equivalent
functions are provided by host software: pf for filtering, Caddy for the TLS
edge, Suricata for network detection, Vector for shipping, ClamAV for endpoint
malware scanning, and PostgreSQL for the evidence store. This is stated plainly
so the reader does not mistake the lab for a hardware deployment.

## 4.2 What was deployed

| Layer | Technology | Configuration | Proof |
| --- | --- | --- | --- |
| Network boundary | pf host firewall | `scripts/pf-firewall.sh`, anchor `cyberserious` | Default block inbound, loopback allow list, bad-address table |
| TLS ingress | Caddy 2.11.7 | `infra/caddy/Caddyfile` | HTTP/2 200, TLS 1.3, HSTS, CSP, COEP, COOP, frame deny |
| Identity and access | App login with OTP, RBAC, per-IP throttle | `apps/regulator/server/routes/auth.ts` | Analyst refused, reviewer allowed, auth failures logged |
| Network detection | Suricata 8.0.7 | `infra/sensor/suricata.yaml`, `local.rules` | Live loopback alert SID 9000004 on `/waf-test` |
| Log shipping | Vector 0.60.0 | `infra/vector/vector.toml`, `scripts/vector-run.sh` | Suricata alert written to `security_events` |
| Correlation | In-app worker rules | `apps/regulator/server/correlation.ts` | AUTH-BURST, RBAC-PROBE, EXTRACT-BURST, CHAIN-BREAK, SENSOR-SILENT, BACKUP-MISS, DEAD-LETTER |
| Log integrity | SHA-256 hash chain, HMAC anchor | `securitylog.ts`, `anchor.ts`, migration 017 | 12 rows intact, 1 anchor verified |
| Export control | Manifest, PII counts, row and byte caps | `apps/regulator/server/dlp.ts`, migration 018 | Tests cover cap, manifest, PII count |
| Retention | Timed sweep and dead jobs | `apps/regulator/server/retention.ts`, migration 019 | Tests cover sweep and dead state |
| Endpoint malware | ClamAV 1.5.4 | `data/clamav/clamd.conf` | clamd running, signature database 28161 |
| Secret and code scanning | gitleaks 8.30.1, semgrep 1.182.0 | `scripts/verify.sh`, CI workflow | Secret gate and static analysis gate pass |
| Dependency and image scanning | trivy 0.76.1, osv-scanner 2.7.0 | `scripts/verify.sh`, `docs/security` | Dependency gate pass |
| Host review | Lynis 3.1.7, osquery 5.24.0 | `docs/security/HOST_BASELINE.md` | Baseline captured, osquery approval noted as a gap |
| Dynamic testing | OWASP ZAP baseline | `docs/security/zap.yaml`, `DAST_REPORT.md` | 0 high, 1 medium (CSP fallback on two 404 paths, accepted), 0 low, 4 informational |
| Backup and sealing | CyberVault sparsebundle, age, AES-GCM | `scripts/backup.sh`, `apps/regulator/server/evidence.ts` | Backup dry run pass, sealed evidence magic bytes checked |
| Process supervision | launchd | `infra/launchd/*.plist.in` | Caddy and Vector killed, both restarted automatically |

## 4.3 Figures and screenshots

All fourteen figures are captured. They sit in `docs/security/evidence/` and
are compiled with their explanations in
`~/cyberserious-notes/Criterion-4-Deploy-Security-Technologies-and-Controls.docx`.
The shot cards below stay as the record of how each capture was made.


Three figures are already captured:

- Figure 4.1 `docs/security/evidence/deployment-map.png`. Deployment map. It
  shows the operator, TLS edge, application tier, data tier, host firewall,
  Suricata, Vector, endpoint scanners, and the control loop.
- Figure 4.2 `docs/security/evidence/security-console.png`. Security Control
  State page signed in as `reviewer1`. It shows 12 events, chain Intact, 12
  rows checked, open alerts, heartbeats for app and suricata, empty exports,
  and the ban table.
- Figure 4.3 `docs/security/evidence/operations-dashboard.png`. Reviewer
  dashboard. It shows that the security role also has the normal case view,
  so the control is part of the product and not a separate mock page.

Take the remaining screenshots with these exact steps. Crop to the terminal
window or browser content, and keep the command visible above the output.

### Figure 4.4 Services are installed and running

Run:

```bash
for l in regulator organisation caddy vector worker clamd freshclam; do
  echo "-- com.cyberserious.$l"
  launchctl print gui/$(id -u)/com.cyberserious.$l 2>/dev/null | grep -E "state =|pid ="
done
echo "-- suricata"
launchctl print system/com.cyberserious.suricata 2>/dev/null | grep "state ="
```

Capture the block that shows `state = running` for regulator, organisation,
caddy, vector, worker, clamd, and suricata. Caption: "Figure 4.4 Security
services under launchd supervision."

### Figure 4.5 Host firewall rule set

Run:

```bash
osascript -e 'do shell script "pfctl -a cyberserious -sr" with administrator privileges'
```

Capture the rule list. It must show the bad-address drop, the block on non-lo0,
the loopback allow list for 8100, 8101, 8200 and 8443, and the outbound allow.
Caption: "Figure 4.5 pf anchor enforces the host boundary."

### Figure 4.6 TLS edge and response headers

Run:

```bash
curl -sI https://localhost:8443/health/live
```

Capture the status line and the headers for `strict-transport-security`,
`content-security-policy`, `cross-origin-embedder-policy`,
`cross-origin-opener-policy`, `permissions-policy`, and `referrer-policy`.
Caption: "Figure 4.6 Caddy terminates TLS and adds the browser security
headers."

Optional second shot: open `https://localhost:8443` in the browser, click the
padlock, and capture the certificate subject and issuer. Do not show a browser
warning. If the browser does not trust the local CA, use the header screenshot
instead and state that trust is in the login keychain only.

### Figure 4.7 Integrity chain and anchor verification

Run:

```bash
source scripts/env.sh
node scripts/verify-chain.mjs
node scripts/anchor.mjs --verify
```

Capture both JSON lines. Caption: "Figure 4.7 Audit and security chains verify,
and the daily anchor matches the sealed head."

### Figure 4.8 Suricata detection on the wire

Run:

```bash
rg '"signature_id":9000004' infra/sensor/out/eve.json | tail -1
bash scripts/suricata.sh replay
```

Capture the eve JSON line and the replay output. The line shows the timestamp,
the signature "LAB controlled waf-test probe", the URL `/waf-test`, and the
loopback addresses. Caption: "Figure 4.8 Suricata fires a custom rule on a live
loopback request."

### Figure 4.9 Antivirus is live

Run:

```bash
/opt/homebrew/opt/clamav/sbin/clamd \
  --config-file=data/clamav/clamd.conf --version
launchctl print gui/$(id -u)/com.cyberserious.clamd | grep -E "state =|pid ="
```

Capture the ClamAV version and signature date, plus the running state. Caption:
"Figure 4.9 ClamAV engine and signature database are current."

### Figure 4.10 Scanner results

Open `docs/security/DAST_REPORT.md` and capture the ZAP summary table. If a raw
ZAP HTML report exists in your submission copy, use that instead. Caption:
"Figure 4.10 ZAP baseline found no high or medium issues; low items were
triaged."

### Figure 4.11 Supervision proof

Use the existing restart record from `docs/TEST_LOG.md` (T-112). If you want a
fresh screenshot, run:

```bash
launchctl print gui/$(id -u)/com.cyberserious.caddy | grep -E "state =|pid ="
kill -9 <caddy-pid>
sleep 2
launchctl print gui/$(id -u)/com.cyberserious.caddy | grep -E "state =|pid ="
```

Capture the two process IDs and the running state after the kill. Caption:
"Figure 4.11 launchd restarts a killed security service."

## 4.4 Written explanation for the report

The deployment follows a defence-in-depth model. The first layer is the host
packet filter. It blocks inbound traffic by default, permits only the loopback
ports used by the application, and drops addresses placed on the bad-address
table. The second layer is the TLS edge. Caddy is the only inbound listener. It
terminates TLS, adds HSTS, a strict content security policy, cross-origin
isolation headers, a permissions policy, and a referrer policy, and forwards
requests to services that are bound to 127.0.0.1. The third layer is the
application. Login requires a password and a one-time code, roles decide which
pages and API routes are reachable, repeated failures are throttled per source
address, and failures create security events.

Detection is deployed beside the application. Suricata runs as a root launchd
daemon on the loopback interface. It loads four lab rules and writes EVE JSON.
Vector reads that file, adds the internal token, and posts each alert to the
token-protected ingest route. The ingest route writes the event into the
security_events table, updates a heartbeat, and opens an alert for high
severity events. The worker then applies correlation rules such as AUTH-BURST,
RBAC-PROBE, EXTRACT-BURST, CHAIN-BREAK, SENSOR-SILENT, BACKUP-MISS, and
DEAD-LETTER. The reviewer sees the result on the Security Control State page.
This path was proven with a live request to `/waf-test`, which produced SID
9000004 and a row in `security_events` with source `suricata`.

Integrity is treated as a control, not a log format. Audit events and security
events each form a SHA-256 hash chain. Each row includes the previous hash, and
verification recomputes every digest in order. A daily HMAC anchor signs the
head of both chains and is stored in the database and as a read-only file. The
verifier now also checks that the anchored audit and security rows still exist
and still carry the anchored hash. Deleting or editing an anchored row therefore
fails verification. Evidence exports write a manifest with actor, resource,
row count, byte count, and PII pattern counts, and they are capped at 5000 rows
and 5 MiB. Retention sweeps remove expired low-value data while the chained
security events are counted rather than deleted.

The supporting tools cover the rest of the lifecycle. ClamAV runs as a launchd
job with an update job for signatures. gitleaks checks for committed secrets,
semgrep checks static patterns, trivy and osv-scanner check dependencies, Lynis
records a host baseline, and OWASP ZAP runs a baseline scan against the TLS
edge. The same checks are wired into `scripts/verify.sh` and the CI workflow.
Backups are encrypted into the CyberVault sparsebundle, and a dry run is part of
the gate. launchd supervises the long-running services, which was tested by
killing Caddy and Vector and watching both return with new process IDs.

The final verification run passed 8 of 8 gates: tool manifest, secrets,
dependencies, static analysis, test suite, browser suite, audit chains, and
backup dry run. That result is the evidence that the deployment is not only
installed, but configured and checked.

## 4.5 Evidence appendix

Captured output on 22 October 2026:

```text
macOS 26.5 (25F71), arm64

suricata     Suricata 8.0.7
gitleaks     gitleaks version 8.30.1
semgrep      1.182.0
trivy        Version: 0.76.1
osv-scanner  osv-scanner version: 2.7.0
lynis        3.1.7
caddy        v2.11.7
vector       vector 0.60.0 (aarch64-apple-darwin)
age          v1.3.2
yq           v4.54.1
ClamAV       1.5.4/28161/Thu Oct 22 08:24:11 2026
```

```text
com.cyberserious.regulator      running
com.cyberserious.organisation   running
com.cyberserious.caddy          running
com.cyberserious.vector         running
com.cyberserious.worker         running
com.cyberserious.clamd          running
com.cyberserious.suricata       running
```

```text
block drop in quick from <cyberserious_bad> to any
block drop in quick on ! lo0 all
pass in quick on lo0 inet proto tcp from any to 127.0.0.1 port = 8100
pass in quick on lo0 inet proto tcp from any to 127.0.0.1 port = 8101
pass in quick on lo0 inet proto tcp from any to 127.0.0.1 port = 8200
pass in quick on lo0 inet proto tcp from any to 127.0.0.1 port = 8443
pass out quick all flags S/SA keep state
```

```text
HTTP/2 200
strict-transport-security: max-age=31536000; includeSubDomains
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none';
  frame-src 'none'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'
cross-origin-embedder-policy: require-corp
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
permissions-policy: camera=(), microphone=(), geolocation=()
referrer-policy: no-referrer
```

```text
{"audit":{"ok":true,"checked":238},"security":{"ok":true,"checked":12}}
{"ok":true,"checked":1}
```

```text
2026-10-22T14:06:43.825312+0200
LAB controlled waf-test probe
/waf-test
127.0.0.1 -> 127.0.0.1:8100
```

```text
security_events = 12
audit_events    = 238
open alerts     = 18 (12 high, 6 medium)
```

The counts move as the lab is used. The proof is the verification result, not
the exact number of rows.

## 4.6 Honest limitations

- This is a host-based lab, not a hardware appliance or a segmented production
  network. pf and Caddy provide the boundary in the lab.
- Suricata is deployed as an IDS. It detects and logs. It is not inline and does
  not drop packets. Blocking is done by pf and by the application ban list.
- The pf bad-address table is applied by the owner. The web page shows the
  application ban list and labels the pf step separately.
- Wazuh does not run on this arm64 host because the manager segfaults under
  qemu. Vector plus the in-app correlation rules cover the shipping and alerting
  path that is shown here.
- osquery is installed but its Full Disk Access and EndpointSecurity approval is
  a manual macOS step. The security page reports host telemetry as missing
  rather than claiming it is present.
- The local Caddy CA is trusted in the login keychain, not system-wide. The
  header capture and `curl` proof do not depend on that trust.
- Keycloak is present for the organisation app, but optional realm-side MFA is
  not enabled. The enforced MFA step in the regulator app is the application
  OTP.
- Keys are held in the macOS Keychain, not in a hardware HSM. That is a lab
  choice and should be replaced for production.

## 4.7 Short answers for a viva

**What did you deploy?** A host firewall, a TLS reverse proxy, an application
with MFA and RBAC, a network IDS, a log shipper, an evidence store with hash
chains and an HMAC anchor, endpoint antivirus, scanners, encrypted backups, and
launchd supervision.

**How do you know it is running?** launchd reports `state = running` for each
service, the health endpoint returns 200 through Caddy, and a live Suricata rule
produced an event that reached the database.

**How do you know the logs were not edited?** Each audit and security row stores
the previous hash. Verification recomputes the chain. The daily anchor signs the
head, and the verifier checks that the anchored rows still exist with the same
hash.

**What is the strongest proof?** The end-to-end path: request to `/waf-test`,
Suricata alert SID 9000004, Vector shipment, security_events row, reviewer
console showing chain Intact, and `verify-chain` returning `ok: true`.

**What is not covered?** Physical appliance hardening, inline IPS blocking,
Wazuh on this architecture, osquery host approval, system-wide CA trust, and
hardware-backed keys. These are listed as limitations, not hidden.
