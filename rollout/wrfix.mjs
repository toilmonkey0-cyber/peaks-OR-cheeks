// Live recreation of Aaron's exact scenario: WR chip + NO MIDS, 8 spins.
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:4174/");
await page.waitForTimeout(800);
// his exact state: WR group + NO MIDS
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("rollout.save.v1") ?? "{}");
  s.group = "WR";
  s.noMids = true;
  s.stats = { m26: { pulls: 0, bestId: null, bestRating: -1, pullLog: [], cheekStreak: 0, peaks: 0, cheeks: 0, peaksExp: 0, cheeksExp: 0, varP: 0, varC: 0 }, m27: { pulls: 0, bestId: null, bestRating: -1, pullLog: [], cheekStreak: 0, peaks: 0, cheeks: 0, peaksExp: 0, cheeksExp: 0, varP: 0, varC: 0 } };
  localStorage.setItem("rollout.save.v1", JSON.stringify(s));
});
await page.reload();
await page.waitForTimeout(900);

const results = [];
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="scan-btn"]');
    const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
    btn.dispatchEvent(new PointerEvent("pointerdown", opts));
    setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
  });
  await page.waitForTimeout(5400);
  results.push(await page.evaluate(() => {
    const card = document.querySelector(".ro-frame");
    return card ? card.textContent.replace(/\s+/g, " ").trim().slice(0, 48) : null;
  }));
}
const unique = new Set(results.filter(Boolean)).size;
console.log(JSON.stringify({ results, uniqueOf8: unique, topRepeat: Math.max(...Object.values(results.reduce((a, r) => { a[r] = (a[r] ?? 0) + 1; return a; }, {}))), errors }, null, 1));
await browser.close();
