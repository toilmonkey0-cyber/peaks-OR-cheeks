import { describe, expect, it } from "vitest";
import { loadSnapshot } from "./snapshot";

const snap = loadSnapshot();

describe("madden snapshot", () => {
  it("loads a full league", () => {
    expect(snap.players.length).toBeGreaterThan(1900);
    expect(snap.teams.length).toBe(33); // 32 + FA placeholder
  });

  it("keeps tiers consistent with ratings", () => {
    for (const p of snap.players) {
      const expected = p.rating >= 90 ? "legend" : p.rating >= 80 ? "elite" : p.rating >= 70 ? "rare" : "common";
      expect(p.tier).toBe(expected);
    }
  });

  it("lists xfactorIds matching the xfactor cards", () => {
    const flagged = snap.players.filter((p) => p.xfactor).map((p) => p.playerId).sort();
    expect([...snap.xfactorIds].sort()).toEqual(flagged);
    expect(flagged.length).toBeGreaterThan(0);
  });

  it("attributes are labeled and in range", () => {
    for (const p of snap.players) {
      for (const a of p.attributes) {
        expect(a.label).toMatch(/^[A-Z]{2,4}$/);
        expect(a.value).toBeGreaterThanOrEqual(0);
        expect(a.value).toBeLessThanOrEqual(99);
      }
    }
  });
});
