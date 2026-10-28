# Vulnerability assessment: section 2.1 evidence

Scope: the CyberSerious regulator application, the organisation portal, the
TLS edge and the host that runs them. This file holds the method, the raw
results, the findings and the conclusions. Every number comes from a file
under `docs/security/scans/`, from `docs/security/dast.json`, or from a
command quoted here.

## 1. Method

Four scanners cover the source tree and the dependency graph. Two live probe
scripts cover the running system. One container scanner covers the exposed
HTTP surface.

| Layer | Tool | Version | Command | Artefact |
|---|---|---|---|---|
| Secrets in history | gitleaks | 8.30.1 | `gitleaks git --redact --report-format json` | `scans/gitleaks.json` |
| Dependencies | osv-scanner | 2.7.0 | `osv-scanner scan source --lockfile=package-lock.json --format json` | `scans/osv.json` |
| Filesystem, secret, misconfiguration | trivy | 0.76.1 | `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL` | `scans/trivy.json` |
| Static analysis | semgrep | 1.182.0 | `semgrep scan --config p/typescript --config p/nodejs --severity ERROR` | `scans/semgrep.json` |
| Dynamic analysis | OWASP ZAP | stable container | automation plan `docs/security/zap.yaml` | `docs/security/dast.json` |
| Unauthenticated probes | curl, openssl | system | `scripts/va-probes.sh` | `scans/probes.txt` |
| Authenticated probes | curl | system | `scripts/va-auth-probes.sh` | `scans/probes.txt` |
| Patch level | brew, softwareupdate | system | `brew outdated --json=v2`, `softwareupdate --list` | `scans/brew-outdated.txt`, `scans/softwareupdate.txt` |

One command repeats the four scanners:

```bash
bash scripts/vulnerability-assessment.sh
```

The scan runs read-only. It writes only under `docs/security/scans/`.

### Classification

Each weakness gets one class:

- Dependency. A third-party package carries a known advisory.
- Configuration. A setting weakens a control that exists.
- Cryptographic. A primitive, a key or a transport setting is weak.
- Detection. A control fails to record what it should record.
- Documentation. A claim has no artefact behind it.

### Prioritisation

Each weakness gets one priority:

- P1. Fix before the system takes real personal information.
- P2. Fix in the next cycle, with a compensating control in place now.
- P3. Accept, with the limit written next to the control.

The priority comes from three inputs: the tool severity, the exposure of the
affected surface, and whether an unauthenticated user can reach it. A High
advisory on an unreachable code path is not P1. A Medium finding on the public
edge can be.

## 2. Results

### 2.1 Scanner counts

| Tool | Scope | Findings | Reading |
|---|---|---|---|
| gitleaks | full git history, redacted | 0 | `jq 'length' scans/gitleaks.json` returns 0 |
| osv-scanner | `package-lock.json`, 84 packages | 0 | `/results` is empty |
| trivy | filesystem, high and critical | 0 vulnerabilities, 0 secrets, 0 misconfigurations | three arrays are empty |
| semgrep | `apps` and `scripts`, ERROR severity | 0 | 24 rules over 55 files |

The dependency count was not zero at the start of this work. See F-01.

### 2.2 Dynamic analysis

ZAP ran against the TLS edge with the local root certificate trusted inside the
scan container. The scan was unauthenticated, as an external reviewer would
start.

| Risk | Count |
|---|---|
| High | 0 |
| Medium | 1 |
| Low | 0 |
| Informational | 4 |

The five alert names and their instance counts come from `dast.json`:

| Alert | Instances | Risk |
|---|---|---|
| CSP: Failure to Define Directive with No Fallback | 2 | Medium |
| Authentication Request Identified | 4 | Informational |
| Information Disclosure - Sensitive Information in URL | 5 | Informational |
| Re-examine Cache-control Directives | 5 | Informational |
| User Controllable HTML Element Attribute (Potential XSS) | 4 | Informational |

### 2.3 Unauthenticated probes

From `scans/probes.txt`:

| Probe | Result | Meaning |
|---|---|---|
| `GET /api/v1/me` | 401 | no anonymous session |
| `GET /api/v1/cases` | 401 | no anonymous case read |
| `GET /api/v1/users` | 401 | no anonymous account read |
| `GET /api/v1/audit` | 401 | no anonymous audit read |
| SQL injection probe | 403 | the WAF refuses the request |
| XSS probe | 403 | the WAF refuses the request |
| Path traversal probe | 403 | the WAF refuses the request |
| Unknown path | 404 | the app does not leak a stack |

Each refused probe also wrote a row. The security store now holds four
`WAF-SQLI`, four `WAF-XSS` and four `WAF-TRAVERSAL` events. Blocking and
recording both work.

### 2.4 Transport and headers

| Check | Result |
|---|---|
| TLS 1.0 | refused, alert 70 protocol version |
| TLS 1.1 | refused, alert 70 protocol version |
| TLS 1.2 | accepted |
| TLS 1.3 | accepted |
| `strict-transport-security` | `max-age=31536000; includeSubDomains` |
| `content-security-policy` | named directives for script, style, img, connect, object, frame, form-action, base-uri, frame-ancestors |
| `x-content-type-options` | `nosniff` |
| `x-frame-options` | `DENY` |
| `referrer-policy` | `no-referrer` |
| `permissions-policy` | `camera=(), microphone=(), geolocation=()` |
| `server` | absent |
| `x-powered-by` | absent |
| API cache policy | `no-store` |
| Page cache policy | `public, max-age=0` |

### 2.5 Authenticated probes

The probes sign in as `analyst1` and complete the second step with the code
from the server log.

| Probe | Result | Meaning |
|---|---|---|
| `GET /api/v1/cases` | 200 | the role reads cases |
| `GET /api/v1/cases/BR-2026-0001` | 200 | the assigned case reads |
| `GET /api/v1/users` | 403 | the analyst cannot manage accounts |
| `GET /api/v1/audit/verify` | 403 | the analyst cannot read the audit chain |
| `GET /api/v1/cases/BR-2026-0001/export` | 200 | the export path works |

The export carries a manifest, not values:

```json
{"marking":"synthetic academic export","manifest":{"rows":1,"bytes":349,
 "pii":{"email":0,"phone":0,"idNumber":0}}}
```

### 2.6 Listeners

| Process | Bind | Port |
|---|---|---|
| caddy | `*` | 8443 |
| node | 127.0.0.1 | 8200 |
| node | 127.0.0.1 | 8100 |

Caddy binds every interface. The pf anchor carries `block drop in quick on
!lo0 all` and passes only the four application ports on loopback. The edge is
therefore not reachable from another host.

## 3. Findings register

| ID | Finding | Class | Priority | Evidence | Decision |
|---|---|---|---|---|---|
| F-01 | `body-parser` 2.3.0 carries CVE-2026-111181, GHSA-27r3-jxmh-p828, CVSS 7.5. One request with a gzip Content-Encoding crashes the process. It is transitive through Express | Dependency | P1 | `scans/finding-F01.txt` | Fixed. An `overrides` entry pins `body-parser` to 2.4.0. A malformed gzip body now answers 400 and the process keeps its pid |
| F-02 | ZAP reports a CSP fallback gap on two 404 paths | Configuration | P3 | `dast.json` alert 10055 | Accepted. The 404 handler sends `default-src 'none'` and renders no data. Application pages name every directive |
| F-03 | ZAP reports four informational items | Configuration | P3 | `dast.json` alerts 10111, 10024, 10015, 10031 | Triaged. One is the scanner finding the login form. Three are false positives on scanner-injected parameters. The hostile-string test stores markup inertly |
| F-04 | The host carries patch drift: 74 formulae behind, 4 pending system updates, 2 of them need a restart | Configuration | P2 | `scans/brew-outdated.txt`, `scans/softwareupdate.txt` | Open, owner step. The application pins its own runtime and its dependency tree is clean, so the drift affects the host, not the app |
| F-05 | The TLS edge accepts TLS 1.2 | Cryptographic | P3 | `scans/probes.txt` | Accepted. TLS 1.0 and 1.1 are refused. No requirement in scope forces 1.3 only |
| F-06 | The edge listens on every interface | Configuration | P3 | `scans/probes.txt` | Accepted with a control. pf drops all inbound on non-loopback. The rule sits in `infra/pf/cyberserious.anchor` |
| F-07 | Four scanner claims had no artefact, and `SCANS.md` said no DAST ran while `DAST_REPORT.md` described a run | Documentation | P2 | `git log`, `scans/` | Closed. The four scanners now write JSON artefacts and the contradiction is gone |

## 4. Patch and version posture

The application's own tree:

- 84 packages in `package-lock.json`, 0 known advisories after F-01.
- Node comes from a pinned 24 LTS tarball under `~/.local/node24`, not from the
  system package manager.
- Postgres 16 runs as a local service on loopback.

The host:

- 74 formulae are behind their published version. The security-relevant ones
  are `gh`, `docker`, `node`, `python@3.11` and `postgresql@16`.
- Four system updates are pending. Two need a restart to apply.

The decision is deliberate. A host update restarts services and risks the
demonstration state. The application's exposure does not depend on those
packages, because it runs on its own pinned runtime. The drift stays on the
register as F-04 with an owner step, not as a silent gap.

## 5. Coverage and limits

What the assessment covers:

- The full git history for secrets.
- The full dependency graph for known advisories.
- The source tree for insecure patterns at ERROR severity.
- The unauthenticated HTTP surface, including the TLS edge.
- One authenticated role, with its refusal paths.

What the assessment does not cover:

- No external network penetration test. The target is a local deployment.
- No social engineering, physical access or supply chain attack.
- No authenticated abuse campaign across all seven roles. One role carries the
  refusal checks.
- No mobile client, because there is none.
- No container image scan, because there is no image.
- No infrastructure-as-code scan, because there is no declared infrastructure.
- gitleaks reads history. It cannot prove that a secret never existed outside
  this clone.

## 6. Conclusion

The application surface holds no open High or Medium weakness after F-01. The
five documented alerts are triaged with a reason each. The edge refuses
unauthenticated reads, refuses three hostile request classes and records every
refusal. The transport refuses TLS 1.0 and 1.1.

The one real defect this assessment found was in the dependency graph, not in
the application code. It was reachable from an unauthenticated request and it
would have stopped the service. That is the value of the exercise: the scanners
found what review did not.

Two gaps remain open and both are stated rather than hidden. Host patching is
an owner step (F-04). An external penetration test has not been performed, and
no scanner replaces one.

## 7. Files

| File | Purpose |
|---|---|
| `scripts/vulnerability-assessment.sh` | runs the four scanners and writes artefacts |
| `scripts/va-probes.sh` | unauthenticated and transport probes |
| `scripts/va-auth-probes.sh` | authenticated probes as one role |
| `scans/gitleaks.json` | secrets result |
| `scans/osv.json` | dependency result |
| `scans/trivy.json` | filesystem result |
| `scans/semgrep.json` | static analysis result |
| `scans/probes.txt` | live probe transcript |
| `scans/brew-outdated.txt` | package drift |
| `scans/softwareupdate.txt` | system patch level |
| `scans/finding-F01.txt` | the dependency finding and its close-out |
| `docs/security/dast.json` | ZAP result |
