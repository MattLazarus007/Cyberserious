import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { resetDb, startApp, dbUrl, loginFull } from "./help.ts";
import { securityTrip } from "../../apps/regulator/server/trip.ts";
import { sensorRate } from "../../apps/regulator/server/routes/sensor.ts";
import { parseEveAlerts, parseWazuhAlerts, shipAlerts } from "../../scripts/sensor-shipper.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TOKEN = "lab-sensor-8c1f4b2e7a9d";
process.env.INTERNAL_TOKEN = TOKEN;

function suricataInstalled(): boolean {
  return spawnSync("suricata", ["-V"], { encoding: "utf8" }).status === 0;
}

interface EveLine {
  event_type: string;
  src_ip?: string;
  src_port?: number;
  dest_ip?: string;
  dest_port?: number;
  timestamp?: string;
  alert?: { signature_id?: number; signature?: string; severity?: number };
}

function replayFixture(): { dir: string; alerts: EveLine[]; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "sensor-replay-"));
  try {
    const pcap = join(dir, "fixture.pcap");
    execFileSync("node", [join(repo, "scripts", "build-fixture-pcap.mjs"), pcap], { cwd: repo, stdio: "pipe" });
    execFileSync(
      "suricata",
      ["-c", join(repo, "infra", "sensor", "suricata.yaml"), "-S", join(repo, "infra", "sensor", "local.rules"), "-r", pcap, "-l", dir],
      { cwd: repo, stdio: "pipe" }
    );
    const lines = readFileSync(join(dir, "eve.json"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as EveLine);
    return {
      dir,
      alerts: lines.filter((l) => l.event_type === "alert"),
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

async function postSensor(
  base: string,
  body: Record<string, unknown>,
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["x-internal-token"] = token;
  return fetch(`${base}/api/v1/sensor/alerts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function countAudit(action: string, result: string): Promise<number> {
  const conn = new pg.Client({ connectionString: dbUrl });
  await conn.connect();
  try {
    const rows = await conn.query(
      "select count(*)::int as n from audit_events where action = $1 and result = $2",
      [action, result]
    );
    return rows.rows[0].n as number;
  } finally {
    await conn.end().catch(() => {});
  }
}

test(
  "T-60 suricata replay of the built fixture fires all three lab rules",
  { skip: suricataInstalled() ? false : "suricata binary is not installed" },
  () => {
    const { alerts, cleanup } = replayFixture();
    try {
      const sids = new Set(alerts.map((a) => a.alert?.signature_id));
      assert.ok(sids.has(9000001), `sid 9000001 missing, saw ${[...sids].join(",")}`);
      assert.ok(sids.has(9000002), `sid 9000002 missing, saw ${[...sids].join(",")}`);
      assert.ok(sids.has(9000003), `sid 9000003 missing, saw ${[...sids].join(",")}`);
      const credential = alerts.find((a) => a.alert?.signature_id === 9000001);
      assert.ok(credential?.alert?.signature?.includes("cleartext credential"));
      assert.equal(credential?.dest_port, 8100);
    } finally {
      cleanup();
    }
  }
);

test("T-61 a sensor alert with the internal token lands in the inbox", async () => {
  resetDb();
  securityTrip.resetWindows();
  sensorRate.resetWindows();
  const srv = await startApp();
  try {
    const created = await postSensor(
      srv.base,
      {
        source: "suricata",
        signature: "LAB cleartext credential post on an app port",
        severity: "medium",
        src: "127.0.0.1:49200",
        dst: "127.0.0.1:8100",
        observedAt: "2026-10-13T10:00:10.400000+0200",
      },
      TOKEN
    );
    assert.equal(created.status, 201);
    const body = (await created.json()) as { ok: boolean; created: boolean; id: string };
    assert.equal(body.ok, true);
    assert.equal(body.created, true);

    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const rows = await conn.query(
      "select rule_id, priority, reason, case_id, state from alerts where id = $1",
      [body.id]
    );
    await conn.end();
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].rule_id, "SENSOR-IDS");
    assert.equal(rows.rows[0].priority, "medium");
    assert.equal(rows.rows[0].reason, "Suricata IDS: LAB cleartext credential post on an app port");
    assert.equal(rows.rows[0].case_id, null);
    assert.equal(rows.rows[0].state, "open");

    const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
    const inbox = await fetch(`${srv.base}/api/v1/alerts`, { headers: { cookie } });
    assert.equal(inbox.status, 200);
    const items = ((await inbox.json()) as { items: { ruleId: string; reason: string; priority: string }[] }).items;
    const mine = items.filter((a) => a.ruleId === "SENSOR-IDS");
    assert.equal(mine.length, 1);
    assert.ok(mine[0].reason.startsWith("Suricata IDS:"));
    assert.equal(mine[0].priority, "medium");
  } finally {
    await srv.close();
  }
});

test("T-62 a sensor alert without a valid token is refused and recorded", async () => {
  resetDb();
  securityTrip.resetWindows();
  sensorRate.resetWindows();
  const srv = await startApp();
  try {
    const payload = { source: "suricata", signature: "LAB tcp port probe against app ports" };
    const missing = await postSensor(srv.base, payload);
    assert.equal(missing.status, 401);
    const wrong = await postSensor(srv.base, payload, "not-the-token");
    assert.equal(wrong.status, 401);

    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const rows = await conn.query("select count(*)::int as n from alerts where rule_id = 'SENSOR-IDS'");
    await conn.end();
    assert.equal(rows.rows[0].n, 0, "a refused post must open no alert");
    const denied = await countAudit("sensor.alert", "denied");
    assert.ok(denied >= 2, `expected two denied audit rows, saw ${denied}`);
  } finally {
    await srv.close();
  }
});

test("T-63 the same sensor event shipped twice keeps one row", async () => {
  resetDb();
  securityTrip.resetWindows();
  sensorRate.resetWindows();
  const srv = await startApp();
  try {
    const payload = {
      source: "suricata",
      signature: "LAB rapid login failure burst on 8100",
      severity: "medium",
      src: "127.0.0.1:49152",
      dst: "127.0.0.1:8100",
      observedAt: "2026-10-13T10:00:07.600000+0200",
    };
    const first = await postSensor(srv.base, payload, TOKEN);
    assert.equal(first.status, 201);
    assert.equal(((await first.json()) as { created: boolean }).created, true);
    const second = await postSensor(srv.base, payload, TOKEN);
    assert.equal(second.status, 200);
    assert.equal(((await second.json()) as { created: boolean }).created, false);

    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const rows = await conn.query(
      "select count(*)::int as n, bool_or(last_seen_at > first_seen_at) as refreshed from alerts where rule_id = 'SENSOR-IDS'"
    );
    await conn.end();
    assert.equal(rows.rows[0].n, 1);
    assert.equal(rows.rows[0].refreshed, true, "the duplicate should refresh last_seen_at");
  } finally {
    await srv.close();
  }
});

test("T-64 a wazuh sensor event names the Wazuh FIM source", async () => {
  resetDb();
  securityTrip.resetWindows();
  sensorRate.resetWindows();
  const srv = await startApp();
  try {
    const created = await postSensor(
      srv.base,
      { source: "wazuh", signature: "File added to a watched directory", severity: "low" },
      TOKEN
    );
    assert.equal(created.status, 201);
    const { id } = (await created.json()) as { id: string };
    const conn = new pg.Client({ connectionString: dbUrl });
    await conn.connect();
    const rows = await conn.query("select reason, priority from alerts where id = $1", [id]);
    await conn.end();
    assert.equal(rows.rows[0].reason, "Wazuh FIM: File added to a watched directory");
    assert.equal(rows.rows[0].priority, "low");
  } finally {
    await srv.close();
  }
});

test("T-65 a burst past the sensor rate limit is refused", async () => {
  resetDb();
  securityTrip.resetWindows();
  sensorRate.resetWindows();
  process.env.SENSOR_RATE_LIMIT = "3";
  const srv = await startApp();
  try {
    const payload = { source: "suricata", signature: "LAB rate limit probe" };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      statuses.push((await postSensor(srv.base, payload, TOKEN)).status);
    }
    assert.deepEqual(statuses, [201, 200, 200, 429]);
  } finally {
    delete process.env.SENSOR_RATE_LIMIT;
    await srv.close();
  }
});

test(
  "T-66 the shipper carries replayed eve alerts into the inbox",
  { skip: suricataInstalled() ? false : "suricata binary is not installed" },
  async () => {
    resetDb();
    securityTrip.resetWindows();
    sensorRate.resetWindows();
    const srv = await startApp();
    const { alerts, cleanup } = replayFixture();
    try {
      const eveText = alerts.map((a) => JSON.stringify(a)).join("\n");
      const parsed = parseEveAlerts(eveText);
      assert.equal(parsed.length, 3, `expected three shipped alerts, parsed ${parsed.length}`);
      const result = await shipAlerts({ base: srv.base, token: TOKEN, alerts: parsed });
      assert.equal(result.sent, 3);
      assert.equal(result.refused, 0);

      const cookie = await loginFull(srv.base, "analyst1", "demo-analyst-pass");
      const inbox = await fetch(`${srv.base}/api/v1/alerts`, { headers: { cookie } });
      assert.equal(inbox.status, 200);
      const items = ((await inbox.json()) as { items: { ruleId: string; reason: string }[] }).items;
      const mine = items.filter((a) => a.ruleId === "SENSOR-IDS");
      assert.equal(mine.length, 3);
      const reasons = mine.map((a) => a.reason).join(" | ");
      assert.ok(reasons.includes("Suricata IDS: LAB cleartext credential post on an app port"), reasons);
      assert.ok(reasons.includes("Suricata IDS: LAB rapid login failure burst on 8100"), reasons);
      assert.ok(reasons.includes("Suricata IDS: LAB tcp port probe against app ports"), reasons);

      // A 429 answer is counted, never thrown.
      const strict = createServer((req, res) => {
        res.statusCode = 429;
        res.end("{}");
      });
      await new Promise<void>((resolve) => strict.listen(0, resolve));
      const strictPort = (strict.address() as { port: number }).port;
      const refused = await shipAlerts({
        base: `http://localhost:${strictPort}`,
        token: TOKEN,
        alerts: parsed,
      });
      await new Promise<void>((resolve, reject) => strict.close((e) => (e ? reject(e) : resolve())));
      assert.equal(refused.sent, 0);
      assert.equal(refused.refused, 3);
    } finally {
      cleanup();
      await srv.close();
    }
  }
);

test("T-67 the wazuh parser maps levels and descriptions to sensor payloads", () => {
  const ndjson = [
    JSON.stringify({
      timestamp: "2026-10-13T08:00:00.000+0000",
      rule: { level: 5, description: "Integrity checksum changed." },
      agent: { name: "lab-agent" },
      location: "syscheck",
    }),
    JSON.stringify({
      timestamp: "2026-10-13T08:01:00.000+0000",
      rule: { level: 12, description: "Multiple authentication failures." },
      agent: { name: "lab-agent" },
      location: "sshd",
    }),
  ].join("\n");
  const parsed = parseWazuhAlerts(ndjson);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].source, "wazuh");
  assert.equal(parsed[0].signature, "Integrity checksum changed.");
  assert.equal(parsed[0].severity, "low");
  assert.equal(parsed[1].severity, "medium");
  assert.equal(parsed[1].src, "lab-agent");
});
