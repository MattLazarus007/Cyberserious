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

## Keycloak single sign-in on port 18080

Phase 12 stretch item one. The regulator can identify a person
through an OpenID Connect provider instead of a local password, and
the local tables still decide every role. Nothing switches on until
you set an environment variable, so the commands above keep working
as written.

Start the lab provider:

```
source scripts/env.sh
bash scripts/keycloak.sh
```

The script runs Keycloak 26.0 in a container and waits for the realm
document to answer. Port 18080 rather than the Keycloak default
8080, because something else on this machine already listens there.
The realm cyberserious imports from
infra/keycloak/realm-export.json on the first start. It carries the
public client regulator-web with PKCE S256 required, brute force set
to five failures and a thirty second wait, and the three lab users.
A second run reports the container as already up. The command
`bash scripts/keycloak.sh stop` removes the container and the realm
data with it.

Point the regulator at the provider:

```
OIDC_ISSUER=http://localhost:18080/realms/cyberserious \
OIDC_CLIENT_ID=regulator-web npm run dev
```

The login page then shows one extra link, Sign in with single
sign-on, above the password form. That link goes to /auth/oidc,
which builds a state, a nonce and a PKCE verifier, keeps them in a
ten minute cookie and sends the browser to Keycloak. The callback
checks the state, the issuer, the audience and the signature, then
exchanges the code and opens the same session row a local sign-in
opens. Lockout, the idle limit and the absolute limit therefore
behave exactly as they did before.

The lab users are analyst1 with kc-analyst-pass-2026, io1 with
kc-io-pass-2026 and demo with kc-demo-pass-2026. They are synthetic
and stay on this machine. A first sign-in creates the local account
when the name is new and keeps the existing rows when it is not, so
io1 arrives with its organisation and information officer while demo
arrives as a regulator analyst. No role ever comes from the
provider.

Without OIDC_ISSUER the two routes answer 404 and the login page
renders no link, which is the state the browser suite pins.

## Lab sensor on the app ports

Suricata 8.x runs the three lab rules in `infra/sensor/local.rules` and
writes alerts to `infra/sensor/out/eve.json`. The replay path needs no
root:

```bash
node scripts/build-fixture-pcap.mjs /tmp/sensor-fixture.pcap
suricata -c infra/sensor/suricata.yaml -S infra/sensor/local.rules \
  -r /tmp/sensor-fixture.pcap -l /tmp/sensor-replay
```

Live capture on `lo0` needs `sudo`. It is a demonstration step, not a
test. Set `INTERNAL_TOKEN` and run the shipper to put alerts in the
regulator inbox:

```bash
export INTERNAL_TOKEN=<lab value>
node scripts/sensor-shipper.mjs --base http://localhost:8100
```

The Wazuh manager does not run on this arm64 machine. The amd64 image
exits 139 under emulation after 98 ms. The parser and the ingest path are
tested from a saved file. `docs/runbooks/sensor.md` carries the evidence
and the steps for a linux/amd64 host.

