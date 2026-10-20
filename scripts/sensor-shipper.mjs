#!/usr/bin/env node
// Reads alerts out of a suricata eve.json file (or a wazuh alerts.json)
// and posts each one to the regulator sensor endpoint under the shared
// INTERNAL_TOKEN secret. A 429 answer is counted and skipped, never
// thrown, so one chatty window does not kill the run. The parse and
// ship halves are exported because the integration tests drive both
// directly, and the same functions back the command line entry point.
import { readFileSync } from "node:fs";

const SOURCE_LABEL = "suricata";

export function parseEveAlerts(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (row.event_type !== "alert" || !row.alert) continue;
    // Suricata rates severity 1 minor .. 4 critical, so anything at or
    // above the moderate step ships as medium.
    const level = Number(row.alert.severity ?? 2);
    out.push({
      source: SOURCE_LABEL,
      signature: String(row.alert.signature ?? "unnamed suricata alert"),
      severity: level >= 2 ? "medium" : "low",
      src: row.src_ip ? `${row.src_ip}:${row.src_port ?? ""}` : undefined,
      dst: row.dest_ip ? `${row.dest_ip}:${row.dest_port ?? ""}` : undefined,
      observedAt: typeof row.timestamp === "string" ? row.timestamp : undefined,
    });
  }
  return out;
}

export function parseWazuhAlerts(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const description = row?.rule?.description;
    if (typeof description !== "string" || description.length === 0) continue;
    const level = Number(row?.rule?.level ?? 3);
    out.push({
      source: "wazuh",
      signature: description.slice(0, 300),
      severity: level >= 7 ? "medium" : "low",
      src: typeof row?.agent?.name === "string" ? row.agent.name : undefined,
      observedAt: typeof row.timestamp === "string" ? row.timestamp : undefined,
    });
  }
  return out;
}

export async function shipAlerts({ base, token, alerts, fetchImpl = fetch }) {
  let sent = 0;
  let refused = 0;
  for (const alert of alerts) {
    let res;
    try {
      res = await fetchImpl(`${base}/api/v1/sensor/alerts`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-token": token },
        body: JSON.stringify(alert),
      });
    } catch {
      refused += 1;
      continue;
    }
    if (res.status === 429) {
      refused += 1;
      continue;
    }
    if (res.status === 401) {
      refused += 1;
      continue;
    }
    if (res.ok) {
      sent += 1;
      continue;
    }
    // Anything else (400, 5xx) is a real problem worth surfacing.
    const detail = await res.text().catch(() => "");
    throw new Error(`sensor post failed with ${res.status}: ${detail.slice(0, 200)}`);
  }
  return { sent, refused };
}

function argValue(flag) {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main() {
  const wazuhPath = argValue("--wazuh");
  const evePath = argValue("--eve") ?? process.env.EVE_PATH ?? "infra/sensor/out/eve.json";
  const base = argValue("--base") ?? process.env.SENSOR_BASE ?? "http://localhost:8100";
  const token = process.env.INTERNAL_TOKEN;
  if (!token) {
    console.error("INTERNAL_TOKEN is not set, refusing to post");
    process.exitCode = 1;
    return;
  }
  const path = wazuhPath ?? evePath;
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    console.error(`cannot read ${path}: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  const alerts = wazuhPath ? parseWazuhAlerts(text) : parseEveAlerts(text);
  const result = await shipAlerts({ base, token, alerts });
  console.log(`shipped ${result.sent} of ${alerts.length} alerts to ${base} (${result.refused} refused)`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
