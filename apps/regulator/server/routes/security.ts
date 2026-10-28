import { Router } from "express";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { query } from "../db.ts";
import { can } from "../policy.ts";
import { requireSession, type Actor } from "../session.ts";
import { securitySummary, verifySecurityChain } from "../securitylog.ts";
import { TRIP_FLAG } from "../trip.ts";
import { banIp, listBans, unbanIp } from "../ban.ts";
import { recordAudit } from "../audit.ts";
import { recentExports } from "../dlp.ts";

export const securityRouter = Router();
securityRouter.use(requireSession);

function allowed(actor: Actor): boolean {
  return actor.mfaOk && (can(actor.role, "read_audit") || actor.role === "security_officer");
}

function backupAge(): { latest: string | null; ageHours: number | null } {
  const dir = process.env.BACKUP_ROOT ?? join(process.cwd(), "data", "backups");
  try {
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".age"))
      .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length === 0) return { latest: null, ageHours: null };
    return {
      latest: files[0].name,
      ageHours: Math.round(((Date.now() - files[0].mtime) / 3_600_000) * 10) / 10,
    };
  } catch {
    return { latest: null, ageHours: null };
  }
}

securityRouter.get("/security/state", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!allowed(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const alerts = await query(
    `select priority, count(*)::int as n from alerts
      where state in ('open','acknowledged') group by priority`
  );
  const open: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const row of alerts.rows) open[row.priority as string] = row.n as number;
  const summary = await securitySummary();
  res.json({
    ok: true,
    events: {
      total: summary.events,
      last24h: summary.last24h,
      high24h: summary.high24h,
      chain: summary.chain,
    },
    alerts: open,
    heartbeats: summary.heartbeats,
    backup: backupAge(),
    trip: { locked: existsSync(TRIP_FLAG) },
    bannedIps: await listBans(),
    exports: await recentExports(10),
  });
});

securityRouter.get("/security/bans", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!allowed(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.json({ items: await listBans() });
});

securityRouter.post("/security/bans", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!allowed(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const ip = typeof req.body?.ip === "string" ? req.body.ip.trim() : "";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const minutes = Number(req.body?.minutes);
  if (!ip || ip.length > 60 || !reason || reason.length > 300) {
    res.status(400).json({ error: "expected an address and a reason" });
    return;
  }
  await banIp(ip, reason, actor.username, Number.isFinite(minutes) ? minutes : 60);
  await recordAudit({
    actor: actor.username,
    action: "security.ban",
    resource: ip,
    result: "ok",
    meta: { reason, minutes: Number.isFinite(minutes) ? minutes : 60 },
  });
  res.status(201).json({ ok: true, ip });
});

securityRouter.delete("/security/bans/:ip", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!allowed(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const done = await unbanIp(req.params.ip);
  if (!done) {
    res.status(404).json({ error: "not found" });
    return;
  }
  await recordAudit({
    actor: actor.username,
    action: "security.unban",
    resource: req.params.ip,
    result: "ok",
  });
  res.json({ ok: true });
});

securityRouter.get("/security/verify", async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!allowed(actor)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.json(await verifySecurityChain());
});
