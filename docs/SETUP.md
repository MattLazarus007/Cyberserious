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

The group gate reads its two variables from the environment on
every request: set GROUP_LOGIN=1 to open it and GROUP_PASSPHRASE
to the agreed phrase, the same inline way LAB_SIMPLE_LOGIN is used
above. The .env.example file carries empty placeholders only, and
no real value ever enters version control. Rotation is a manual
two-step: change the value in the shell, then restart the server,
because the running process only sees the value it started with.
The old phrase stops working on the first request after the
restart, and the group audit rows under action auth.group show
when the gate was used, by "group" only.

## mTLS intake channel on port 8101

The intake port stays plain http, because the lab UI and the browser
tests ride on it. A second listener can be opened beside it for the
organisation sender. That one asks for a client certificate before it
reads a single byte of a submission. Two environment switches control
it and neither is on until you set it.

Generate the certificate set once per machine:

```
source scripts/env.sh
bash scripts/gen-mtls-certs.sh
```

The script writes a 4096 bit local authority, a server certificate
for localhost and 127.0.0.1, and a client certificate with the
clientAuth purpose into certs/mtls/. That folder sits outside version
control. A second run prints its message and leaves the files alone.

Start the regulator with the extra listener:

```
MTLS_PORT=8101 npm run dev
```

MTLS_PORT carries the port, with 8101 as the value when the setting
holds no usable number. Without MTLS_PORT no second listener opens,
so every command above keeps working as written. One collision to
know about: the browser suite already takes 8101 for its own plain
server, so run the two one after the other rather than together.

Send over the new channel:

```
MTLS=1 node tools/org-sender.ts --send
```

MTLS=1 posts to https://localhost:8101 with the client certificate,
the client key and the local authority, and it checks the regulator
against that same authority. Any other value leaves the sender on
http://localhost:8100 exactly as before. When the certificates are
missing the sender stops with the script name in the message.

The listener refuses a request with no certificate during the
handshake, refuses a certificate signed by an authority it does not
know, and sets TLS 1.3 as the floor. It mounts the same express app
as the plain port, so routes, checks and receipts behave the same on
both. Four cases in tests/integration/mtls.test.ts hold that line:
no certificate refused, a foreign authority refused, plain http to
8101 unanswered, and a registered certificate carrying a signed
payload all the way to a 201 receipt.
