// Spin-blankness probe: N scans, pixel-sample the focus canvas mid-spin,
// collect page errors + console noise. Run: node ../rollout/probe.mjs
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const N = 20;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") pageErrors.push(`console.error: ${m.text()}`); });

await page.goto("http://localhost:4174/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(900);

const fire = () => page.evaluate(() => {
  const btn = document.querySelector('[data-testid="scan-btn"]');
  const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
  btn.dispatchEvent(new PointerEvent("pointerdown", opts));
  setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
});

const sample = (label) => page.evaluate((label) => {
  const c = document.querySelector(".focus");
  if (!c) return { label, noCanvas: true };
  const g = c.getContext("2d");
  const img = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < img.length; i += 40) if (img[i] > 8) lit++;
  const total = Math.floor(img.length / 40);
  return {
    label,
    phase: document.querySelector(".scanner")?.className.match(/phase-\w+/)?.[0],
    canvas: { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight },
    litRatio: +(lit / total).toFixed(4),
  };
}, label);

const results = [];
for (let i = 0; i < N; i++) {
  await fire();
  await page.waitForTimeout(400);
  const s1 = await sample("t=400ms");
  await page.waitForTimeout(1100);
  const s2 = await sample("t=1500ms");
  await page.waitForTimeout(1000);
  const s3 = await sample("t=2500ms");
  await page.waitForTimeout(2600); // let the scan settle (incl. celebration)
  results.push({ scan: i + 1, samples: [s1, s2, s3] });
  const blank = [s1, s2, s3].filter((s) => !s.noCanvas && s.litRatio < 0.004).map((s) => s.label);
  if (blank.length) console.log(`scan ${i + 1}: BLANK at ${blank.join(",")} | ${JSON.stringify([s1, s2, s3])}`);
}
const blankScans = results.filter((r) => r.samples.some((s) => !s.noCanvas && s.litRatio < 0.004)).length;
console.log(JSON.stringify({ totalScans: N, blankScans, pageErrors: pageErrors.slice(0, 8) }, null, 1));
await browser.close();
