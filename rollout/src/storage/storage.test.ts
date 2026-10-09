import { beforeEach, describe, expect, it } from "vitest";
import type { Card } from "@/data/schema";
import { freshSave, freshStats, loadSave, recordPull, writeSave } from "./storage";
import { PULL_LOG_MAX } from "@/engine/config";

const card = (id: string, rating: number): Card => ({
  playerId: id, name: id, fullName: id, position: "WR", team: "KC", jersey: 1, age: 25,
  heightIn: 74, weightLb: 200, college: "", yearsPro: 3, rating,
  tier: rating >= 90 ? "legend" : rating >= 80 ? "elite" : rating >= 70 ? "rare" : "common",
  attributes: [], coreStats: { SPD: 80, ACC: 80, AGI: 80, STR: 80, JMP: 80, AWR: 80 }, xfactor: false, abilities: [], avatarSeed: id,
});

beforeEach(() => localStorage.clear());

describe("storage", () => {
  it("round-trips a luck-era save", () => {
    const save = { ...freshSave(), soundOn: false, group: "QB" };
    save.stats.m26 = { ...freshStats(), pulls: 3, peaksExp: 0.285, cheeksExp: 0.27, varP: 0.258, varC: 0.246 };
    writeSave(save);
    expect(loadSave()).toEqual(save);
  });

  it("falls back to fresh on corrupt JSON", () => {
    localStorage.setItem("rollout.save.v1", "{not json");
    expect(loadSave()).toEqual(freshSave());
  });

  it("migrates pre-toggle saves (top-level pulls/best/history → m26)", () => {
    localStorage.setItem("rollout.save.v1", JSON.stringify({
      pulls: 5, bestId: "x", bestRating: 91, historyIds: ["x", "y"],
      soundOn: true, hapticsOn: false, crowdOn: true, group: "WR",
    }));
    const save = loadSave();
    expect(save.source).toBe("m26");
    // luck backfill: pre-meter pulls get the ALL-pool approximation of fate's tab
    expect(save.stats.m26.pulls).toBe(5);
    expect(save.stats.m26.pullLog).toEqual(["x", "y"]);
    expect(save.stats.m26.peaks).toBe(0);
    expect(save.stats.m26.cheeks).toBe(0);
    expect(save.stats.m26.peaksExp).toBeCloseTo(0.475, 8);
    expect(save.stats.m26.cheeksExp).toBeCloseTo(0.45, 8);
    expect(save.stats.m26.varP).toBeCloseTo(5 * 0.095 * 0.905, 8);
    expect(save.stats.m26.varC).toBeCloseTo(5 * 0.09 * 0.91, 8);
    expect(save.stats.m27).toEqual(freshStats());
    expect(save.stats.m26.cheekStreak).toBe(0);
    expect(save.hapticsOn).toBe(false);
    expect(save.group).toBe("WR");
  });

  it("keeps per-source stats isolated", () => {
    let save = freshSave();
    save = recordPull(save, card("a26", 88), "peak").save;                 // m26
    save = recordPull({ ...save, source: "m27" }, card("a27", 75), "cheeks").save; // m27
    expect(save.stats.m26).toMatchObject({ pulls: 1, bestId: "a26", bestRating: 88 });
    expect(save.stats.m27).toMatchObject({ pulls: 1, bestId: "a27", bestRating: 75, cheekStreak: 1, peaks: 0, cheeks: 1 });
  });

  it("records one log entry per pull (duplicates kept) and caps the log", () => {
    let save = freshSave();
    for (let i = 0; i < PULL_LOG_MAX + 4; i++) {
      save = recordPull(save, card(`p${i % 10}`, 60 + i), i % 4 === 0 ? "cheeks" : null).save;
    }
    expect(save.stats.m26.pulls).toBe(PULL_LOG_MAX + 4);
    expect(save.stats.m26.pullLog).toHaveLength(PULL_LOG_MAX);
    expect(save.stats.m26.pullLog[0]).toBe("p3"); // newest first (i=63 → 63%10)
    // duplicates preserved: ten distinct ids across 64 pulls
    expect(new Set(save.stats.m26.pullLog).size).toBe(10);
  });

  it("counts peaks and cheeks, and returns the streak", () => {
    let save = freshSave();
    const r1 = recordPull(save, card("a", 85), "peak");
    save = r1.save;
    expect(r1.streak).toBe(0);
    expect(save.stats.m26).toMatchObject({ peaks: 1, cheeks: 0 });
    save = recordPull(save, card("b", 60), "cheeks").save;
    save = recordPull(save, card("c", 55), "atomic").save;
    save = recordPull(save, card("d", 75), null).save;   // middle: counts neither
    expect(save.stats.m26).toMatchObject({ peaks: 1, cheeks: 2, cheekStreak: 2, pulls: 4 });
  });

  it("keeps the old best when a lower card is pulled", () => {
    let save = recordPull(freshSave(), card("hi", 95), "peak").save;
    save = recordPull(save, card("lo", 61), "cheeks").save;
    expect(save.stats.m26.bestId).toBe("hi");
    expect(save.stats.m26.bestRating).toBe(95);
  });
});
