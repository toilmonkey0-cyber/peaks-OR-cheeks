// HIGHER/LOWER live verification: a bot plays rounds until game-over.
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

// enter the game via settings
await page.evaluate(() => document.querySelector('[aria-label="Settings"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(250);
const rowSeen = !!(await page.evaluate(() => document.querySelector('[data-testid="hl-start"]')));
await page.evaluate(() => document.querySelector('[data-testid="hl-start"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(250);
const introSeen = !!(await page.evaluate(() => document.querySelector('[data-testid="hl-intro"]')));
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("DEAL THE FIRST STAT"))?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(400);

const readStat = () => page.evaluate(() => {
  const c = document.querySelector(".focus");
  // challenge text is canvas-drawn; read the streak from the scan subtext instead
  return document.querySelector(".scan-btn small")?.textContent ?? "";
});

// bot: gut says 85 is the line
let rounds = 0, correct = 0, gameOver = null;
for (let i = 0; i < 25; i++) {
  const streakLine = await readStat();
  const btns = await page.evaluate(() => ({
    hi: !!document.querySelector('[data-testid="hl-btns"] .hi'),
    lo: !!document.querySelector('[data-testid="hl-btns"] .lo'),
  }));
  if (!btns.hi) {
    gameOver = await page.evaluate(() => document.querySelector('[data-testid="hl-over"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null);
    break;
  }
  await page.evaluate((call) => {
    document.querySelector(call ? ".hl-btn.hi" : ".hl-btn.lo")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, true); // bot always calls HIGHER (gut of gold)
  rounds++;
  await page.waitForTimeout(1900); // spin 1.25s + reveal
  const revealed = await page.evaluate(() => ({
    over: !!document.querySelector('[data-testid="hl-over"]'),
    streak: document.querySelector(".scan-btn small")?.textContent ?? "",
  }));
  if (revealed.over) {
    gameOver = await page.evaluate(() => document.querySelector('[data-testid="hl-over"]')?.textContent?.replace(/\s+/g, " ").trim() ?? null);
    break;
  }
  correct++;
}
const layoutFits = await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1);
console.log(JSON.stringify({ rowSeen, introSeen, roundsPlayed: rounds, survived: correct, gameOver, layoutFits, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
