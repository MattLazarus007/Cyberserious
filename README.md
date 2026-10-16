# CyberSerious

Breach notification and case management for Section 22 of POPIA,
built by Group 1 for the Eduvos ITNPA3 project.

When personal information is compromised, the responsible
organisation must tell the Information Regulator and the affected
people as soon as reasonably possible. That is the whole system in
one sentence. Organisations draft the report, approve that exact
draft and send it. Analysts on the regulator side open cases, read
the evidence, add notes, move cases through review, and work alerts
raised by named rules. Every step is attributed and every important
write is audited.

Nothing here is real data. All records are synthetic, every page
says so, and test receipts carry the test label. This is coursework,
not an official reporting channel.

## Where things stand

The build is complete through the two-system lab and the hardening
pass. Sixty-three automated tests pass, four browser flows run green
on Chromium, and the acceptance log records every result with two
honest gaps: reads scoped by assignee and managed identity sign-in.
Gate A, Gate B and the Gate C intake boxes are ticked in
CHECKLIST.md with evidence in STATUS.md. The full story of the two
days sits in docs/PROGRESS.md, last updated 16 October 2026.

## Run it

You need Node 24 and PostgreSQL 16. The toolchain pins itself
through scripts/env.sh.

```
source scripts/env.sh
npm install
npm run db:migrate && npm run db:seed
npm run db:migrate:org && npm run db:seed:org
npm run dev
```

Open http://localhost:8100/index.html and sign in as analyst1. The
one-time code prints in the server terminal. The organisation
portal runs with npm run dev:org on port 8200, where steward1
drafts and io1 approves. The rules worker runs with npm run worker.
Tests run with npm test, browser flows with npm run test:e2e. Setup
from an empty machine, secrets included, is written up in
docs/SETUP.md.

## How it fits together

```
apps/regulator/web        dashboard, register, alerts, case detail,
                          research, architecture, login
apps/regulator/server     routes, policy gate, sessions, audit chain,
                          rules, worker, signed intake, evidence
apps/organisation/web     draft workspace and sign-in
apps/organisation/server  drafts, approval, signed sending
packages/contracts        shared enums and input shapes
db/migrations             ten regulator tables, numbered and ordered
db/org-migrations         draft table for the portal
db/seed.ts                fictional cases, alerts from the rules,
                          research from the group bibliography
docs/                     guides, decisions, risks, evidence, runbooks
```

Postgres holds everything durable: cases with facts, immutable
notification versions, hash-chained audit rows, alerts with dedupe
keys, outbox jobs under lease, research with sealed notes, duties
per case, evidence rows pointing at quarantined files, sender keys
for intake. Ten migrations build it from nothing. The seed rebuilds
the same rows every time under a frozen clock.

## Documents worth opening first

docs/UNDERSTANDING.md explains the system end to end for markers
and new group members. docs/PROGRESS.md tracks what is done.
docs/TOOLBOX.md lists every tool with its version. docs/TEST_LOG.md
holds the acceptance results. docs/DEMO.md scripts the fifteen
minute walkthrough. docs/RISKS.md pairs each risk with its test.

## Limits, stated plainly

The console code is weaker than real multi-factor sign-in, and the
Keycloak path is recorded for later. Timers pace the demo and never
claim legal force. The system computes no verdicts. The lab runs on
one machine over plain HTTP. Backups are dumps with checksums, and
the research key lives outside them by design.
