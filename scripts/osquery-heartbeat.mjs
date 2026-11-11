// Posts one host telemetry heartbeat after a real osquery inventory read.
// The token comes from scripts/env.sh, which reads the Keychain entry.
import { execFileSync } from "node:child_process";

const root = process.cwd();
const token = process.env.INTERNAL_TOKEN;
if (!token) {
  console.error("no INTERNAL_TOKEN in the environment");
  process.exit(2);
}

try {
  execFileSync("pgrep", ["-x", "osqueryd"], { stdio: "ignore" });
} catch {
  console.error("osqueryd is not running, no heartbeat sent");
  process.exit(2);
}

let ports = 0;
try {
  const raw = execFileSync("/usr/local/bin/osqueryi", ["--json", "select count(*) as n from listening_ports;"], {
    encoding: "utf8",
  });
  ports = Number(JSON.parse(raw)[0]?.n ?? 0);
} catch (err) {
  console.error("osquery query failed", err.message);
  process.exit(3);
}

const body = {
  source: "osquery",
  kind: "inventory",
  severity: "low",
  signature: `host inventory collected, ${ports} listening ports`,
  observedAt: new Date().toISOString(),
  raw: { listeningPorts: ports, agent: "osqueryd" },
};

// Loopback only. The request never leaves the host, and the token stays local.
// nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
const res = await fetch("http://127.0.0.1:8100/api/v1/security/ingest", {
  method: "POST",
  headers: { "content-type": "application/json", "x-internal-token": token },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(`ingest ${res.status} ${text}`);
process.exit(res.ok ? 0 : 1);
