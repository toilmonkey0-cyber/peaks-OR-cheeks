import { describe, expect, it } from "vitest";
import { loadSnapshot, sourceLabel } from "./snapshot";
import type { Source } from "@/storage/storage";

describe("madden snapshots (both sources)", () => {
  const cases: [Source, string, number][] = [
    ["m26", "23-super-bowl", 1900],
    ["m27", "madden-ratings-week-", 1900],
  ];

  for (const [source, iterationPrefix, minPlayers] of cases) {
    it(`${source}: loads a full league with consistent tiers`, () => {
      const snap = loadSnapshot(source);
      expect(snap.players.length).toBeGreaterThan(minPlayers);
      expect(snap.teams.length).toBe(33); // 32 + FA placeholder
      expect(snap.sourceIteration.startsWith(iterationPrefix)).toBe(true);
      for (const p of snap.players) {
        const expected = p.rating >= 90 ? "legend" : p.rating >= 80 ? "elite" : p.rating >= 70 ? "rare" : "common";
        expect(p.tier).toBe(expected);
      }
      const flagged = snap.players.filter((p) => p.xfactor).map((p) => p.playerId).sort();
      expect([...snap.xfactorIds].sort()).toEqual(flagged);
      expect(flagged.length).toBeGreaterThan(0);
      for (const p of snap.players) {
        for (const a of p.attributes) {
          expect(a.label).toMatch(/^[A-Z]{2,4}$/);
          expect(a.value).toBeGreaterThanOrEqual(0);
          expect(a.value).toBeLessThanOrEqual(99);
        }
      }
    });
  }

  it("labels sources for the toggle", () => {
    expect(sourceLabel("m26", loadSnapshot("m26"))).toBe("M26 · FINAL");
    expect(sourceLabel("m27", loadSnapshot("m27"))).toMatch(/^M27 · W\d+$/);
  });
});
