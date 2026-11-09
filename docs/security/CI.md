# Continuous integration for the security gates

The workflow file is `.github/workflows/security.yml`. It runs on every push to `build` and `main`, on every pull request and on demand. The job starts a Postgres 16 service, creates both databases, then migrates and seeds them.

The gates are:

- Secrets. gitleaks scans the change for credentials. A hit fails the job.
- Dependencies. `npm audit --omit=dev --audit-level=high` and `osv-scanner` read the lockfile. A high advisory fails the job.
- Static analysis. Semgrep runs the TypeScript and Node rule sets. A finding fails the job.
- Test suite. `npm test` runs every file under `tests/` with one worker.
- Browser suite. Playwright runs the Chromium flows against both apps.

A local run covers more ground. `bash scripts/verify.sh` adds the tool manifest, the audit chain check and the backup dry run. It needs a live database and the launchd service set.

How to read a failure:

1. A secrets hit names the file, the line and the rule. Rotate the value before you delete the line.
2. A dependency hit names the advisory. Read the fixed version, then lift the package.
3. A Semgrep hit names the rule and the line. Fix the code, or record the refusal in the pull request.
4. A test failure prints the file and the assertion. Run that file alone before you change a shared helper.
5. A browser failure saves a trace under `test-results/`. Open the trace before you retest.

The workflow reads the repository only. It holds no production secret, and it does not push or deploy.
