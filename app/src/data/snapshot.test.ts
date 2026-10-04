import { describe, it, expect } from "vitest";
import { loadSnapshot, SnapshotSchema } from "./snapshot";

describe("committed snapshot", () => {
  it("validates against the Zod contract", () => {
    const snap = loadSnapshot();
    expect(snap.players.length).toBeGreaterThanOrEqual(1500);
    expect(snap.teams.length).toBe(32);
    expect(snap.players.every((p) => p.rating >= 40 && p.rating <= 99)).toBe(true);
    expect(snap.players.every((p) => p.avatarSeed === p.playerId)).toBe(true);
    expect(new Set(snap.xfactorIds).size).toBeLessThanOrEqual(5);
  });
  it("spec §12 sanity: every team has at least 30 cards", () => {
    const snap = loadSnapshot();
    for (const t of snap.teams) {
      const cards = snap.players.filter((p) => p.team === t.abbr).length;
      expect(cards, `team ${t.abbr}`).toBeGreaterThanOrEqual(30);
    }
  });
  it("rejects a card with a bad tier", () => {
    expect(() => SnapshotSchema.parse({ builtAt: "2026-10-03", players: [{
      playerId: "x", name: "X", fullName: "X", position: "QB", team: "ARI", jersey: 1,
      age: 25, rating: 99, tier: "mythic", keyStats: [], fantasyPpg: 1, avatarSeed: "x",
    }], teams: [], xfactorIds: [] })).toThrow();
  });
});
