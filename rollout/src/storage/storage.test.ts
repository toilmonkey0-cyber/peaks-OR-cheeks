import { beforeEach, describe, expect, it } from "vitest";
import type { Card } from "@/data/schema";
import { freshSave, freshStats, loadSave, recordPull, writeSave } from "./storage";
import { HISTORY_MAX } from "@/engine/config";

const card = (id: string, rating: number): Card => ({
  playerId: id, name: id, fullName: id, position: "WR", team: "KC", jersey: 1, age: 25,
  heightIn: 74, weightLb: 200, college: "", yearsPro: 3, rating,
  tier: rating >= 90 ? "legend" : rating >= 80 ? "elite" : rating >= 70 ? "rare" : "common",
  attributes: [], xfactor: false, abilities: [], avatarSeed: id,
});

beforeEach(() => localStorage.clear());

describe("storage", () => {
  it("round-trips a save", () => {
    const save = { ...freshSave(), soundOn: false, group: "QB" };
    save.stats.m26.pulls = 3;
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
    expect(save.stats.m26).toEqual({ pulls: 5, bestId: "x", bestRating: 91, historyIds: ["x", "y"], cheekStreak: 0, peaks: 0, cheeks: 0 });
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

  it("records pulls, tracks the best, dedupes and caps history", () => {
    let save = freshSave();
    for (let i = 0; i < HISTORY_MAX + 4; i++) {
      save = recordPull(save, card(`p${i}`, 60 + i), i % 4 === 0 ? "cheeks" : null).save;
    }
    expect(save.stats.m26.pulls).toBe(HISTORY_MAX + 4);
    expect(save.stats.m26.bestRating).toBe(60 + HISTORY_MAX + 3);
    expect(save.stats.m26.bestId).toBe(`p${HISTORY_MAX + 3}`);
    expect(save.stats.m26.historyIds).toHaveLength(HISTORY_MAX);
    // re-pull an old card: moves to front, no duplicate
    save = recordPull(save, card("p0", 60), "cheeks").save;
    expect(save.stats.m26.historyIds[0]).toBe("p0");
    expect(save.stats.m26.historyIds.filter((id) => id === "p0")).toHaveLength(1);
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
