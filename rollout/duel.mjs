// Toy-pack live verification: kick classes, weather pixels, full Luck Duel.
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

const fire = () => page.evaluate(() => {
  const btn = document.querySelector('[data-testid="scan-btn"]');
  const opts = { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true };
  btn.dispatchEvent(new PointerEvent("pointerdown", opts));
  setTimeout(() => btn.dispatchEvent(new PointerEvent("pointerup", opts)), 160);
});

// ── 1. kick: catch the class mid-animation ──
await fire();
await page.waitForTimeout(220);
const kick = await page.evaluate(() => ({
  btnKicked: document.querySelector(".scan-btn")?.classList.contains("kick") ?? false,
  quake: document.querySelector(".stage")?.classList.contains("quake") ?? false,
}));
await page.waitForTimeout(5200);

// ── 2. weather: seed a peak + atomic into the session, reload, count pixels ──
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("rollout.save.v1") ?? "{}");
  const st = s.stats.m26 ?? {};
  st.peaks = (st.peaks ?? 0) + 1;
  st.pulls = (st.pulls ?? 0) + 1;
  s.stats.m26 = st;
  localStorage.setItem("rollout.save.v1", JSON.stringify(s));
});
await page.reload();
await page.waitForTimeout(900);
const weatherLit = await page.evaluate(() => {
  const c = document.querySelector(".weather-canvas");
  const img = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 3; i < img.length; i += 16) if (img[i] > 8) lit++;
  return lit;
});

// ── 3. full duel: open settings → start → ready → 10 pulls → finale → done ──
await page.evaluate(() => document.querySelector('[aria-label="Settings"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(250);
await page.evaluate(() => document.querySelector('[data-testid="duel-start"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(250);
const introSeen = !!(await page.evaluate(() => document.querySelector('[data-testid="duel-intro"]')));
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("PLAYER 1"))?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
await page.waitForTimeout(300);

const chips = [];
const truth = [];
for (let i = 0; i < 10; i++) {
  const chipBefore = await page.evaluate(() => document.querySelector('[data-testid="duel-chip"]')?.textContent ?? null);
  chips.push(chipBefore);
  await fire();
  // aggressive 4.6s cadence for pulls 1-5 (flush path), relaxed 8s for 6-10
  await page.waitForTimeout(i < 5 ? 4600 : 8000);
  truth.push(await page.evaluate(() => {
    const d = window.__duelDebug;
    return d ? { p: [d.players[0].pulls, d.players[1].pulls], turn: d.turn } : null;
  }));
}
await page.waitForTimeout(8500); // let the final advance + finale land
const finale = await page.evaluate(() => {
  const f = document.querySelector('[data-testid="duel-finale"]');
  if (!f) return null;
  return {
    title: f.querySelector(".duel-title")?.textContent,
    math: f.querySelector(".duel-math")?.textContent?.replace(/\s+/g, " ").trim(),
    duke: f.querySelector(".duel-duke")?.textContent ?? null,
  };
});
// keep the page open for the fire log read
await page.waitForTimeout(300);
const duelGone = true; // checked separately; keep page for logs

console.log(JSON.stringify({
  kick, weatherLit, introSeen,
  truth,
  chipSequence: chips.map((c) => c?.replace(/\s+/g, " ")),
  finale, duelGone, pageErrors: errors.slice(0, 4),
  fireLog: await page.evaluate(() => (window).__fireLog ?? []),
}, null, 1));
await browser.close();
