# Deliverable 4 evidence mapping

Pointers from the report sections to the artifacts that prove them.
The group owns the disclosure wording. This file only maps.

## Architecture

System topology: docs/UNDERSTANDING.md section 2 and
apps/regulator/web/architecture.html. Trust corrections: the
specification sections 3.1 to 3.3 with ADR-0001 to ADR-0010.
Database: db/migrations 001 to 010, Postgres 16, local service.

## Prototype development

Interface: apps/regulator/web and apps/organisation/web. API:
apps/regulator/server/routes with contracts in packages/contracts.
Seeded fixtures: db/seed.ts and db/seed_org.ts with the frozen
clock. Gate walks: STATUS.md entries for Gate A, Gate B and the
Gate C intake boxes.

## Security controls

Permission matrix: policy.ts with matrix tests. Sign-in: scrypt,
sessions, console code with lockout and expiry tests. Intake: JWS
verification with T-16 to T-20. Evidence: quarantine and redacted
export with T-28 and T-29. Headers and content policy: server
middleware with the T-32 reachability notes.

## Evaluation

Acceptance results: docs/TEST_LOG.md with T-01 to T-36. Browser
flows: tests/e2e with four Chromium runs. Workload: T-36 manual
numbers. Risk treatment: docs/RISKS.md. Requirements: SR_EVIDENCE
and NIST_MAP in this folder.

## Recovery and operations

Backup script: scripts/backup.sh. Restore rehearsal:
docs/project/exercises/restore-2026-10-16.md. Runbooks:
docs/runbooks/restore.md and incident.md with the benign exercise
notes.
