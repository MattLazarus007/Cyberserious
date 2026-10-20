import { test, expect, type Page } from "@playwright/test";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { openSync, readFileSync, writeFileSync } from "node:fs";
import * as jose from "jose";
import pg from "pg";

const REG = "http://localhost:8111";
const ORG = "http://localhost:8211";
const REG_LOG = "/tmp/e2e-reg-notify.log";
const ORG_LOG = "/tmp/e2e-org-notify.log";
const KEY_FILE = "/tmp/e2e-org-notify-key.json";
const REG_DB = process.env.DATABASE_URL_TEST as string;
const ORG_DB = process.env.ORG_DATABASE_URL_TEST as string;

let regulator: ChildProcess;
let organisation: ChildProcess;

function codes(log: string, username: string): string[] {
  const text = readFileSync(log, "utf8");
  const found = text.match(new RegExp(`\\[otp\\] code for ${username}: (\\d{6})`, "g"));
  return (found ?? []).map((line) => line.slice(-6));
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // the server is still starting
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} never answered`);
}

test.beforeAll(async () => {
  execFileSync("psql", [REG_DB, "-c", "drop schema public cascade; create schema public;"], { stdio: "pipe" });
  execFileSync("node", ["apps/regulator/server/db/migrate.ts"], {
    env: { ...process.env, DATABASE_URL: REG_DB },
    stdio: "pipe",
  });
  execFileSync("node", ["db/seed.ts"], {
    env: { ...process.env, DATABASE_URL: REG_DB },
    stdio: "pipe",
  });
  execFileSync("psql", [ORG_DB, "-c", "drop schema public cascade; create schema public;"], { stdio: "pipe" });
  execFileSync("node", ["apps/organisation/server/migrate.ts"], {
    env: { ...process.env, ORG_DATABASE_URL: ORG_DB, DATABASE_URL: ORG_DB },
    stdio: "pipe",
  });
  execFileSync("node", ["db/seed_org.ts"], {
    env: { ...process.env, ORG_DATABASE_URL: ORG_DB, DATABASE_URL: ORG_DB, RESEARCH_KEY: "0".repeat(64) },
    stdio: "pipe",
  });

  const { publicKey, privateKey } = await jose.generateKeyPair("ES256", { extractable: true });
  writeFileSync(KEY_FILE, JSON.stringify(await jose.exportJWK(privateKey)));
  const conn = new pg.Client({ connectionString: REG_DB });
  await conn.connect();
  const org = await conn.query("select id from organisations where reference = 'DEMO-ORG-01'");
  await conn.query(
    "insert into sender_keys (sender_id, org_id, public_jwk, active) values ('org-karoo-01', $1, $2::jsonb, true) on conflict (sender_id) do update set public_jwk = excluded.public_jwk",
    [org.rows[0].id, JSON.stringify(await jose.exportJWK(publicKey))]
  );
  await conn.end();

  writeFileSync(REG_LOG, "");
  writeFileSync(ORG_LOG, "");
  const regOut = openSync(REG_LOG, "a");
  const orgOut = openSync(ORG_LOG, "a");
  regulator = spawn("node", ["apps/regulator/server/index.ts"], {
    env: { ...process.env, DATABASE_URL: REG_DB, PORT: "8111", OIDC_ISSUER: "" },
    stdio: ["ignore", regOut, regOut],
  });
  organisation = spawn("node", ["apps/organisation/server/index.ts"], {
    env: {
      ...process.env,
      ORG_DATABASE_URL: ORG_DB,
      ORG_PORT: "8211",
      ORG_SENDER_ID: "org-karoo-01",
      ORG_SENDER_KEY: KEY_FILE,
      REGULATOR_INTAKE_URL: `${REG}/intake/v1/submissions`,
      REGULATOR_AFFECTED_URL: `${REG}/api/v1/intake/affected-notices`,
    },
    stdio: ["ignore", orgOut, orgOut],
  });
  await waitFor(`${REG}/health/ready`);
  await waitFor(`${ORG}/health/ready`);
});

test.afterAll(async () => {
  organisation.kill();
  regulator.kill();
});

async function signInOrg(page: Page): Promise<void> {
  await page.goto(`${ORG}/login.html`);
  await page.fill("#username", "io1");
  await page.fill("#password", "demo-io-pass");
  await page.click("#passwordForm button[type=submit]");
  await expect(page.locator("#otpForm")).toBeVisible();
  let code = "";
  for (let i = 0; i < 50 && !code; i++) {
    const found = codes(ORG_LOG, "io1");
    if (found.length > 0) code = found[found.length - 1];
    else await new Promise((r) => setTimeout(r, 200));
  }
  if (!code) throw new Error("no organisation code in the server log");
  await page.fill("#otp", code);
  await page.click("#otpForm button[type=submit]");
  await page.waitForURL(`${ORG}/drafts.html`);
}

async function signInRegulator(page: Page): Promise<void> {
  await page.goto(`${REG}/login.html`);
  await page.fill("#username", "analyst1");
  await page.fill("#password", "demo-analyst-pass");
  await page.click("#passwordForm button[type=submit]");
  let code = "";
  for (let i = 0; i < 50 && !code; i++) {
    const found = codes(REG_LOG, "analyst1");
    if (found.length > 0) code = found[found.length - 1];
    else await new Promise((r) => setTimeout(r, 200));
  }
  if (!code) throw new Error("no regulator code in the server log");
  await page.fill("#otp", code);
  await page.click("#otpForm button[type=submit]");
  await page.waitForURL(`${REG}/index.html`);
}

test("T-76 the portal records a dispatch and the case shows the counts", async ({ page, browser }) => {
  await signInOrg(page);
  await page.fill("#newCategory", "data exposure");
  await page.fill("#newNarrative", "A shared drive link went further than intended.");
  await page.fill("#newAffectedCount", "25");
  await page.click("#createDraft");
  await expect(page.locator("#portalMessage")).toHaveText("Draft saved.");

  const card = page.locator(".draft-card", { hasText: "SUB-2026-0001" });
  await expect(card).toContainText("Affected people: 25.");
  await card.getByRole("button", { name: "Send for approval" }).click();
  await expect(card).toContainText("ReadyForApproval");
  await card.getByRole("button", { name: "Approve (IO only)" }).click();
  await expect(card).toContainText("Approved");
  await card.getByRole("button", { name: "Sign and send" }).click();
  await expect(card).toContainText("Receipt: case BR-2026-");

  const receipt = (await card.textContent()) ?? "";
  const caseRef = receipt.match(/BR-2026-\d+/)?.[0] ?? "";
  expect(caseRef.length).toBeGreaterThan(0);

  await card.locator("select").selectOption("email");
  await card.getByRole("button", { name: "Notify affected people (IO only)" }).click();
  await expect(page.locator("#portalMessage")).toContainText("Recorded dispatch (lab simulation): 24 of 25");
  await expect(page.locator("#portalMessage")).toContainText("The regulator accepted the affected notice.");
  await expect(card.locator(".run-list")).toContainText("24 of 25 sent by email, 1 failed");

  const context = await browser.newContext();
  try {
    const analyst = await context.newPage();
    await signInRegulator(analyst);
    await analyst.goto(`${REG}/breach.html?id=${caseRef}`);
    await expect(analyst.locator("#detailAffectedNotice"))
      .toContainText("24 of 25 notified by email");
    await expect(analyst.locator("#detailAffectedNotice")).toContainText("Shortfall: 1.");
  } finally {
    await context.close();
  }
});
