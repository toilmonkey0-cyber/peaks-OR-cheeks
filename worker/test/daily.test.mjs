// Zero-dependency test harness: node test/daily.test.mjs
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { publishDaily, dailySeed } from "../src/daily.ts";

const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url), "utf8"));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("deterministic: same day+version → byte-identical payload", () => {
  const a = JSON.stringify(publishDaily("2026-11-09", data.dataVersion, data));
  const b = JSON.stringify(publishDaily("2026-11-09", data.dataVersion, data));
  assert.equal(a, b);
});

test("a new day or roster version deals a different game", () => {
  const a = publishDaily("2026-11-09", data.dataVersion, data);
  const b = publishDaily("2026-11-10", data.dataVersion, data);
  const c = publishDaily("2026-11-09", "madden-ratings-week-7", data);
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(c));
});

test("four quarters, two different teams each, no team reused across the game", () => {
  const p = publishDaily("2026-11-09", data.dataVersion, data);
  assert.equal(p.quarters.length, 4);
  const seen = new Set();
  for (const q of p.quarters) {
    assert.notEqual(q.offense, q.defense);
    for (const t of [q.offense, q.defense]) assert.ok(!seen.has(t), `team reused: ${t}`);
    seen.add(q.offense); seen.add(q.defense);
  }
});

test("self-contained: every lineup carries 11 players with numbers, initials, colleges, stamps, team", () => {
  const p = publishDaily("2026-11-09", data.dataVersion, data);
  for (const q of p.quarters) {
    for (const side of ["off", "def"]) {
      const l = q.lineups[side];
      assert.equal(l.length, 11);
      for (const pl of l) {
        assert.ok(Number.isInteger(pl.jersey) && pl.jersey >= 0);
        assert.match(pl.ini, /^([A-Z]\.)+$/); // one or more initial groups (hyphenated/compound names)
        assert.ok(pl.college.length > 0);
        assert.ok(["P", "M", "C"].includes(pl.stamp));
        assert.ok(["common", "skill", "jack"].includes(pl.cls));
        assert.equal(pl.team, side === "off" ? q.offense : q.defense);
      }
    }
  }
});

test("the seed is the phase-B formula (clients can verify)", () => {
  assert.equal(dailySeed("2026-11-09", "v1"), "fm-daily:2026-11-09:v1");
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log("✓", name); } catch (e) { failed++; console.error("×", name, "\n ", e.message); }
}
console.log(failed === 0 ? `DAILY TESTS: PASS (${tests.length})` : `DAILY TESTS: FAIL (${failed}/${tests.length})`);
process.exit(failed === 0 ? 0 : 1);
