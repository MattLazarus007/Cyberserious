// Sensor intake. A lab sensor (the eve.json shipper, or a wazuh agent
// forwarder) posts one JSON alert per line it saw. Authentication is a
// shared secret in the x-internal-token header compared in constant
// time; the endpoint opens no session and touches no cookie. Every
// accepted row lands in the alerts table with rule_id SENSOR-IDS and a
// reason that names the source, so the inbox shows where the signal
// came from. The burst limit below is a quiet 429, deliberately softer
// than the trip wire: a chatty sensor should not lock the service.
import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { withTransaction } from "../db.ts";
import { recordAudit, recordAuditTx } from "../audit.ts";

const sensorPayload = z.object({
  source: z.enum(["suricata", "wazuh"]),
  signature: z.string().min(1).max(300),
  severity: z.enum(["low", "medium"]).default("low"),
  src: z.string().max(120).optional(),
  dst: z.string().max(120).optional(),
  observedAt: z.string().max(60).optional(),
});

const SOURCE_LABEL: Record<string, string> = {
  suricata: "Suricata IDS",
  wazuh: "Wazuh FIM",
};

function tokenAccepted(provided: string | undefined): boolean {
  const expected = process.env.INTERNAL_TOKEN;
  if (!expected || expected.length === 0 || !provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function clientIp(req: Request): string {
  return req.socket.remoteAddress ?? "unknown";
}

function rateMax(): number {
  const raw = Number(process.env.SENSOR_RATE_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? raw : 60;
}

const WINDOW_MS = 60_000;

export interface SensorRate {
  (req: Request, res: Response, next: NextFunction): void;
  resetWindows(): void;
}

function createSensorRate(): SensorRate {
  const windows = new Map<string, number[]>();
  const guard = function sensorRateGuard(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const ip = clientIp(req);
    const kept = (windows.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
    kept.push(now);
    windows.set(ip, kept);
    if (kept.length > rateMax()) {
      windows.set(ip, kept);
      res.status(429).json({ error: "sensor rate limit" });
      return;
    }
    next();
  };
  guard.resetWindows = () => {
    windows.clear();
  };
  return guard;
}

export const sensorRate: SensorRate = createSensorRate();

export const sensorRouter = Router();

sensorRouter.post("/sensor/alerts", sensorRate, async (req, res) => {
  const rawToken = req.get("x-internal-token");
  if (!tokenAccepted(rawToken)) {
    await recordAudit({
      actor: "sensor",
      action: "sensor.alert",
      resource: "sensor",
      result: "denied",
      meta: { why: rawToken ? "bad token" : "no token" },
    });
    res.status(401).json({ error: "unknown sensor" });
    return;
  }
  const parsed = sensorPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "expected a source, a signature and a severity of low or medium" });
    return;
  }
  const event = parsed.data;
  const fingerprint = createHash("sha256")
    .update([event.source, event.signature, event.observedAt ?? "", event.src ?? "", event.dst ?? ""].join("|"))
    .digest("hex");
  const dedupeKey = `sensor:${event.source}:${fingerprint}`;
  const inputHash = createHash("sha256").update(JSON.stringify(event)).digest("hex");
  const reason = `${SOURCE_LABEL[event.source]}: ${event.signature}`;

  const outcome = await withTransaction(async (client) => {
    const inserted = await client.query(
      `insert into alerts (case_id, rule_id, rule_version, dedupe_key, priority, reason, input_hash, state)
       values (null, 'SENSOR-IDS', 1, $1, $2, $3, $4, 'open')
       on conflict (dedupe_key) do nothing returning id`,
      [dedupeKey, event.severity, reason, inputHash]
    );
    if (inserted.rows.length > 0) {
      await recordAuditTx(client, {
        actor: "sensor",
        action: "sensor.alert",
        resource: inserted.rows[0].id as string,
        result: "ok",
        meta: { source: event.source, signature: event.signature },
      });
      return { id: inserted.rows[0].id as string, created: true };
    }
    const existing = await client.query(
      "update alerts set last_seen_at = now() where dedupe_key = $1 returning id",
      [dedupeKey]
    );
    return { id: existing.rows[0]?.id as string, created: false };
  });

  res.status(outcome.created ? 201 : 200).json({ ok: true, ...outcome });
});
