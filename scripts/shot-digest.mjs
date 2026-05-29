import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const prev = join(here, "..", "previews");
const browser = await chromium.launch();
for (const name of ["daily-digest", "daily-digest-empty"]) {
  const page = await browser.newPage({ viewport: { width: 680, height: 900 }, deviceScaleFactor: 2 });
  await page.goto("file://" + join(prev, `${name}.html`));
  await page.screenshot({ path: join(prev, `${name}.png`), fullPage: true });
  console.log("shot", name);
  await page.close();
}
await browser.close();
