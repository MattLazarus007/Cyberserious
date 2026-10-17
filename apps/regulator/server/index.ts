import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.ts";
import { authRouter, oidcRouter } from "./routes/auth.ts";
import { casesRouter } from "./routes/cases.ts";
import { alertsRouter } from "./routes/alerts.ts";
import { notesRouter } from "./routes/notes.ts";
import { transitionsRouter } from "./routes/transitions.ts";
import { assignmentsRouter } from "./routes/assignments.ts";
import { importsRouter } from "./routes/imports.ts";
import { researchRouter } from "./routes/research.ts";
import { intakeRouter } from "./routes/intake.ts";
import { sensorRouter } from "./routes/sensor.ts";
import { evidenceRouter } from "./routes/evidence.ts";
import { usersRouter } from "./routes/users.ts";
import { verifyChain } from "./audit.ts";
import { requireSession } from "./session.ts";
import { can } from "./policy.ts";
import { securityHeaders } from "./security.ts";
import { securityTrip } from "./trip.ts";
import { mtlsPortFromEnv, startMtls } from "./mtls.ts";
import type { Actor } from "./session.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use(securityHeaders);
app.use(securityTrip);

app.get("/health/live", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await query("select 1");
    const queue = await query(
      `select count(*)::int as pending,
              coalesce(extract(epoch from (now() - min(next_attempt_at)))::int, 0) as "oldestSec"
         from outbox_jobs where state in ('pending','leased')`
    );
    const pending = queue.rows[0].pending as number;
    const oldestSec = queue.rows[0].oldestSec as number;
    res.json({ ok: true, queue: { pending, oldestSec, warn: oldestSec > 300 } });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use("/api/v1", authRouter);
// The sensor intake sits above the session scoped routers: its shared
// secret replaces a cookie, and the routers below answer 401 to any
// /api/v1 path that reaches them first.
app.use("/api/v1", sensorRouter);
// OpenID Connect lives at the root: the provider redirects the browser
// to /auth/oidc/callback, outside the api prefix.
app.use(oidcRouter);
app.use("/api/v1", casesRouter);
app.use("/api/v1", alertsRouter);
app.use("/api/v1", notesRouter);
app.use("/api/v1", transitionsRouter);
app.use("/api/v1", assignmentsRouter);
app.use("/api/v1", importsRouter);
app.use("/api/v1", researchRouter);
app.use(intakeRouter);
app.use("/api/v1", evidenceRouter);
app.use("/api/v1", usersRouter);

app.get("/api/v1/audit/verify", requireSession, async (req, res) => {
  const actor = (req as unknown as { actor: Actor }).actor;
  if (!actor.mfaOk || !can(actor.role, "read_audit")) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  res.json(await verifyChain());
});

app.use(express.static(join(here, "..", "web")));

const port = Number(process.env.PORT ?? 8100);
const direct = process.argv[1] === fileURLToPath(import.meta.url);
if (direct) {
  app.listen(port, () => {
    console.log(`regulator listening on ${port}`);
  });
  // The mutual tls intake listener is opt in. Nothing starts until
  // MTLS_PORT carries a value, so the plain port keeps serving the
  // lab UI and every existing test exactly as before.
  const mtlsPort = mtlsPortFromEnv(process.env);
  if (mtlsPort > 0) {
    startMtls(app, mtlsPort)
      .then(() => {
        console.log(`regulator mtls listening on ${mtlsPort}`);
      })
      .catch((err: unknown) => {
        console.error("regulator mtls listener failed", err);
        process.exitCode = 1;
      });
  }
}
