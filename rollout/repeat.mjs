// Repeat-player probe: spin N times per scenario, record result identities.
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const spin = () => page.evaluate(() => {
  const btn = document.querySelector('[data-testid="scan-btn"]');
  const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
  btn.dispatchEvent(new PointerEvent("pointerdown", opts));
  setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
});

const setSave = (patch) => page.evaluate((patch) => {
  const s = JSON.parse(localStorage.getItem("rollout.save.v1") ?? "{}");
  Object.assign(s, patch);
  localStorage.setItem("rollout.save.v1", JSON.stringify(s));
}, patch);

async function scenario(label, n) {
  await page.reload();
  await page.waitForTimeout(900);
  const results = [];
  for (let i = 0; i < n; i++) {
    await spin();
    await page.waitForTimeout(4800);
    results.push(await page.evaluate(() => {
      const f = document.querySelector(".ro-frame");
      const s = JSON.parse(localStorage.getItem("rollout.save.v1") ?? "{}");
      return {
        text: f?.textContent?.replace(/\s+/g, " ").trim().slice(0, 48) ?? null,
        lastLog: s.stats?.[s.source ?? "m26"]?.pullLog?.[0] ?? null,
      };
    }));
  }
  const ids = results.map((r) => r.lastLog);
  const distinct = new Set(ids).size;
  console.log(`${label}: ${n} spins → ${distinct} distinct players`);
  console.log("  ", ids.join(", "));
  return { label, ids, distinct };
}

await page.goto("http://localhost:4174/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);
await setSave({ source: "m26", noMids: false, group: "ALL" });
await scenario("default (m26, ALL)", 10);
await setSave({ noMids: true });
await scenario("NO MIDS (m26, ALL)", 10);
await setSave({ noMids: false, source: "m27" });
await scenario("m27 default", 10);
console.log(JSON.stringify({ errors: errors.slice(0, 5) }));
await browser.close();
