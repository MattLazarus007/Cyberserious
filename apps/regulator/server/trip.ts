// Security trip-wire. A burst of unauthenticated /api/ requests from one
// client IP locks the whole service: every route answers 503 except
// /health/ready, all sessions are revoked, and an audit row plus a high
// alert record the lock. The locked state is held in memory and in the
// flag file data/trip.lock, so a restart alone does not reopen the
// service. An operator reopens by removing the flag file or by
// restarting with TRIP_OPEN=1, which clears it. Threshold is read from
// TRIP_THRESHOLD at request time (default 100 per 60 second window) so
// the lab can lower it for the demo.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";
import { query, withTransaction } from "./db.ts";
import { recordAuditTx } from "./audit.ts";
import { readCookie, SESSION_COOKIE } from "./session.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const TRIP_FLAG = join(here, "..", "..", "..", "data", "trip.lock");

const WINDOW_MS = 60_000;
const DEFAULT_THRESHOLD = 100;

function threshold(): number {
  const raw = Number(process.env.TRIP_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD;
}

function clientIp(req: Request): string {
  return req.socket.remoteAddress ?? "unknown";
}

export interface TripGuard {
  (req: Request, res: Response, next: NextFunction): Promise<void>;
  resetWindows(): void;
}

export function createTripGuard(): TripGuard {
  const openAtBoot = process.env.TRIP_OPEN === "1";
  if (openAtBoot) rmSync(TRIP_FLAG, { force: true });
  let tripped = openAtBoot ? false : existsSync(TRIP_FLAG);
  const windows = new Map<string, number[]>();

  async function trip(ip: string): Promise<void> {
    if (tripped) return;
    tripped = true;
    mkdirSync(dirname(TRIP_FLAG), { recursive: true });
    writeFileSync(TRIP_FLAG, `tripped by ${ip} at ${new Date().toISOString()}\n`);
    // Revoke everyone, stolen cookies included.
    await query("delete from sessions");
    const reason = `unauthenticated request burst from ${ip} tripped the service`;
    const inputHash = createHash("sha256").update(reason).digest("hex");
    await withTransaction(async (client) => {
      await client.query(
        `insert into alerts (case_id, rule_id, rule_version, dedupe_key, priority, reason, input_hash, state)
         values (null, 'SECURITY-TRIP', 1, $1, 'high', $2, $3, 'open')
         on conflict (dedupe_key) do nothing`,
        [`security-trip:${ip}`, reason, inputHash]
      );
      await recordAuditTx(client, {
        actor: ip,
        action: "security.trip",
        result: "denied",
        meta: { threshold: threshold(), windowSec: WINDOW_MS / 1000 },
      });
    });
  }

  const guard = async function tripGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (tripped) {
      if (req.path === "/health/ready") {
        res.status(200).json({ ok: true, locked: true });
        return;
      }
      res.status(503).type("text/plain").send("service locked");
      return;
    }
    if (!req.path.startsWith("/api/")) return next();
    let authenticated = false;
    const sid = readCookie(req, SESSION_COOKIE);
    if (sid) {
      const found = await query("select 1 from sessions where id = $1", [sid]);
      authenticated = found.rows.length > 0;
    }
    if (authenticated) return next();
    const ip = clientIp(req);
    const now = Date.now();
    const kept = (windows.get(ip) ?? []).filter((t) => t > now - WINDOW_MS);
    kept.push(now);
    windows.set(ip, kept);
    if (windows.size > 1000) {
      for (const [key, stamps] of windows) {
        if ((stamps[stamps.length - 1] ?? 0) <= now - WINDOW_MS) windows.delete(key);
      }
    }
    if (kept.length < threshold()) return next();
    windows.delete(ip);
    try {
      await trip(ip);
    } catch (err) {
      console.error("[trip] lock side effects failed", err);
    }
    res.status(503).type("text/plain").send("service locked");
  };
  guard.resetWindows = () => {
    windows.clear();
  };
  return guard;
}

export const securityTrip: TripGuard = createTripGuard();
