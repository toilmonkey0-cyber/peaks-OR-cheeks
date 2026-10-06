import { beforeEach, describe, expect, it } from "vitest";
import type { Card } from "@/data/schema";
import { freshSave, loadSave, recordPull, writeSave } from "./storage";
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
    const save = { ...freshSave(), pulls: 7, bestId: "x", bestRating: 88, historyIds: ["x", "y"] };
    writeSave(save);
    expect(loadSave()).toEqual(save);
  });

  it("falls back to fresh on corrupt JSON", () => {
    localStorage.setItem("rollout.save.v1", "{not json");
    expect(loadSave()).toEqual(freshSave());
  });

  it("records pulls, tracks the best, dedupes and caps history", () => {
    let save = freshSave();
    for (let i = 0; i < HISTORY_MAX + 4; i++) {
      save = recordPull(save, card(`p${i}`, 60 + i)).save;
    }
    expect(save.pulls).toBe(HISTORY_MAX + 4);
    expect(save.bestRating).toBe(60 + HISTORY_MAX + 3);
    expect(save.bestId).toBe(`p${HISTORY_MAX + 3}`);
    expect(save.historyIds).toHaveLength(HISTORY_MAX);
    // re-pull an old card: moves to front, no duplicate
    save = recordPull(save, card("p0", 60)).save;
    expect(save.historyIds[0]).toBe("p0");
    expect(save.historyIds.filter((id) => id === "p0")).toHaveLength(1);
  });

  it("keeps the old best when a lower card is pulled", () => {
    let save = recordPull(freshSave(), card("hi", 95)).save;
    save = recordPull(save, card("lo", 61)).save;
    expect(save.bestId).toBe("hi");
    expect(save.bestRating).toBe(95);
  });
});
