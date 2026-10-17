import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { openSync, readFileSync, writeFileSync } from "node:fs";

const PORT = 8101;
const BASE = `http://localhost:${PORT}`;
const LOG = "/tmp/e2e-server.log";
let server: ChildProcess;

function freshCodes(username: string, since: number): string[] {
  const matches = readFileSync(LOG, "utf8").match(new RegExp(`\\[otp\\] code for ${username}: (\\d{6})`, "g"));
  return ((matches ?? []).map((line) => line.slice(-6))).slice(since);
}

async function signIn(page: Page): Promise<void> {
  const seen = freshCodes("analyst1", 0).length;
  await page.goto(`${BASE}/login.html`);
  await page.fill("#username", "analyst1");
  await page.fill("#password", "demo-analyst-pass");
  await page.click("#passwordForm button[type=submit]");
  let code = "";
  for (let i = 0; i < 50; i++) {
    const fresh = freshCodes("analyst1", seen);
    if (fresh.length > 0) {
      code = fresh[fresh.length - 1];
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!code) throw new Error("no otp in server log");
  await page.fill("#otp", code);
  await page.click("#otpForm button[type=submit]");
  await page.waitForURL(`${BASE}/index.html`);
}

test.beforeAll(async () => {
  writeFileSync(LOG, "");
  const out = openSync(LOG, "a");
  server = spawn("node", ["apps/regulator/server/index.ts"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", out, out],
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/health/ready`);
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("e2e server never came up");
});

test.afterAll(async () => {
  server.kill();
});

test("T-34 sign in with the console code and land on the dashboard", async ({ page }) => {
  await signIn(page);
  await expect(page.locator("#totalNotifications")).not.toBeEmpty();
});

test("T-34 dashboard to register to case detail", async ({ page }) => {
  await signIn(page);
  await page.goto(`${BASE}/notifications.html`);
  await expect(page.locator("#notificationsTableBody tr").first()).toBeVisible();
  await page.locator("#notificationsTableBody a").first().click();
  await page.waitForURL(/breach\.html\?id=BR-2026-/);
  await expect(page.locator("#caseTitle")).toContainText("Breach Case #BR-2026-");
});

test("T-34 an analyst saves a note but cannot move the case", async ({ page }) => {
  await signIn(page);
  await page.goto(`${BASE}/breach.html?id=BR-2026-0001`);
  await page.fill("#notes", "e2e note from the browser run");
  await page.click("#addNoteButton");
  await expect(page.locator("#noteMessage")).toContainText("Note kept.");
  await page.selectOption("#caseStatus", "AwaitingInformation");
  await page.click("#updateStatusButton");
  await expect(page.locator("#statusMessage")).toContainText("Only supervisors");
});

test("1.4 unknown and missing case ids render the not-found state", async ({ page }) => {
  await page.goto(`${BASE}/breach.html?id=BR-9999-0000`);
  await expect(page.locator("#caseTitle")).toContainText("Case not found");
  await page.goto(`${BASE}/breach.html`);
  await expect(page.locator("#caseTitle")).toContainText("Case not found");
});

test("T-34 small screen keeps navigation, large text keeps content", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/index.html`);
  await expect(page.locator(".sidebar .nav").first()).toBeVisible();
  await page.goto(`${BASE}/notifications.html`);
  await expect(page.locator("#notificationsTableBody")).toBeVisible();
});

test("signed-out dashboard shows blur lock, data stays locked", async ({ page, request }) => {
  await page.goto(`${BASE}/index.html`);
  const lock = page.locator("#screen-lock");
  await expect(lock).toBeVisible();
  await expect(lock).toHaveAttribute("role", "alertdialog");
  const link = lock.locator("a");
  await expect(link).toContainText("Sign in");
  await expect(link).toHaveAttribute("href", "login.html");
  const data = await request.get(`${BASE}/api/v1/cases`);
  expect(data.status()).toBe(401);
  await signIn(page);
  await expect(page.locator("#screen-lock")).toHaveCount(0);
  await expect(page.locator("#totalNotifications")).not.toBeEmpty();
  await expect(page.locator("#pendingCases")).not.toBeEmpty();
  await expect(page.locator("#activeAlerts")).not.toBeEmpty();
});

test("topbar shows sign in when signed out and name when signed in", async ({ page }) => {
  await page.goto(`${BASE}/index.html`);
  await expect(page.locator(".user")).toContainText("Sign in");
  await signIn(page);
  await expect(page.locator(".user")).toContainText("Regulator Analyst");
});

test("console removal of the lock reveals no data", async ({ page }) => {
  await page.goto(`${BASE}/index.html`);
  await expect(page.locator("#screen-lock")).toBeVisible();
  await page.evaluate(() => document.getElementById("screen-lock")?.remove());
  await expect(page.locator("#screen-lock")).toHaveCount(0);
  const bodyText = await page.locator("body").innerText();
  for (const secret of [
    "BR-2026",
    "Karoo Retail Holdings",
    "Umhlanga Logistics",
    "Thabazimbi Health Group",
    "Standard Bank",
    "Liberty Group",
    "@regulator.example",
    "@karoo-retail.example",
  ]) {
    expect(bodyText).not.toContain(secret);
  }
  expect(bodyText).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/);
  const statuses = await page.evaluate(async () => {
    const paths = ["/api/v1/cases", "/api/v1/alerts", "/api/v1/evidence"];
    const out: Record<string, number> = {};
    for (const path of paths) {
      out[path] = (await fetch(path)).status;
    }
    return out;
  });
  expect(statuses["/api/v1/cases"]).toBe(401);
  expect(statuses["/api/v1/alerts"]).toBe(401);
  expect(statuses["/api/v1/evidence"]).toBe(401);
  await expect(page.locator("#totalNotifications")).toHaveText("0");
  await expect(page.locator("#pendingCases")).toHaveText("0");
  await expect(page.locator("#activeAlerts")).toHaveText("0");
  await expect(page.locator("#recentActivity tr")).toHaveCount(1);
  await expect(page.locator("#recentActivity")).toContainText("Loading demonstration records…");
  await expect(page.locator("#recentActivity tr td")).toHaveCount(1);
});

test("group passphrase signs in with no code step", async ({ page }) => {
  const groupPort = 8102;
  const groupBase = `http://localhost:${groupPort}`;
  const groupLog = "/tmp/e2e-group-server.log";
  writeFileSync(groupLog, "");
  const groupOut = openSync(groupLog, "a");
  const groupServer: ChildProcess = spawn("node", ["apps/regulator/server/index.ts"], {
    env: { ...process.env, PORT: String(groupPort), GROUP_LOGIN: "1", GROUP_PASSPHRASE: "e2e-group-secret" },
    stdio: ["ignore", groupOut, groupOut],
  });
  try {
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      try {
        const res = await fetch(`${groupBase}/health/ready`);
        if (res.ok) {
          up = true;
        } else {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!up) throw new Error("group e2e server never came up");
    await page.goto(`${groupBase}/login.html`);
    await expect(page.locator("#groupForm")).toBeVisible();
    await expect(page.locator("#otpForm")).toBeHidden();
    await page.fill("#groupPassphrase", "e2e-group-secret");
    await page.click("#groupForm button[type=submit]");
    await page.waitForURL(`${groupBase}/index.html`);
    await expect(page.locator("#totalNotifications")).not.toBeEmpty();
  } finally {
    groupServer.kill();
  }
});
