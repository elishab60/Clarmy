// Playwright visual check of the live office. Usage:
//   node scripts/pw-office-shot.mjs [outPath] [waitMs]
import { chromium } from "@playwright/test";

const out = process.argv[2] || "tmp/pw-office.png";
const waitMs = Number(process.argv[3] || 5000);
const url = process.env.OFFICE_URL || "http://127.0.0.1:3010/office";

const browser = await chromium.launch();
const dpr = Number(process.env.OFFICE_DPR || 2);
const page = await browser.newPage({ viewport: { width: 1680, height: 1020 }, deviceScaleFactor: dpr });
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector("canvas", { timeout: 20000 }).catch(() => console.log("no canvas selector"));
await page.waitForTimeout(waitMs); // Phaser boot + WS sessions + sprite load

// Report which agents are on screen (from the bridge the canvas sets).
const ids = await page.evaluate(() => (window.__officeSessionIds ?? [])).catch(() => []);
console.log("sessions on screen:", Array.isArray(ids) ? ids.length : 0);

await page.screenshot({ path: out });
await browser.close();
console.log("shot ->", out);
