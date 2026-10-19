# CyberSerious

Breach notification and case management for section 22 of POPIA. Group 1,
Eduvos ITNPA3. The lab runs on one machine, every record is synthetic, and
nothing here is an official reporting channel.

An organisation that loses personal information drafts a report, approves
that exact revision and sends it. The regulator receives the signed report,
opens a case, reads the evidence, works the alerts and records the outcome.
The organisation also records a notice to every affected person and reports
the sent count back. Every write is attributed. The important ones land in a
hash-chained audit log.

## Quick start

You need Node 24 and PostgreSQL 16. docs/SETUP.md covers an empty machine,
including the toolchain pin and the four local databases.

```bash
source scripts/env.sh
npm install
npm run db:migrate && npm run db:seed
npm run db:migrate:org && npm run db:seed:org
node tools/org-sender.ts --register
```

`--register` writes keys/org-sender.json and puts its public key in the
sender registry. The organisation portal cannot send or notify without it.

Start what you need, each in its own terminal:

```bash
npm run dev       # regulator, http://localhost:8100
ORG_SENDER_KEY="$PWD/keys/org-sender.json" npm run dev:org
                  # organisation portal, http://localhost:8200
npm run worker    # rules worker, opens alerts for new cases
```

Reset the demo state at any time with
`node db/seed.ts --reset && node db/seed_org.ts --reset && node tools/org-sender.ts --register`.
The last step renews the sender key.

## Every way to sign in

A normal account takes two steps. Username and password first. Then a
six-digit code, printed in the terminal that runs the server you are signing
in to. The code lives five minutes and allows three attempts. Five wrong
passwords lock that username for fifteen minutes.

Regulator workspace, port 8100:

| Username | Password | Role | What it can do |
|---|---|---|---|
| analyst1 | demo-analyst-pass | regulator analyst | read cases, write notes, import records, update alerts |
| supervisor1 | demo-supervisor-pass | regulator supervisor | the above, plus move cases and assign analysts |
| reviewer1 | demo-reviewer-pass | audit reviewer | read the audit chain, nothing else |
| admin1 | demo-admin-pass | system administrator | create and manage accounts, no case content |
| io1 | demo-io-pass | information officer | organisation role, kept for the shared seed |
| steward1 | demo-steward-pass | data steward | organisation role, kept for the shared seed |
| so1 | demo-so-pass | security officer | organisation role, kept for the shared seed |

The three organisation roles exist in the regulator database for the shared
fixtures. The regulator screens refuse them, because the permission table
gives those roles nothing on that side.

Organisation portal, port 8200. It has its own database, so only these three
accounts exist there:

| Username | Password | What it can do |
|---|---|---|
| steward1 | demo-steward-pass | write a draft, send it for approval |
| io1 | demo-io-pass | approve, sign, send, record the affected-person notice |
| so1 | demo-so-pass | read the draft list |

### Group passphrase, no code

```bash
GROUP_LOGIN=1 GROUP_PASSPHRASE="group-demo-2026" npm run dev
```

The regulator login page then shows a third form. The passphrase creates one
shared account named group with the regulator analyst role. It skips the
code. Use it when the whole group signs in together. It carries no per-person
attribution, so keep it off for assessed work.

The organisation portal does not offer that form. Its database has no
regulator audit table, so the gate stays closed there. Sign in as io1 or
steward1.

### Keycloak single sign-on, regulator only

```bash
bash scripts/keycloak.sh
OIDC_ISSUER=http://localhost:18080/realms/cyberserious \
  OIDC_CLIENT_ID=regulator-web npm run dev
```

A "Sign in with single sign-on" link appears above the password form. The
realm is cyberserious, the client is regulator-web, and PKCE S256 is required.
The provider proves the identity. The local database still decides the role.

| Provider user | Password |
|---|---|
| analyst1 | kc-analyst-pass-2026 |
| io1 | kc-io-pass-2026 |
| demo | kc-demo-pass-2026 |

A name the local tables do not know arrives as a regulator analyst with no
organisation. An existing name keeps its rows and its organisation.

### Simple lab sign-in

`LAB_SIMPLE_LOGIN=1` in front of either server command signs a password
account in without the code. The server log marks each one. Use it when the
group tests together, never for assessed work.

### Machine channels, not human logins

- Signed intake: the organisation signs each submission with the key under
  keys/, created by `node tools/org-sender.ts --register`.
- Mutual TLS: `bash scripts/gen-mtls-certs.sh` writes a local authority and a
  client certificate. `MTLS_PORT=8101 npm run dev` opens a second listener
  that refuses any request without that certificate. The sender uses
  `MTLS=1 node tools/org-sender.ts --send`.
- Sensor intake: the shipper sends alerts with an `INTERNAL_TOKEN` header.
  Export a value before you start it. The regulator refuses every other one.

## Tests

```bash
npm test          # 118 tests: unit, integration, security
npm run test:e2e  # 11 browser flows on Chromium
```

The browser suite uses the dev databases for the regulator pages and the test
databases for the notification flow. Reseed the dev pair after a migration, or
the case detail can answer with stale data.

## Where things live

```
apps/regulator/web        dashboard, register, alerts, case detail, research,
                          architecture, login
apps/regulator/server     routes, policy gate, sessions, audit chain, rules,
                          worker, signed intake, evidence, sensor, OIDC, mTLS
apps/organisation/web     draft workspace and sign-in
apps/organisation/server  drafts, approval, signed sending, affected notices
packages/contracts        shared enums and input shapes
db/migrations             thirteen regulator migrations
db/org-migrations         two organisation migrations
db/seed.ts                seven cases, alerts from the rules, research
db/seed_org.ts            one company, three users, 25 synthetic recipients
docs/                     guides, decisions, risks, evidence, runbooks
```

Postgres holds everything durable: cases with facts, immutable notification
versions, hash-chained audit rows, alerts with dedupe keys, outbox jobs under
lease, sealed research notes, duties per case, quarantined evidence and the
sender registry. The seed rebuilds the same rows every time under a frozen
clock.

## Documents worth opening first

docs/BRIEF.md explains the law, both systems and the data for a first-time
reader.
docs/PROGRESS.md states where the build stands.
docs/TEST_LOG.md holds every acceptance result, T-01 to T-77.
docs/DEMO.md scripts the walkthrough across both systems.
docs/SETUP.md covers the empty machine, secrets and the optional listeners.
docs/runbooks/ holds the restore, incident and sensor procedures.

## Limits, stated plainly

The console code is not real multi-factor authentication, and the Keycloak
path is a lab provider. The shared group passphrase carries no attribution.
The timers pace the work and never claim legal force. The system computes no
verdicts. Everything runs on one machine over plain HTTP, except the optional
mTLS listener. The sensor is Suricata with three rules. The Wazuh manager does
not run on this arm64 host, and no Wazuh claim is made.

Every account in this file is synthetic and lab only. The seed files carry
them on purpose. Never reuse them anywhere else.
