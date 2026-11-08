import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { buildLineups } from "./lineups";

const all = (L: ReturnType<typeof buildLineups>) => Object.values(L).flatMap((t) => [...t.off.slots, ...t.def.slots]);

for (const src of ["m26", "m27"] as const) {
  describe(`lineups ${src}`, () => {
    const L = buildLineups(loadSnapshot(src));

    it("fills 11+11 for all 32 teams (no FA), every slot has a real jersey number", () => {
      expect(Object.keys(L).length).toBe(32);
      expect(L.FA).toBeUndefined();
      for (const t of Object.values(L)) {
        expect(t.off.slots.length).toBe(11);
        expect(t.def.slots.length).toBe(11);
        for (const s of [...t.off.slots, ...t.def.slots]) {
          expect(Number.isInteger(s.jersey)).toBe(true);
          expect(s.jersey).toBeGreaterThanOrEqual(0); // #0 is legal and common
        }
      }
    });

    it("stamps rank among STARTERS: 3 PEAK + 3 CHEEKS per team-slot (9/96 WR+CB, 6/64 DT)", () => {
      const byPos = new Map<string, { P: number; C: number }>();
      for (const s of all(L)) {
        const c = byPos.get(s.pos) ?? { P: 0, C: 0 };
        if (s.stamp === "P") c.P++;
        if (s.stamp === "C") c.C++;
        byPos.set(s.pos, c);
      }
      for (const [pos, c] of byPos) {
        const k = pos === "WR" || pos === "CB" ? 9 : pos === "DT" ? 6 : 3;
        expect({ pos, ...c }).toEqual({ pos, P: k, C: k });
      }
    });

    it("every PEAK starter outrates every CHEEKS starter at the same position", () => {
      const starters = all(L);
      for (const p of starters.filter((s) => s.stamp === "P")) {
        for (const c of starters.filter((s) => s.stamp === "C" && s.pos === p.pos)) {
          expect(p.rating).toBeGreaterThan(c.rating);
        }
      }
    });

    it("rarity classes: QB = offense jackpot, 5 skill, 5 OL; defense jackpot = its top-rated starter", () => {
      for (const t of Object.values(L)) {
        expect(t.off.slots[0].pos).toBe("QB");
        expect(t.off.slots[0].cls).toBe("jack");
        expect(t.off.slots.filter((s) => s.cls === "skill").length).toBe(5);
        expect(t.off.slots.filter((s) => s.cls === "common").length).toBe(5);
        const best = [...t.def.slots].sort((a, b) => b.rating - a.rating)[0];
        const jacks = t.def.slots.filter((s) => s.cls === "jack");
        expect(jacks.length).toBe(1);
        expect(jacks[0].playerId).toBe(best.playerId);
      }
    });

    it("slot keys are unique per side (WR1/WR2/WR3, DT1/DT2, CB1..CB3)", () => {
      for (const t of Object.values(L)) {
        expect(new Set(t.off.slots.map((s) => s.key)).size).toBe(11);
        expect(new Set(t.def.slots.map((s) => s.key)).size).toBe(11);
      }
    });
  });
}

describe("initials", () => {
  const L = buildLineups(loadSnapshot("m27"));
  it("first letters of name parts, suffixes stripped", () => {
    expect(all(L).find((s) => s.fullName === "Geno Smith")?.ini).toBe("G.S.");
    expect(all(L).find((s) => s.fullName.startsWith("Derwin James"))?.ini).toBe("D.J.");
  });
});
