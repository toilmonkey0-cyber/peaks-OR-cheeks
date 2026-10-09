// The Void easter egg end-to-end: all three filters on → scan → sequence.
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

// enable all three pool filters via the settings panel
await page.evaluate(() => document.querySelector('[aria-label="Settings"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(250);
const filterCount = await page.evaluate(() => document.querySelectorAll(".pool-filters input").length);
await page.evaluate(() => {
  for (const box of document.querySelectorAll(".pool-filters input")) {
    if (!box.checked) box.closest("label").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
});
await page.waitForTimeout(200);
const badge = await page.evaluate(() => document.querySelector('[data-testid="nomids-badge"]')?.textContent);
await page.evaluate(() => document.querySelector('[aria-label="Settings"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(200);

// scan into the void
await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="scan-btn"]');
  const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
  btn.dispatchEvent(new PointerEvent("pointerdown", opts));
  setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
});

const steps = [];
for (const [ms, want] of [[800, "tear"], [1600, "black"], [2300, "excluded"], [3000, "pity"], [3400, "pity"], [4200, "deal"]]) {
  await page.waitForTimeout(ms === 800 ? 800 : 700);
  const cls = await page.evaluate(() => document.querySelector('[data-testid="void-stage"]')?.className ?? null);
  steps.push(cls);
}
const dealt = await page.evaluate(() => ({
  card: document.querySelector('[data-testid="void-card"]')?.textContent?.replace(/\s+/g, " ").trim().slice(0, 60) ?? null,
  collection: JSON.parse(localStorage.getItem("rollout.void.v1") ?? "{}").entries?.length ?? 0,
}));
// tap to return
await page.evaluate(() => document.querySelector('[data-testid="void-stage"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(300);
const returned = await page.evaluate(() => !document.querySelector('[data-testid="void-stage"]'));
// vault shows the collection
await page.evaluate(() => document.querySelector('[data-testid="scoreline"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('[data-testid="vault-btn"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(400);
const vault = await page.evaluate(() => ({
  voidSection: !!document.querySelector(".sec-void"),
  slots: document.querySelectorAll(".void-slot-empty").length,
  cards: document.querySelectorAll(".sec-void [data-testid=void-card]").length,
}));
console.log(JSON.stringify({ filterCount, badge, steps, dealt, returned, vault, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
