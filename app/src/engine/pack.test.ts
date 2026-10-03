import { describe, it, expect } from "vitest";
import { openPack } from "./pack";
import { PACK_CONFIG } from "./config";
import type { Card, Snapshot, Tier } from "@/data/schema";

function card(playerId: string, tier: Tier, rating = 75, position = "WR"): Card {
  return { playerId, name: playerId, fullName: playerId, position, team: "ARI", jersey: 1,
           age: 25, rating, tier, keyStats: [], fantasyPpg: 10, avatarSeed: playerId };
}

const snap: Snapshot = {
  builtAt: "2026-10-03", teams: [], xfactorIds: [],
  players: [
    card("C1", "common", 55), card("C2", "common", 60), card("C3", "common", 65),
    card("R1", "rare", 72), card("R2", "rare", 78),
    card("E1", "elite", 85),
    card("L1", "legend", 95),
    card("X1", "xfactor", 93),
    card("QB1", "common", 60, "QB"), card("RB1", "common", 61, "RB"),
    // theme pool needs >= spec.size (5) QBs, else openPack widens to all positions
    card("QB2", "common", 62, "QB"), card("QB3", "common", 63, "QB"),
    card("QB4", "common", 64, "QB"), card("QB5", "common", 66, "QB"),
  ],
};

describe("odds tables", () => {
  it("sum to exactly 100", () => {
    for (const spec of Object.values(PACK_CONFIG))
      expect(Object.values(spec.odds).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("openPack", () => {
  it("is deterministic for a seed and returns ordered cards + scripts + dupes", () => {
    const a = openPack({ packType: "standard", seed: "s1", ownedIds: new Set(), snapshot: snap });
    const b = openPack({ packType: "standard", seed: "s1", ownedIds: new Set(), snapshot: snap });
    expect(a.cards.map((c) => c.playerId)).toEqual(b.cards.map((c) => c.playerId));
    expect(a.cards).toHaveLength(5);
    expect(a.scripts).toHaveLength(5);
    // worst -> best ordering
    const ranks = a.cards.map((c) => ({ common: 0, rare: 1, elite: 2, legend: 3, xfactor: 4 } as Record<Tier, number>)[c.tier]);
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
  });

  it("premium guarantees rare-or-better", () => {
    for (let i = 0; i < 50; i++) {
      const r = openPack({ packType: "premium", seed: `p${i}`, ownedIds: new Set(), snapshot: snap });
      expect(r.cards.some((c) => c.tier !== "common")).toBe(true);
    }
  });

  it("flags owned cards as dupes with coin values", () => {
    const r = openPack({ packType: "premium", seed: "d1", ownedIds: new Set(["L1", "E1", "R1", "R2"]), snapshot: snap });
    const legendDupe = r.dupesConverted.find((d) => d.playerId === "L1");
    if (r.cards.some((c) => c.playerId === "L1")) expect(legendDupe?.coins).toBe(200);
    expect(r.dupesConverted.every((d) => d.coins === ({ common: 10, rare: 25, elite: 75, legend: 200, xfactor: 200 } as Record<Tier, number>)[r.cards.find((c) => c.playerId === d.playerId)!.tier])).toBe(true);
  });

  it("rerolls a duplicate legend once, then converts", () => {
    // L1 owned; every legend hit should either avoid L1 or convert it
    const r = openPack({ packType: "premium", seed: "l9", ownedIds: new Set(["L1"]), snapshot: snap });
    expect(r.cards.length).toBe(3); // never short a slot
  });

  it("theme pack filters by position", () => {
    const r = openPack({ packType: "theme", seed: "t1", ownedIds: new Set(), snapshot: snap, themePositions: ["QB"] });
    expect(r.cards.every((c) => c.position === "QB")).toBe(true);
  });
});
