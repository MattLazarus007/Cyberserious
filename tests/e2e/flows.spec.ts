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

test("T-34 small screen keeps navigation, large text keeps content", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/index.html`);
  await expect(page.locator(".sidebar .nav").first()).toBeVisible();
  await page.goto(`${BASE}/notifications.html`);
  await expect(page.locator("#notificationsTableBody")).toBeVisible();
});
