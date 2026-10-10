// First look: THE BUFFALO WING — dealt from the void + vault grid.
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:4174/");
await page.waitForTimeout(900);

// seed the collection so BUF is the only missing mascot → the void must deal it
await page.evaluate(() => {
  const all = ["ARI","ATL","BAL","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LA","LAC","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];
  localStorage.setItem("rollout.void.v1", JSON.stringify({
    entries: all.map((abbr) => ({ kind: "mascot", id: abbr, name: abbr, archetype: "bird", foundAt: 1 })),
  }));
});
await page.reload();
await page.waitForTimeout(900);

// enable all three filters → scan → the void deals BUF
await page.evaluate(() => document.querySelector('[aria-label="Settings"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(250);
await page.evaluate(() => { for (const box of document.querySelectorAll(".pool-filters input")) if (!box.checked) box.closest("label").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
await page.evaluate(() => document.querySelector('[aria-label="Settings"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(200);
await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="scan-btn"]');
  const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
  btn.dispatchEvent(new PointerEvent("pointerdown", opts));
  setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
});
await page.waitForTimeout(4300); // through the sequence to the deal

const dealt = await page.evaluate(() => ({
  card: document.querySelector('[data-testid="void-card"]')?.textContent?.replace(/\s+/g, " ").trim().slice(0, 50) ?? null,
  img: document.querySelector('[data-testid="void-card"] img')?.getAttribute("src") ?? null,
  imgLoaded: (() => { const i = document.querySelector('[data-testid="void-card"] img'); return i ? i.complete && i.naturalWidth > 0 : false; })(),
}));
if (!dealt.img) {
  // 60% mascot chance lost the coin flip — try once more
  console.log("first deal was a ghost, retrying…");
  await page.evaluate(() => document.querySelector('[data-testid="void-stage"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="scan-btn"]');
    const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
    btn.dispatchEvent(new PointerEvent("pointerdown", opts));
    setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
  });
  await page.waitForTimeout(4300);
  Object.assign(dealt, await page.evaluate(() => ({
    card: document.querySelector('[data-testid="void-card"]')?.textContent?.replace(/\s+/g, " ").trim().slice(0, 50) ?? null,
    img: document.querySelector('[data-testid="void-card"] img')?.getAttribute("src") ?? null,
    imgLoaded: (() => { const i = document.querySelector('[data-testid="void-card"] img'); return i ? i.complete && i.naturalWidth > 0 : false; })(),
  })));
}
console.log(JSON.stringify({ dealt, errors: errors.slice(0, 3) }));
await page.screenshot({ path: "../rollout/buf-first-look.png" });
await browser.close();
