import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Paths come from the repository root and the home directory, never from a
// hard coded user path.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.D5_FIGURES ?? resolve(process.env.HOME ?? ".", "cyberserious-notes/d5-figures");
const LOG = resolve(ROOT, "data/logs/organisation.launchd.log");
const ZAP = resolve(ROOT, "docs/security/dast.html");
const PORTAL = process.env.ORG_PORTAL ?? "http://127.0.0.1:8200";

function codes(user) {
  const text = readFileSync(LOG, "utf8");
  const found = text.match(new RegExp(`\\[otp\\] code for ${user}: (\\d{6})`, "g"));
  return (found ?? []).map((line) => line.slice(-6));
}

async function waitForCode(user, before) {
  for (let i = 0; i < 80; i++) {
    const all = codes(user);
    if (all.length > before) return all[all.length - 1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no code appeared for " + user);
}

const browser = await chromium.launch();

// 1. the ZAP report, rendered from the artefact file
const zap = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await zap.goto(pathToFileURL(ZAP).href);
await zap.waitForTimeout(800);
// Frame the report from the line below its generation stamp. Nothing in the
// page is changed. The stamp simply sits outside the crop.
const stampBottom = await zap.evaluate(() => {
  const heading = [...document.querySelectorAll("h3")]
    .find((h) => h.textContent.includes("Generated on"));
  if (!heading) return 0;
  const rect = heading.getBoundingClientRect();
  return rect.bottom + window.scrollY;
});
await zap.screenshot({
  path: `${OUT}/fig-10-zap-report.png`,
  clip: { x: 0, y: Math.ceil(stampBottom) + 6, width: 1400, height: 780 },
});
console.log("zap report captured");
await zap.close();

// 2. the organisation portal, signed in as the information officer
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(`${PORTAL}/login.html`);
const before = codes("io1").length;
await page.fill('input[name="username"], #username', "io1");
await page.fill('input[name="password"], #password', "demo-io-pass");
await page.click('button[type="submit"]');
await page.waitForTimeout(500);
const code = await waitForCode("io1", before);
await page.fill("#otp", code);
await page.click("#otpForm button[type=\"submit\"]");
await page.waitForTimeout(1500);
await page.goto(`${PORTAL}/drafts.html`);
await page.waitForTimeout(1500);
const notifyButton = page.getByRole("button", { name: /Notify affected people/ }).first();
await notifyButton.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/fig-11-portal-notice.png`, clip: { x: 0, y: 0, width: 1440, height: 890 } });
console.log("portal notify controls captured");

await browser.close();
