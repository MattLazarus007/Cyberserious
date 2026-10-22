import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { isBanned } from "./ban.ts";
import { recordAudit } from "./audit.ts";
import { recordSecurityEvent } from "./securitylog.ts";

const RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "WAF-TRAVERSAL", pattern: /(?:\.\.\/|\.\.\\|%2e%2e%2f)/i },
  { id: "WAF-SQLI", pattern: /(?:\bunion\b[\s\S]{0,40}\bselect\b|\bor\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+|\bdrop\s+table\b)/i },
  { id: "WAF-XSS", pattern: /(?:<script\b|javascript:\s*|onerror\s*=|onload\s*=)/i },
  { id: "WAF-NULL", pattern: /%00|\u0000/ },
];

function fingerprint(req: Request): string {
  return [req.method, req.path, req.originalUrl].join(" ");
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksHostile(req: Request): string | null {
  // Only the request target is inspected. Records are allowed to hold
  // hostile-looking text because the UI renders them as inert text; a
  // body matcher would break that documented behaviour.
  const subject = decoded(req.originalUrl);
  for (const rule of RULES) {
    if (rule.pattern.test(subject)) return rule.id;
  }
  return null;
}

export async function waf(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = req.socket.remoteAddress ?? "unknown";
  let blocked = false;
  try {
    blocked = await isBanned(ip);
  } catch {
    // A database outage must not turn the edge into a 500 for every
    // request; the session layer still refuses unauthenticated access.
    blocked = false;
  }
  if (blocked) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const rule = looksHostile(req);
  if (!rule) {
    next();
    return;
  }
  const digest = createHash("sha256").update(fingerprint(req)).digest("hex");
  await recordAudit({
    actor: ip,
    action: "waf.block",
    resource: rule,
    result: "denied",
    meta: { path: req.path },
  }).catch(() => undefined);
  await recordSecurityEvent({
    source: "application",
    kind: "waf",
    severity: "medium",
    signature: rule,
    src: ip,
    dst: req.hostname,
    raw: { path: req.path, method: req.method, digest },
  }).catch(() => undefined);
  res.status(403).json({ error: "request blocked" });
}
