import { describe, expect, it } from "vitest";
import type { Card, Tier } from "@/data/schema";
import { ATOMIC_CHEEKS_MAX_RATING, CHEEKS_LINES, NEAR_MISS_MIN_RATING, ODDS, REEL_SIZE, TIER_RANK } from "./config";
import { poolVerdictRates } from "./luck";
import { filterPool, nextCheekStreak, planScan, stripMids, verdictOf } from "./draw";
import { loadSnapshot } from "@/data/snapshot";

const mk = (id: string, rating: number, position = "WR", name = id): Card => {
  const tier: Tier = rating >= 90 ? "legend" : rating >= 80 ? "elite" : rating >= 70 ? "rare" : "common";
  return {
    playerId: id, name, fullName: `Full ${id}`, position, team: "KC", jersey: 1, age: 25,
    heightIn: 74, weightLb: 200, college: "Test U", yearsPro: 3, rating, tier,
    attributes: [{ label: "SPD", value: 90 }], coreStats: { SPD: 80, ACC: 80, AGI: 80, STR: 80, JMP: 80, AWR: 80 }, xfactor: false, abilities: [], avatarSeed: id,
  };
};

describe("planScan", () => {
  const pool = [
    mk("a", 60), mk("b", 65), mk("c", 72), mk("d", 75), mk("e", 85), mk("f", 95),
    ...Array.from({ length: 10 }, (_, i) => mk(`g${i}`, 62 + i)),
  ];

  it("ends the reel on the winner", () => {
    for (let i = 0; i < 50; i++) {
      const plan = planScan(`seed-${i}`, pool);
      expect(plan.reel).toHaveLength(REEL_SIZE);
      expect(plan.reel.at(-1)!.name).toBe(plan.card.name);
    }
  });

  it("applies tier odds across many seeds", () => {
    const n = 4000;
    const counts: Record<Tier, number> = { common: 0, rare: 0, elite: 0, legend: 0 };
    for (let i = 0; i < n; i++) counts[planScan(`odds-${i}`, pool).tier]++;
    for (const t of ["common", "rare", "elite", "legend"] as Tier[]) {
      const pct = (counts[t] / n) * 100;
      expect(pct).toBeGreaterThan(ODDS[t] - 2.5);
      expect(pct).toBeLessThan(ODDS[t] + 2.5);
    }
  });

  it("never near-misses on elite+ and only with 97+ names", () => {
    const stars = [mk("star1", 98), mk("star2", 99)];
    const withStars = [...pool, ...stars];
    let sawNear = 0;
    for (let i = 0; i < 600; i++) {
      const plan = planScan(`nm-${i}`, withStars);
      if (plan.nearMiss) {
        sawNear++;
        expect(TIER_RANK[plan.tier]).toBeLessThan(TIER_RANK.elite);
        expect(plan.nearMiss.rating).toBeGreaterThanOrEqual(NEAR_MISS_MIN_RATING);
        expect(plan.reel.at(-2)!.name).toBe(plan.nearMiss.name);
        expect(plan.reel).toHaveLength(REEL_SIZE);
      }
    }
    expect(sawNear).toBeGreaterThan(0);
  });

  it("degrades tier when the filtered pool lacks it (ST has no 90+)", () => {
    const stPool = filterPool(loadSnapshot("m26").players, ["K", "P", "LS"]);
    const maxTier = Math.max(...stPool.map((c) => TIER_RANK[c.tier]));
    for (let i = 0; i < 200; i++) {
      const plan = planScan(`st-${i}`, stPool);
      expect(TIER_RANK[plan.tier]).toBeLessThanOrEqual(maxTier);
      expect(stPool).toContain(plan.card);
    }
  });
});

describe("NO MIDS", () => {
  it("strips exactly the verdict-free ratings (62 stays, 63 goes, 79 goes, 80 stays)", () => {
    const pool = [mk("a", 62), mk("b", 63), mk("c", 79), mk("d", 80), mk("e", 55), mk("f", 91)];
    const stripped = stripMids(pool);
    expect(stripped.map((c) => c.playerId).sort()).toEqual(["a", "d", "e", "f"]);
  });

  it("in a stripped pool every draw is a verdict and rates renormalize honestly", () => {
    const ps = stripMids(loadSnapshot("m26").players);
    // every remaining player is peak or cheeks
    expect(ps.every((c) => verdictOf(c) !== null)).toBe(true);
    const { pPeak, pCheeks } = poolVerdictRates(ps);
    expect(pPeak + pCheeks).toBeCloseTo(1, 6);
    expect(pPeak).toBeCloseTo(0.095, 2);   // house peak odds survive
    expect(pCheeks).toBeGreaterThan(0.85);  // cheeks flood
    for (let i = 0; i < 60; i++) {
      expect(verdictOf(planScan(`nm-${i}`, ps).card)).not.toBeNull();
    }
  });
});

describe("verdicts", () => {
  it("sits at the agreed thresholds", () => {
    expect(verdictOf(mk("p80", 80))).toBe("peak");
    expect(verdictOf(mk("p79", 79))).toBeNull();
    expect(verdictOf(mk("c62", 62))).toBe("cheeks");
    expect(verdictOf(mk("c63", 63))).toBeNull();
    expect(verdictOf(mk("a58", 58))).toBe("atomic");
    expect(verdictOf(mk("a57", 57))).toBe("atomic");
  });

  it("cheek streaks: extend on cheeks, break on peak, middles are forgettable", () => {
    expect(nextCheekStreak(2, "cheeks")).toBe(3);
    expect(nextCheekStreak(2, "atomic")).toBe(3);
    expect(nextCheekStreak(4, "peak")).toBe(0);
    expect(nextCheekStreak(4, null)).toBe(4);
    expect(nextCheekStreak(0, null)).toBe(0);
  });

  it("copy pools are stocked", () => {
    expect(CHEEKS_LINES.length).toBeGreaterThanOrEqual(6);
    expect(ATOMIC_CHEEKS_MAX_RATING).toBe(58);
  });
});

describe("filterPool", () => {
  it("filters by position group and passes ALL through", () => {
    const players = loadSnapshot("m26").players;
    const qbs = filterPool(players, ["QB"]);
    expect(qbs.length).toBeGreaterThan(50);
    expect(qbs.every((c) => c.position === "QB")).toBe(true);
    expect(filterPool(players, null)).toHaveLength(players.length);
  });
});
