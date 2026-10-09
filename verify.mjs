// Tablet fit verifier: card placement + layout mode + page fit per station.
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const browser = await chromium.launch();
for (const [w, h] of [[768, 1024], [834, 1194], [1024, 768], [1194, 834]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4174/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="scan-btn"]');
    const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
    btn.dispatchEvent(new PointerEvent("pointerdown", opts));
    setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
  });
  await page.waitForTimeout(6000);
  const m = await page.evaluate(() => {
    const card = document.querySelector(".ro-frame");
    const side = document.querySelector(".side");
    const twoCol = getComputedStyle(document.querySelector(".stage-grid")).gridTemplateColumns.split(" ").length === 2;
    const sheet = getComputedStyle(side).position === "fixed";
    const c = card?.getBoundingClientRect();
    return {
      twoCol, sheet,
      card: c ? { w: Math.round(c.width), right: Math.round(c.right), insideVp: c.right <= innerWidth + 1 } : null,
      pageFits: document.documentElement.scrollHeight <= innerHeight + 1 || sheet,
      hOv: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  console.log(`${w}x${h}`, JSON.stringify(m));
  await ctx.close();
}
await browser.close();
