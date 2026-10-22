# Every tool in the build

Nothing here is aspirational. Each entry ran during this build with
the version shown, on 16 October 2026.

## Runtime and data

Node 24.22.0 with type-stripping, so TypeScript runs directly with
no build step. PostgreSQL 16.15, local service, four databases.
Express 5.3.0 serves both applications. The pg 8.23.1 driver talks
to the database with parameterised statements only. Zod 4.6.7
validates every input at the boundary. Jose 6.2.12 signs and
verifies intake submissions. The node:crypto module hashes
passwords with scrypt, seals research notes with aes-256-gcm and
chains audit rows with sha256.

## Tests and browsers

The built-in node:test runner with node:assert/strict covers unit
and integration suites, run serially because every file resets the
same test database. Playwright with a Chromium shell drives four
browser flows: sign-in with the console code, register to detail,
note plus refused move, and small-screen navigation. Curl checked
reachability, headers and status codes throughout. JSDOM powered
the Phase 1 render evidence before the API existed.

## Operations

pg_dump and pg_restore with custom format move databases around.
Shasum verifies every backup. OpenSSL mints research and sender
keys. Tar archives the evidence directory. Docker files describe
the lab deployment, though the daemon was down, so image digests
wait for the first real pull. Git tracks the work on the build
branch with pushes disabled at the remote.

## Documents and figures

Python with its zipfile module extracted the group's own diagrams
and bibliography from the Deliverable 2 and 3 documents. Those
sources feed the research register, and the diagrams hang in
docs/figures with provenance plus rebuilt labelled versions in the
regulator app.

## Security stack, 22 October 2026

`scripts/install-security-tools.sh --check` is the source of truth.
Versions recorded after install on this host:

| Tool | Version | Role |
| --- | --- | --- |
| ClamAV | 1.5.4 | antivirus, upload scanning |
| semgrep | 1.182.0 | static analysis |
| gitleaks | 8.30.1 | secret scanning |
| trivy | 0.76.1 | filesystem and dependency scan |
| osv-scanner | 2.7.0 | dependency advisories |
| lynis | 3.1.7 | host audit |
| Caddy | 2.11.7 | tls ingress |
| syft | 1.55.0 | software bill of materials |
| yq | 4.54.1 | yaml checks |
| Suricata | 8.0.7 | network ids |
| Vector | 0.60.0 | log pipeline |
| age | 1.3.2 | optional file encryption |
| osquery | not installed | needs an admin approval for the pkg, deferred |

The install manifest is idempotent: `--check`, `--dry-run`, `--install`.
osquery is optional and its installer needs a local admin password, so
it stays pending until the owner approves the package. No tool is
claimed as configured until its runbook check passes.
