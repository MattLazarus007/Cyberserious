# Security scans

`scripts/security-scan.sh all` runs four scanners over the repository.
The run on 22 October 2026 finished clean.

| Scanner | Scope | Result |
| --- | --- | --- |
| gitleaks 8.30.1 | git history, redacted | 0 findings |
| osv-scanner 2.7.0 | `package-lock.json`, 84 packages | 0 known vulnerabilities |
| trivy 0.76.1 | filesystem, high and critical | 0 vulnerabilities, 0 secrets, 0 misconfigurations |
| semgrep 1.182.0 | `apps` and `scripts`, ERROR severity | 0 findings after the GCM fix |

## The one real finding

Semgrep flagged `gcm-no-tag-length` in
`apps/regulator/server/encrypt.ts`. The code used AES-256-GCM without
telling Node the authentication tag length. That lets a caller present
a shorter tag than the algorithm expects. Both `createCipheriv` and
`createDecipheriv` now pass `{ authTagLength: 16 }`. The existing
tamper and wrong-key tests still pass, and the rule is clean.

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
- No DAST in this pass. ZAP against the running app is the next scan.

## Commands

```bash
bash scripts/security-scan.sh --check-tools
bash scripts/security-scan.sh all
bash scripts/security-scan.sh sast
```
