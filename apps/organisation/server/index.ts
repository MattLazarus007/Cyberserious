process.env.ORG_APP = "1";
process.env.DATABASE_URL = process.env.ORG_DATABASE_URL ?? "postgres://cyberserious:***@localhost:5432/cyberserious_org_dev";

import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../../regulator/server/db.ts";
import { authRouter } from "../../regulator/server/routes/auth.ts";
import { securityHeaders } from "../../regulator/server/security.ts";
import { requestGuard } from "../../regulator/server/request-guard.ts";
import { securityTrip } from "../../regulator/server/trip.ts";
import { draftsRouter } from "./drafts.ts";
import { hardenServer, hostFromEnv } from "../../regulator/server/http.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const orgApp = express();
orgApp.disable("x-powered-by");
orgApp.set("trust proxy", "loopback");
orgApp.use(express.json({ limit: "256kb" }));
orgApp.use(securityHeaders);
orgApp.use(requestGuard);

orgApp.get("/health/live", (_req, res) => {
  res.json({ ok: true });
});

orgApp.get("/health/ready", async (_req, res) => {
  try {
    await query("select 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

orgApp.use("/api/v1", authRouter);
orgApp.use("/api/v1", draftsRouter);

orgApp.use(express.static(join(here, "..", "web")));

export function startOrganisation(port = Number(process.env.ORG_PORT ?? 8200)) {
  const host = hostFromEnv();
  return hardenServer(
    orgApp.listen(port, host, () => {
      console.log(`organisation listening on ${host}:${port}`);
    })
  );
}

const direct = process.argv[1] === fileURLToPath(import.meta.url);
if (direct) {
  startOrganisation();
}
