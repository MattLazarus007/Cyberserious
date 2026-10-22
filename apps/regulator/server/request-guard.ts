import { timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function internalTokenOk(req: Request): boolean {
  const expected = process.env.INTERNAL_TOKEN;
  const given = req.get("x-cyberserious-token");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function expectedOrigin(req: Request): string {
  const forwarded = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwarded || req.protocol;
  const host = req.get("host");
  return host ? `${proto}://${host}` : "";
}

function allowedOrigins(req: Request): Set<string> {
  const extra = (process.env.PUBLIC_ORIGIN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([expectedOrigin(req), ...extra]);
}

export function requestGuard(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (internalTokenOk(req)) {
    next();
    return;
  }

  const site = req.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    res.status(403).json({ error: "cross-site request refused" });
    return;
  }

  const origin = req.get("origin");
  if (origin && !allowedOrigins(req).has(origin)) {
    res.status(403).json({ error: "origin not allowed" });
    return;
  }

  next();
}
