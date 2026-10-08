// Sample fresh celebration taglines in NO MIDS mode.
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
await page.goto("http://localhost:4174/");
await page.waitForTimeout(800);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("rollout.save.v1") ?? "{}");
  s.noMids = true;
  localStorage.setItem("rollout.save.v1", JSON.stringify(s));
});
await page.reload();
await page.waitForTimeout(800);
const lines = [];
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="scan-btn"]');
    const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
    btn.dispatchEvent(new PointerEvent("pointerdown", opts));
    setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
  });
  await page.waitForTimeout(5300);
  lines.push(await page.evaluate(() => {
    const c = document.querySelector('[data-testid="celebration"]');
    return c ? c.querySelector(".cline")?.textContent : "(cleared before sample)";
  }));
}
console.log(JSON.stringify(lines, null, 1));
await browser.close();
