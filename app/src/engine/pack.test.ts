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

  it("flags every drawn card as a dupe at its exact tier value when all are owned", () => {
    const values: Record<Tier, number> = { common: 10, rare: 25, elite: 75, legend: 200, xfactor: 200 };
    const owned = new Set(snap.players.map((p) => p.playerId));
    for (let i = 0; i < 50; i++) {
      const r = openPack({ packType: i % 2 ? "standard" : "premium", seed: `dv-${i}`, ownedIds: owned, snapshot: snap });
      expect(r.dupesConverted).toHaveLength(r.cards.length); // unconditional: every drawn card is owned
      for (const d of r.dupesConverted) {
        const drawn = r.cards.find((c) => c.playerId === d.playerId)!;
        expect(d.coins).toBe(values[drawn.tier]);
      }
    }
  });

  it("never repeats a player within a pack (200 seeds)", () => {
    for (let i = 0; i < 200; i++) {
      const std = openPack({ packType: "standard", seed: `nd-${i}`, ownedIds: new Set(), snapshot: snap });
      const prem = openPack({ packType: "premium", seed: `nd-${i}`, ownedIds: new Set(), snapshot: snap });
      const theme = openPack({ packType: "theme", seed: `nd-${i}`, ownedIds: new Set(), snapshot: snap, themePositions: ["QB"] });
      expect(std.cards).toHaveLength(5);
      expect(prem.cards).toHaveLength(3);
      expect(theme.cards).toHaveLength(5);
      for (const r of [std, prem, theme]) {
        const ids = r.cards.map((c) => c.playerId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("theme pack filters by position", () => {
    const r = openPack({ packType: "theme", seed: "t1", ownedIds: new Set(), snapshot: snap, themePositions: ["QB"] });
    expect(r.cards.every((c) => c.position === "QB")).toBe(true);
  });
});

describe("legend/xfactor dupe handling (all-big pools make big hits certain)", () => {
  const bigSnap = (ids: string[], tier: Tier): Snapshot => ({
    builtAt: "2026-10-03", teams: [], xfactorIds: tier === "xfactor" ? ids : [],
    players: ids.map((id, i) => card(id, tier, 90 + i)),
  });

  it("rerolls an owned legend whenever a non-owned legend is unpicked", () => {
    // 6 legends, only L1 owned, packs of 5/3: a non-owned legend is ALWAYS available
    // to reroll to, so the owned one can never survive into the pack.
    const s = bigSnap(["L1", "L2", "L3", "L4", "L5", "L6"], "legend");
    const owned = new Set(["L1"]);
    for (let i = 0; i < 100; i++) {
      for (const packType of ["standard", "premium"] as const) {
        const r = openPack({ packType, seed: `rr-${i}`, ownedIds: owned, snapshot: s });
        expect(r.cards.some((c) => c.playerId === "L1")).toBe(false);
        expect(r.dupesConverted).toHaveLength(0);
        const ids = r.cards.map((c) => c.playerId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("keeps the dupe and converts at 200 when every legend is owned", () => {
    // Reroll pool empty by construction -> the drawn dupe is kept and converts.
    const s = bigSnap(["L1", "L2", "L3"], "legend");
    const owned = new Set(["L1", "L2", "L3"]);
    const r = openPack({ packType: "premium", seed: "all-owned", ownedIds: owned, snapshot: s });
    expect(r.cards).toHaveLength(3);
    expect(r.cards.every((c) => owned.has(c.playerId))).toBe(true);
    expect(r.dupesConverted).toHaveLength(3);
    expect(r.dupesConverted.every((d) => d.coins === 200)).toBe(true);
    expect(new Set(r.dupesConverted.map((d) => d.playerId))).toEqual(owned);
  });

  it("converts an xfactor dupe at 200 as well", () => {
    const s = bigSnap(["X1", "X2", "X3"], "xfactor");
    const owned = new Set(["X1", "X2", "X3"]);
    const r = openPack({ packType: "premium", seed: "xf-owned", ownedIds: owned, snapshot: s });
    expect(r.cards).toHaveLength(3);
    expect(r.cards.every((c) => c.tier === "xfactor" && owned.has(c.playerId))).toBe(true);
    expect(r.dupesConverted).toHaveLength(3);
    expect(r.dupesConverted.every((d) => d.coins === 200)).toBe(true);
  });
});
