import express from "express";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db.ts";
import { authRouter } from "./routes/auth.ts";
import { casesRouter } from "./routes/cases.ts";
import { alertsRouter } from "./routes/alerts.ts";

const here = dirname(fileURLToPath(import.meta.url));

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.get("/health/live", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/ready", async (_req, res) => {
  try {
    await query("select 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use("/api/v1", authRouter);
app.use("/api/v1", casesRouter);
app.use("/api/v1", alertsRouter);

app.use(express.static(join(here, "..", "web")));

const port = Number(process.env.PORT ?? 8100);
const direct = process.argv[1] === fileURLToPath(import.meta.url);
if (direct) {
  app.listen(port, () => {
    console.log(`regulator listening on ${port}`);
  });
}
