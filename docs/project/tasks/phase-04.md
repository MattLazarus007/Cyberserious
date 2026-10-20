# Phase 04 task file: durable case work

## Objective

Notes, state changes and assignments persist in Postgres and survive
restarts. Every mutation writes a hash-chained audit row in the same
transaction. Stale writers get a 409 with both versions. Covers spec
Slice 4 and acceptance tests T-05, T-06, T-07.

## Files

- apps/regulator/server/audit.ts (chain write + verify)
- apps/regulator/server/routes/notes.ts (post with idempotency key, list)
- apps/regulator/server/routes/transitions.ts (state machine + row_version)
- apps/regulator/server/routes/assignments.ts (supervisor assigns work)
- db/migrations/007_casework.sql (note idempotency keys)
- tests/integration/casework.test.ts (T-05, T-06, T-07, restart, audit)
- apps/regulator/web/js/app.js (note and status controls call the API)

## Steps

1. Migration 007 first, applied to dev and test.
2. audit.ts with unit-covered hash shape, then routes with tests first.
3. Notes before transitions before assignments. Each green before next.
4. Restart test: save a note, close the server, start it, read the note.
5. Frontend wiring last, manual check as analyst1 on breach.html.

## Verification

- source scripts/env.sh && npm test (all green, T-05 T-06 T-07 present)
- note survives restart (scripted in the test)
- audit verify endpoint returns ok on a lived-in database
- git remote -v | grep -c DISABLED gives 1
