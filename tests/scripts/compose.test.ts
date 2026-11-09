import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const composePath = "infra/docker-compose.yml";
const compose = readFileSync(composePath, "utf8");

test("the compose file builds one image and reuses it", () => {
  assert.equal(compose.match(/^    build: \.\.$/gm)?.length, 1, "one build context");
  assert.match(compose, /image: cyberserious-lab:local/);
  assert.ok(existsSync("Dockerfile"), "the build context carries a Dockerfile");
});

test("the compose file publishes both apps on a host port", () => {
  assert.match(compose, /"9100:8100"/);
  assert.match(compose, /"9200:8200"/);
});

test("the store network is internal and only the portal holds a public address", () => {
  assert.match(compose, /store:\n    internal: true/);
  const regulator = compose.split("  regulator:")[1].split("  organisation:")[0];
  assert.doesNotMatch(regulator, /REGULATOR_INTAKE_URL/, "the regulator never calls the portal");
  assert.doesNotMatch(regulator, /^      public:$/m, "the regulator holds no public network");
  const organisation = compose.split("  organisation:")[1].split("  worker:")[0];
  assert.match(organisation, /REGULATOR_INTAKE_URL/, "only the portal opens the submission path");
  assert.match(organisation, /^      public:$/m, "the portal reaches the host");
});

test("the first run creates both databases and seeds them", () => {
  assert.ok(existsSync("db/docker/init-org-db.sql"), "the org database has an init script");
  assert.match(compose, /init-org-db\.sql:\/docker-entrypoint-initdb\.d/);
  const seed = compose.split("  seed:")[1].split("  register:")[0];
  assert.match(seed, /db:migrate/);
  assert.match(seed, /db:seed -- --reset/);
  assert.match(seed, /db:migrate:org/);
  assert.match(seed, /db:seed:org -- --reset/);
  assert.match(seed, /service_healthy/);
});

test("the portal waits for the sender key and reads it from the shared volume", () => {
  const organisation = compose.split("  organisation:")[1].split("  worker:")[0];
  assert.match(organisation, /condition: service_completed_successfully/);
  assert.match(organisation, /ORG_SENDER_KEY: \/app\/keys\/org-sender\.json/);
  assert.match(organisation, /senderkeys:\/app\/keys/);
  const register = compose.split("  register:")[1].split("  regulator:")[0];
  assert.match(register, /tools\/org-sender\.ts/);
});

test("the compose file needs no secret file to exist", () => {
  assert.doesNotMatch(compose, /^secrets:/m, "a missing secret file would block the first run");
});
