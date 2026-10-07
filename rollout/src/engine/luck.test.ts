import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { freshStats } from "@/storage/storage";
import { luckIndex, luckTitle, MIN_LUCK_PULLS, poolVerdictRates } from "./luck";
import { filterPool } from "./draw";

const stats = (over: Partial<ReturnType<typeof freshStats>> = {}) => ({ ...freshStats(), ...over });

describe("poolVerdictRates", () => {
  it("matches the house rates on the full pool", () => {
    const { pPeak, pCheeks } = poolVerdictRates(loadSnapshot("m26").players);
    expect(pPeak).toBeGreaterThan(0.08);
    expect(pPeak).toBeLessThan(0.11);
    expect(pCheeks).toBeGreaterThan(0.07);
    expect(pCheeks).toBeLessThan(0.11);
  });

  it("is filter-aware where it can be (cheeks cuts across tiers)", () => {
    const st = filterPool(loadSnapshot("m26").players, ["K", "P", "LS"]);
    const all = poolVerdictRates(loadSnapshot("m26").players);
    const { pPeak, pCheeks } = poolVerdictRates(st);
    // peak = P(elite∪legend) = 9.5% for ANY pool that has elites (80 IS the elite line)
    expect(pPeak).toBeCloseTo(0.095, 6);
    expect(pCheeks).not.toBeCloseTo(all.pCheeks, 4); // specialist pool cheeks rate genuinely differs
    expect(pPeak + pCheeks).toBeLessThan(1);
  });
});

describe("luckIndex", () => {
  const base = { peaksExp: 9.5, cheeksExp: 9, varP: 8.6, varC: 8.2 }; // ≈ 100 ALL-pool pulls

  it("refuses to judge small samples", () => {
    expect(luckIndex(stats({ pulls: 19, peaks: 0, cheeks: 5 })).L).toBeNull();
  });

  it("reads blessed when peaks beat fate and cheeks behave", () => {
    const r = luckIndex(stats({ pulls: 100, peaks: 18, cheeks: 9, ...base }));
    expect(r.L).not.toBeNull();
    expect(r.L!).toBeGreaterThan(1.5);
  });

  it("reads cursed when cheeks pile up", () => {
    const r = luckIndex(stats({ pulls: 100, peaks: 9, cheeks: 19, ...base }));
    expect(r.L!).toBeLessThan(-1);
  });

  it("clamps to ±3", () => {
    const r = luckIndex(stats({ pulls: 100, peaks: 40, cheeks: 0, ...base }));
    expect(r.L).toBe(3);
  });

  it("sits near zero when fate delivered exactly", () => {
    const r = luckIndex(stats({ pulls: 100, peaks: 10, cheeks: 9, ...base }));
    expect(Math.abs(r.L!)).toBeLessThan(0.5);
  });
});

describe("luckTitle ladder", () => {
  it("gates on evidence, then escalates", () => {
    expect(luckTitle(null, 7)).toContain("GATHERING");
    expect(luckTitle(2.8, 100)).toBe("CERTIFIED HIM");
    expect(luckTitle(1.7, 100)).toBe("COOKING");
    expect(luckTitle(0.9, 100)).toBe("LOWKEY BLESSED");
    expect(luckTitle(0, 100)).toBe("MID");
    expect(luckTitle(-1.0, 100)).toBe("DOGWATER FORTUNE");
    expect(luckTitle(-2.0, 100)).toBe("COOKED");
    expect(luckTitle(-3, 100)).toBe("SCIENTIFICALLY COOKED");
  });

  it("evidence gate line shows the threshold", () => {
    expect(luckTitle(null, 3)).toContain(`${MIN_LUCK_PULLS}`);
  });
});
