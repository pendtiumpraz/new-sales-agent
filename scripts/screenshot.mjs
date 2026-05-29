// One-off visual pass — screenshots key routes against the dev server.
// Not committed; run via: node scripts/screenshot.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots");
mkdirSync(OUT, { recursive: true });

const shots = [
  { name: "01-landing", url: "/", fullPage: true },
  { name: "02-dashboard", url: "/dashboard" },
  { name: "03-inbox", url: "/inbox/cv_0001" },
  { name: "04-content", url: "/content" },
  { name: "05-content-calendar", url: "/content", click: "Kalender" },
  { name: "06-pipeline", url: "/pipeline" },
  { name: "07-compliance", url: "/settings/compliance", fullPage: true },
  { name: "08-mobile", url: "/m" },
  { name: "09-contacts", url: "/contacts" },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

// Wait for dev server to be ready
for (let i = 0; i < 40; i++) {
  try {
    const r = await page.goto(BASE + "/", { waitUntil: "load", timeout: 8000 });
    if (r && r.ok()) break;
  } catch {}
  await page.waitForTimeout(1500);
}

for (const s of shots) {
  try {
    await page.goto(BASE + s.url, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2500); // let mock latency + charts settle
    if (s.click) {
      await page.getByText(s.click, { exact: true }).first().click();
      await page.waitForTimeout(1200);
    }
    await page.screenshot({
      path: path.join(OUT, `${s.name}.png`),
      fullPage: !!s.fullPage,
    });
    console.log(`✓ ${s.name}  (${s.url}${s.click ? " → " + s.click : ""})`);
  } catch (e) {
    console.log(`✗ ${s.name}: ${e.message}`);
  }
}

await browser.close();
console.log("done");
