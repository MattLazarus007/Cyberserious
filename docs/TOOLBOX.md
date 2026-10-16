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
