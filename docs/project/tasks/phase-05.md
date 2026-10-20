# Phase 05 task file: intake of records

## Objective

Authorised staff capture records by hand with full provenance, and
later arrivals land as new immutable versions linked to their
predecessors. No update path exists for stored versions. Covers spec
Slice 5, FR-02 and acceptance test T-27.

## Files

- apps/regulator/server/routes/imports.ts (capture + supplement + versions)
- apps/regulator/server/services/notifications.ts (version append helper)
- tests/integration/imports.test.ts (provenance, immutability, T-27)

## Steps

1. Version helper first, tested through the import route tests.
2. Capture route with provenance fields, then supplement route.
3. Assert the original version bytes never change.
4. Enqueue an outbox job per new version for the Phase 6 worker.

## Verification

- source scripts/env.sh && npm test (T-27 green)
- psql shows predecessor_revision links on supplemented rows
- git remote -v | grep -c DISABLED gives 1
