import type { Server } from "node:http";

export function hostFromEnv(fallback = "127.0.0.1"): string {
  return process.env.HOST ?? fallback;
}

export function hardenServer(server: Server): Server {
  server.requestTimeout = 30_000;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  return server;
}
