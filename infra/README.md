# The Docker lab

One command brings up the database, both apps and the worker:

    docker compose -f infra/docker-compose.yml up --build

The first run does four things:

1. Starts Postgres 16.15 and creates `cyberserious_dev` and `cyberserious_org_dev`.
2. Migrates and seeds both databases.
3. Registers the portal sender key into the shared `senderkeys` volume.
4. Starts the regulator, the portal and the worker.

Open the doors:

- Regulator: http://localhost:9100/login.html
- Portal: http://localhost:9200/login.html
- Every account and password sits in the main README.

The seed service resets the demo data on every `up`. That keeps the counts in the demo script true. It also drops any case work you did in the previous run.

Stop the lab:

    docker compose -f infra/docker-compose.yml down

Drop the database volume as well:

    docker compose -f infra/docker-compose.yml down -v

## What this stack is not

- The database password and the lab keys are dev values in the compose file. Never use them outside the lab.
- Both apps listen on plain HTTP inside the compose network. There is no TLS edge here. The supervised host deployment carries the TLS edge and the certificate story.
- The database network is internal. The portal, the regulator, the worker and the seed steps join it. No host route reaches Postgres.
- The regulator carries no public network. Only the portal posts signed submissions to the regulator intake. The regulator holds no intake url for the portal. `tests/scripts/compose.test.ts` checks that rule in the file.
- A shared Docker network allows traffic both ways. The submission direction is a configuration rule, not a bridge rule. A production split would use separate networks plus a firewall policy between them.
- The worker writes anchors under `data/anchors` inside its container. That path does not survive `down` unless you add a volume.
