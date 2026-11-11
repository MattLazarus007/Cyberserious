import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { withTransaction } from "../db.ts";
import { recordAudit, recordAuditTx } from "../audit.ts";
import { recordSecurityEventTx } from "../securitylog.ts";

const payload = z.object({
  source: z.enum(["suricata", "wazuh", "vector", "osquery", "host", "application"]),
  kind: z.string().min(1).max(80),
  severity: z.enum(["low", "medium", "high"]).default("low"),
  signature: z.string().min(1).max(400),
  src: z.string().max(120).optional(),
  dst: z.string().max(120).optional(),
  observedAt: z.string().max(60).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

function tokenAccepted(provided: string | undefined): boolean {
  const expected = process.env.INTERNAL_TOKEN;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const WINDOW_MS = 60_000;

export interface IngestRate {
  (req: Request, res: Response, next: NextFunction): void;
  resetWindows(): void;
}

function createRate(): IngestRate {
  const windows = new Map<string, number[]>();
  const guard = function ingestRate(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const ip = req.socket.remoteAddress ?? "unknown";
    const kept = (windows.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
    kept.push(now);
    windows.set(ip, kept);
    const max = Number(process.env.INGEST_RATE_LIMIT) > 0 ? Number(process.env.INGEST_RATE_LIMIT) : 120;
    if (kept.length > max) {
      res.status(429).json({ error: "ingest rate limit" });
      return;
    }
    next();
  };
  guard.resetWindows = () => windows.clear();
  return guard;
}

export const ingestRate: IngestRate = createRate();
export const securityIngestRouter = Router();

securityIngestRouter.post("/security/ingest", ingestRate, async (req, res) => {
  if (!tokenAccepted(req.get("x-internal-token"))) {
    await recordAudit({
      actor: "collector",
      action: "security.ingest",
      resource: "collector",
      result: "denied",
      meta: { why: "bad token" },
    }).catch(() => undefined);
    res.status(401).json({ error: "unknown collector" });
    return;
  }
  const parsed = payload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid security event" });
    return;
  }
  const event = parsed.data;
  const digest = createHash("sha256")
    .update([event.source, event.kind, event.signature, event.observedAt ?? "", event.src ?? "", event.dst ?? ""].join("|"))
    .digest("hex");
  const outcome = await withTransaction(async (client) => {
    const stored = await recordSecurityEventTx(client, event);
    let alertId: string | null = null;
    if (event.severity === "high") {
      const alert = await client.query(
        `insert into alerts (case_id, rule_id, rule_version, dedupe_key, priority, reason, input_hash, state)
         values (null, 'SECURITY-EVENT', 1, $1, 'high', $2, $3, 'open')
         on conflict (dedupe_key) do nothing returning id`,
        [`security-event:${digest}`, `${event.source}: ${event.signature}`, digest]
      );
      alertId = (alert.rows[0]?.id as string | undefined) ?? null;
    }
    await recordAuditTx(client, {
      actor: event.source,
      action: "security.ingest",
      resource: String(stored.seq),
      result: "ok",
      meta: { kind: event.kind, severity: event.severity },
    });
    return { seq: stored.seq, alertId };
  });
  res.status(201).json({ ok: true, ...outcome });
});
