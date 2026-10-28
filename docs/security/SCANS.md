# Security scans

`scripts/security-scan.sh all` runs four scanners over the repository.
`scripts/vulnerability-assessment.sh` runs the same four and keeps a JSON
artefact for each under `docs/security/scans/`.

| Scanner | Scope | Result | Artefact |
| --- | --- | --- | --- |
| gitleaks 8.30.1 | git history, redacted | 0 findings | `scans/gitleaks.json` |
| osv-scanner 2.7.0 | `package-lock.json`, 84 packages | 0 known vulnerabilities | `scans/osv.json` |
| trivy 0.76.1 | filesystem, high and critical | 0 vulnerabilities, 0 secrets, 0 misconfigurations | `scans/trivy.json` |
| semgrep 1.182.0 | `apps` and `scripts`, ERROR severity | 0 findings | `scans/semgrep.json` |

A claim with no artefact behind it is not a result. Run the script before you
quote a count, and quote the count from the file.

## The two real findings

Semgrep flagged `gcm-no-tag-length` in
`apps/regulator/server/encrypt.ts`. The code used AES-256-GCM without
telling Node the authentication tag length. That lets a caller present
a shorter tag than the algorithm expects. Both `createCipheriv` and
`createDecipheriv` now pass `{ authTagLength: 16 }`. The existing
tamper and wrong-key tests still pass, and the rule is clean.

osv-scanner flagged `body-parser` 2.3.0 for CVE-2026-111181,
GHSA-27r3-jxmh-p828. One request with a gzip Content-Encoding crashes an
Express process that carries the default `inflate` setting. The package arrives
through Express, so `package.json` pins it with an `overrides` entry at 2.4.0.
A malformed gzip body now answers 400 and the process keeps its pid. Full
record: `docs/security/scans/finding-F01.txt`.

## Why certs are skipped

`certs/mtls` holds local private keys for the lab. They are ignored by
git, mode `600`, and generated on this host. Trivy correctly calls a
private key a secret, so the filesystem scan skips that directory.
Removing the skip would produce three expected findings on every run
and train the group to ignore the scanner. The keys are not in the
history; gitleaks confirms that.

## Limits

- Signature and advisory data depend on the last tool update. Trivy
  refreshes its database on each run; OSV queries the live API.
- SAST covers TypeScript patterns, not business logic. Passing semgrep
  is not proof that the authorisation model is correct. The unit and
  integration suites carry that.
- No container image scan because there is no image. No IaC scan
  because there is no Terraform. Add both when they exist.
- The dynamic scan is unauthenticated and shallow. `DAST_REPORT.md` holds
  the result and `scripts/zap.sh` repeats it. Neither one replaces the
  manual checks in `PENTEST.md`.

## Commands

```bash
bash scripts/security-scan.sh --check-tools
bash scripts/security-scan.sh all
bash scripts/security-scan.sh sast
bash scripts/vulnerability-assessment.sh
bash scripts/zap.sh
bash scripts/va-probes.sh
bash scripts/va-auth-probes.sh
```
