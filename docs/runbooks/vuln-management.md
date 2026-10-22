# Vulnerability management

```bash
bash scripts/security-scan.sh --check-tools
bash scripts/security-scan.sh secrets
bash scripts/security-scan.sh deps
bash scripts/security-scan.sh fs
bash scripts/security-scan.sh sast
```

Severity: fix critical and high before the next demo; medium within a month;
low at the next dependency refresh. A finding needs an owner, a decision and a
date. Local private keys under `certs/mtls` are excluded from the Trivy
filesystem scan because they are gitignored, mode 600 and generated for this
host. That exclusion is recorded, not silent.
DAST: `docs/security/DAST_REPORT.md`. Host audit: Lynis report. Re-run after
every dependency change and before a release.
