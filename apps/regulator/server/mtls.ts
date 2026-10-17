import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:https";
import type { Express } from "express";

// Second intake listener for the organisation sender. It carries the
// same express app as the plain port, so every route, check and
// receipt behaves identically. Nothing changes until MTLS_PORT is
// set, which keeps the lab UI and the existing tests on plain http.

export const MTLS_DEFAULT_PORT = 8101;

export function mtlsPortFromEnv(env: NodeJS.ProcessEnv): number {
  const raw = env.MTLS_PORT;
  if (raw === undefined || raw.trim() === "") return 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : MTLS_DEFAULT_PORT;
}

export function startMtls(app: Express, port: number, certDir = "certs/mtls"): Promise<Server> {
  const server = createServer(
    {
      key: readFileSync(join(certDir, "server.key")),
      cert: readFileSync(join(certDir, "server.pem")),
      ca: readFileSync(join(certDir, "ca.pem")),
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: "TLSv1.3",
    },
    app
  );
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}
