import type { NextFunction, Request, Response } from "express";

export interface RateGuard {
  (req: Request, res: Response, next: NextFunction): void;
  resetWindows(): void;
  clearIp(ip: string): void;
}

export function createIpRate(max: number, windowMs: number): RateGuard {
  const windows = new Map<string, number[]>();
  const guard = function ipRate(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const ip = req.socket.remoteAddress ?? "unknown";
    const kept = (windows.get(ip) ?? []).filter((t) => t > now - windowMs);
    kept.push(now);
    windows.set(ip, kept);
    if (windows.size > 2000) {
      for (const [key, stamps] of windows) {
        if ((stamps[stamps.length - 1] ?? 0) <= now - windowMs) windows.delete(key);
      }
    }
    if (kept.length > max) {
      res.setHeader("retry-after", String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ error: "too many attempts, try again later" });
      return;
    }
    next();
  };
  guard.resetWindows = () => windows.clear();
  guard.clearIp = (ip: string) => windows.delete(ip);
  return guard;
}
