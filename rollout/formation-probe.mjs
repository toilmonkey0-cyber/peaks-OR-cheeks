// FORMATION end-to-end probe: through the door, real pulls (incl. face-down PEAKs), both call
// ceremonies, four quarters to the FINAL line. Asserts zero page errors. Run from rollout/ with the
// preview up on :4174:  node formation-probe.mjs
import { createRequire } from "node:module";
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const URL_ = process.env.FORMATION_URL ?? "http://localhost:4174/";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 320, height: 624 }, hasTouch: true, reducedMotion: "no-preference" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// fresh device: clear any old FORMATION save, unregister the service worker so we test THIS build
await page.goto(URL_);
await page.evaluate(async () => {
  localStorage.removeItem("rollout.formation.v1");
  for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
});
await page.reload();
await page.waitForTimeout(700);

const click = (sel) => page.evaluate((s) => document.querySelector(s)?.dispatchEvent(new MouseEvent("click", { bubbles: true })), sel);
const state = () => page.evaluate(() => ({
  q: document.querySelector(".fm-q")?.textContent,
  downs: document.querySelectorAll('[data-testid="down-pip"][data-on="true"]').length,
  lit: document.querySelectorAll(".fm-chip.lit").length,
  fd: document.querySelectorAll(".fm-chip.fd").length,
  spins: document.querySelector(".fm-stat")?.textContent,
  over: document.querySelector(".fm-sheet.over .fm-sh-head span")?.textContent ?? null,
  holdDisabled: document.querySelector('[data-testid="hold-btn"]')?.disabled,
}));
const settled = () => page.waitForFunction(() => {
  const card = document.querySelector('[data-testid="deck-card"]');
  return card && card.classList.contains("idle") && getComputedStyle(card).opacity === "1";
}, null, { timeout: 15000 });
/** A real hold: pointer down on HOLD, wait, release on the window. */
async function pull(holdMs) {
  const box = await (await page.$('[data-testid="hold-btn"]')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await page.waitForTimeout(120);
  await settled();
}
const callReady = (side) => page.waitForFunction((s) => {
  const b = document.querySelector(`[aria-label="CALL the ${s}"]`);
  return !b || !b.disabled;
}, side, { timeout: 8000 });
/** Teams guaranteed NOT to be either answer (read from the save) and not already crossed out. */
async function wrongTeams(n) {
  const g = await page.evaluate(() => JSON.parse(localStorage.getItem("rollout.formation.v1")).inProgress);
  const skip = new Set([g.sides[0].team, g.sides[1].team, ...g.sides[0].out, ...g.sides[1].out]);
  const ALL = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND","JAX","KC","LA","LAC","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];
  return ALL.filter((t) => !skip.has(t)).slice(0, n);
}
async function callTeam(side, abbr) {
  await callReady(side);
  await click(`[aria-label="CALL the ${side}"]`);
  await page.waitForTimeout(150);
  await click(`[data-testid="pick-${abbr}"]`);
}

const report = {};
await click('[data-testid="formation-door"]');
await page.waitForTimeout(400);
report.entered = (await state()).q === "Q1";

// pulls: one short, one full charge, then hunt a face-down PEAK and play it
await pull(250);
await pull(1700);
report.afterTwoPulls = await state();
let fdPlayed = false;
for (let i = 0; i < 25 && !fdPlayed; i++) {
  const fd = await page.$(".fm-chip.fd");
  if (fd) {
    await fd.click();
    await page.waitForTimeout(200);
    await page.evaluate(() => [...document.querySelectorAll(".fm-opt")].find((b) => b.textContent.includes("PLAY IT"))?.click());
    fdPlayed = true;
    break;
  }
  await pull(400);
}
report.fdPlayed = fdPlayed;

// a wrong call (the flat "no."), then read the answer off a turnover and verify the ceremony path
const flatSeen = await (async () => {
  await callTeam("offense", (await wrongTeams(1))[0]);
  return page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="stamp-"]')].some((s) => s.classList.contains("flat") && s.classList.contains("go")), null, { timeout: 4000 }).then(() => true, () => false);
})();
report.flatNoSeen = flatSeen;

// burn the remaining downs on defense so the quarter ends and the answers show
for (const t of await wrongTeams(3)) {
  const s = await state();
  if (s.over) break;
  await callTeam("defense", t);
  await page.waitForTimeout(300);
}
await page.waitForFunction(() => document.querySelector(".fm-sheet.over"), null, { timeout: 8000 });
report.q1 = await state();

// quarters 2-4: one pull each, then turnovers (fast path to the FINAL line)
for (let q = 2; q <= 4; q++) {
  await click(".fm-primary");
  await page.waitForTimeout(300);
  await pull(300);
  for (const t of await wrongTeams(4)) {
    const s = await state();
    if (s.over) break;
    await callTeam("offense", t);
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => document.querySelector(".fm-sheet.over"), null, { timeout: 8000 });
}
report.finalLine = await page.evaluate(() => document.querySelector(".fm-final")?.textContent ?? null);
await click(".fm-primary"); // NEW GAME
await page.waitForTimeout(300);
report.newGame = await state();

// the spectacle, in a real browser at full motion: read this quarter's answers from the save, call both right
await pull(300);
const answers = await page.evaluate(() => JSON.parse(localStorage.getItem("rollout.formation.v1")).inProgress.sides.map((s) => s.team));
await callTeam("offense", answers[0]);
report.confirmedSeen = await page.waitForFunction(() => [...document.querySelectorAll('[data-testid^="stamp-"]')].some((s) => s.classList.contains("confirmed") && s.classList.contains("go")), null, { timeout: 4000 }).then(() => true, () => false);
report.waveSeen = await page.waitForFunction(() => document.querySelectorAll(".fm-chip.wave").length >= 6, null, { timeout: 4000 }).then(() => true, () => false);
await callTeam("defense", answers[1]);
await page.waitForFunction(() => document.querySelector(".fm-sheet.over"), null, { timeout: 8000 });
report.solvedSheet = (await state()).over;
report.errors = errors;
await browser.close();

console.log(JSON.stringify(report, null, 1));
const ok = report.entered && report.afterTwoPulls.lit + report.afterTwoPulls.fd >= 2 && report.flatNoSeen &&
  report.q1.over && report.finalLine?.startsWith("FINAL:") && report.newGame.q === "Q1" &&
  report.confirmedSeen && report.waveSeen && /PEAK QUARTER|Q1 FINAL/.test(report.solvedSheet ?? "") && errors.length === 0;
console.log(ok ? "FORMATION PROBE: PASS" : "FORMATION PROBE: FAIL");
process.exit(ok ? 0 : 1);
