// Responsive audit run from app/'s node_modules (real Playwright Chromium).
// node ../rollout/audit.mjs
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const viewports = [
  ["phone-sm", 360, 740], ["phone", 390, 844], ["phone-land", 844, 390],
  ["tablet-port", 834, 1194], ["tablet-land", 1194, 834], ["desktop", 1920, 1080],
];

const browser = await chromium.launch();
for (const [name, w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4174/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
    // find any element bleeding off the right edge
    const bleeders = [];
    for (const el of document.querySelectorAll(".scanner *")) {
      const b = el.getBoundingClientRect();
      if (b.width > 1 && b.right > innerWidth + 1 && !el.closest(".ticker")) {
        bleeders.push(`${el.tagName}.${(el.className || "").toString().split(" ")[0]} right=${Math.round(b.right)}`);
        if (bleeders.length >= 6) break;
      }
    }
    return {
      vw: innerWidth, vh: innerHeight,
      scrollW: de.scrollWidth, hOverflow: de.scrollWidth > innerWidth + 1,
      pageH: de.scrollHeight, vOverflow: de.scrollHeight > innerHeight + 1,
      topbar: r(".topbar"), scoreline: r(".scoreline"), focus: r(".focus-wrap"),
      scan: r(".scan-btn"), side: r(".side"), history: r(".history-rail"), chips: r(".chips"),
      bleeders,
    };
  });
  await page.screenshot({ path: `../rollout/audit-${name}.png` });
  const base = { name, ...m };
  if (name === "phone" || name === "phone-sm" || name === "tablet-port" || name === "phone-land") {
    // reproduce the bug report: several spins filling the history rail
    const spins = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="scan-btn"]');
        const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
        btn.dispatchEvent(new PointerEvent("pointerdown", opts));
        setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
      });
      await page.waitForTimeout(4300);
      spins.push(await page.evaluate(() => ({
        pageH: document.documentElement.scrollHeight,
        vOverflow: document.documentElement.scrollHeight > innerHeight + 1,
        historyN: document.querySelectorAll(".history-rail .ro-card").length,
        sheetOpen: document.querySelector(".side")?.classList.contains("open") ?? null,
        sheetTransform: getComputedStyle(document.querySelector(".side")).transform.slice(0, 24),
      })));
    }
    base.spins = spins;
    await page.screenshot({ path: `../rollout/audit-${name}-after.png` });
  }
  console.log(JSON.stringify(base));
  await ctx.close();
}
await browser.close();
