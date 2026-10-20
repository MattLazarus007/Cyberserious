# Phase 06 task file: rules worker and live alerts

## Objective

A background worker leases outbox jobs and evaluates the five
Deliverable 3 rules with reason codes and input hashes. Analysts
acknowledge, snooze and resolve alerts. The alerts page acts on the
live API. Completes Gate B. Covers T-21 to T-25.

## Files

- apps/regulator/server/worker.ts (lease loop, backoff, sweep)
- apps/regulator/server/rules/index.ts (five D3 rules)
- apps/regulator/server/routes/alerts.ts (actions added)
- apps/regulator/server/policy.ts (update_alert grant, matrix updated)
- tests/integration/alerts.test.ts (T-21 to T-25)
- apps/regulator/web/js/app.js (alert action buttons)

## Steps

1. Worker lease mechanics first, with a lease-expiry recovery test.
2. Rules as pure functions with unit tests, then worker wiring.
3. Alert actions with reason required, snooze expiry via worker sweep.
4. Dedupe test: same inputs refresh last_seen_at, no new row.
5. Unknown-date and stale-feed fixtures from the seed drive T-24 T-25.
6. Gate B walk recorded.

## Verification

- source scripts/env.sh && npm test (T-21 to T-25 green)
- alerts page buttons act against the API as analyst1
- every 72h string carries the internal-timer label
- git remote -v | grep -c DISABLED gives 1
