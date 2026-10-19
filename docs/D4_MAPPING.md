# Deliverable 4 evidence mapping

Pointers from the report sections to the artifacts that prove them.
The group owns the disclosure wording. This file only maps.

## Architecture

System topology: docs/BRIEF.md section 2. Trust corrections: the
specification sections 3.1 to 3.3 with ADR-0001 to ADR-0010.
Database: db/migrations 001 to 013 and db/org-migrations 001 to 002,
Postgres 16, local service.

## Prototype development

Interface: apps/regulator/web and apps/organisation/web. API:
apps/regulator/server/routes with contracts in packages/contracts.
Seeded fixtures: db/seed.ts and db/seed_org.ts with the frozen
clock. Gate walks: docs/PROGRESS.md records Gate A, Gate B and the
Gate C intake boxes. Affected-person notices:
apps/organisation/server/drafts.ts and
apps/regulator/server/routes/intake.ts with T-68 to T-76.

## Security controls

Permission matrix: policy.ts with matrix tests. Sign-in: scrypt,
sessions, console code with lockout and expiry tests. Single sign-on:
oidc.ts under a local role map with T-51 to T-56. Mutual TLS: mtls.ts
and scripts/gen-mtls-certs.sh with four cases in mtls.test.ts. Intake:
JWS verification with T-16 to T-20. Evidence: quarantine and redacted
export with T-28 and T-29. Sensor: infra/sensor with T-60 to T-67.
Headers and content policy: server middleware with the T-32
reachability notes.

## Evaluation

Acceptance results: docs/TEST_LOG.md with T-01 to T-76. Browser
flows: tests/e2e with eleven Chromium runs. Workload: T-36 manual
numbers. Risk treatment: docs/RISKS.md. Requirements: SR_EVIDENCE
and NIST_MAP in this folder.

## Recovery and operations

Backup script: scripts/backup.sh. Restore rehearsal:
docs/project/exercises/restore-2026-10-16.md. Runbooks:
docs/runbooks/restore.md and incident.md with the benign exercise
notes. Sensor runbook: docs/runbooks/sensor.md.
