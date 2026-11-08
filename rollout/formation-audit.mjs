// FORMATION layout audit: the screen must fit with zero page scroll and every chip inside the field,
// overlap-free, at Aaron's phone (320x624), a standard phone, and a portrait tablet.
// Run from rollout/ with the preview up on :4174:  node formation-audit.mjs
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const URL_ = process.env.FORMATION_URL ?? "http://localhost:4174/";
const STATIONS = [[320, 624, "his OnePlus 8T"], [390, 844, "phone"], [834, 1194, "tablet portrait"]];
const browser = await chromium.launch();
const results = [];
for (const [w, h, name] of STATIONS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(URL_);
  await page.evaluate(async () => { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister(); });
  await page.reload();
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-testid="formation-door"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const field = document.querySelector('[data-testid="fm-field"]').getBoundingClientRect();
    const chips = [...document.querySelectorAll(".fm-chip")].map((c) => c.getBoundingClientRect());
    let overlaps = 0;
    for (let a = 0; a < chips.length; a++) for (let b = a + 1; b < chips.length; b++) {
      const A = chips[a], B = chips[b];
      if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 1 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 1) overlaps++;
    }
    const outside = chips.filter((c) => c.left < field.left - 1 || c.right > field.right + 1 || c.top < field.top - 1 || c.bottom > field.bottom + 1).length;
    const hold = document.querySelector('[data-testid="hold-btn"]').getBoundingClientRect();
    return {
      scrollH: doc.scrollHeight, viewH: innerHeight, scrollW: doc.scrollWidth, viewW: innerWidth,
      chips: chips.length, overlaps, outside, fieldH: Math.round(field.height),
      holdVisible: hold.bottom <= innerHeight + 1 && hold.top >= 0, holdH: Math.round(hold.height),
    };
  });
  const pass = m.scrollH <= m.viewH && m.scrollW <= m.viewW && m.chips === 22 && m.overlaps === 0 && m.outside === 0 && m.holdVisible && errors.length === 0;
  results.push({ station: `${w}x${h} ${name}`, ...m, errors, pass });
  await ctx.close();
}
await browser.close();
for (const r of results) console.log(JSON.stringify(r));
const ok = results.every((r) => r.pass);
console.log(ok ? "FORMATION AUDIT: PASS" : "FORMATION AUDIT: FAIL");
process.exit(ok ? 0 : 1);
