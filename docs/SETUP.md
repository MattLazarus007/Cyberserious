# Setup from an empty machine

Tested on macOS with Homebrew. Every command below ran here on
16 October 2026. Group members on other systems translate the
install lines and keep everything else.

## Toolchain

Node 24.22.0 from the official tarball into ~/.local/node24,
because the package manager deadlocked on its own lock during
setup. PostgreSQL 16.15 as a local service. Git with the push URL
disabled on purpose. Full tool list with versions: docs/TOOLBOX.md.

## Databases

Role cyberserious with four databases: cyberserious_dev and
cyberserious_test for the regulator, cyberserious_org_dev and
cyberserious_org_test for the organisation portal. The schema
travels as numbered migration files under db/migrations (ten for
the regulator) plus one draft table under db/org-migrations. The
migration runners apply each file once inside its own transaction
and record it, so reruns are safe.

Seeded content is deterministic under a frozen clock. The regulator
seed builds three fictional organisations, six users, seven cases,
six notifications, ten rule-raised alerts, four research cases,
eleven sources and the duty table. The organisation seed builds one
company with a steward and an information officer.

## Run it

```
source scripts/env.sh
npm run db:migrate && npm run db:seed
npm run db:migrate:org && npm run db:seed:org
npm run dev
```

The regulator answers on port 8100. Sign in as analyst1 and read
the one-time code from this same terminal. The portal runs with
npm run dev:org on port 8200. The worker runs with npm run worker.
Tests run with npm test, browser flows with npm run test:e2e.

When the whole group tests together, start the servers with
LAB_SIMPLE_LOGIN=1 in front of the commands. Passwords alone sign
everyone in and the login pages skip the code step. The server log
marks each simple sign-in. Switch it off for anything assessed.

New accounts come from the administrator, never from a public form.
Sign in as admin1, then POST /api/v1/users with a username, name,
password, role and optional email, number and organisation. Every
account carries an email address and a contact number, visible to
its owner through GET /api/v1/me.

## Secrets and keys

Copy .env.example to .env and fill nothing sensitive: local
passwords stay local. The research key generates per shell through
scripts/env.sh. The sender key for signed intake lives under keys/,
outside version control, created by tools/org-sender.ts with
--register. Backups land under data/backups/, also outside version
control.
