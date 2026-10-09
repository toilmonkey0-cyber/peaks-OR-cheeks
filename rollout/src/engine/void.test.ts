import { describe, expect, it } from "vitest";
import { dealFromTheHouse, MASCOTS, makeGhost } from "./void";

const teams: never[] = [];

describe("the house's collection", () => {
  it("ships exactly 32 original mascots", () => {
    expect(Object.keys(MASCOTS)).toHaveLength(32);
  });

  it("first visit always deals a ghost", () => {
    const e = dealFromTheHouse("s1", [], teams);
    expect(e.kind).toBe("ghost");
  });

  it("ghosts are unique per seed with coherent shape", () => {
    const g = makeGhost("xyz");
    expect(g.code).toMatch(/^NVL-\d{2}$/);
    expect(g.title).toMatch(/^THE [A-Z ]+$/);
    expect(g.stats).toHaveLength(6);
    expect(g.stats.every((s) => s.value >= 0 && s.value <= 99)).toBe(true);
    expect(makeGhost("xyz").id).toBe(g.id);
    expect(makeGhost("other").id).not.toBe(g.id);
  });

  it("deals unrecovered mascots only, eventually completing the 32", () => {
    const collected: string[] = [];   // ghosts count too — any entry ends the 'first visit'
    let mascots = 0;
    for (let i = 0; i < 800 && mascots < 32; i++) {
      const e = dealFromTheHouse(`d${i}`, collected, teams);
      collected.push(e.id);
      if (e.kind === "mascot") {
        expect(Object.keys(MASCOTS)).toContain(e.id);
        mascots++;
      }
    }
    expect(mascots).toBe(32);
  });

  it("once the 32 are complete, only ghosts remain", () => {
    const all = Object.keys(MASCOTS);
    for (let i = 0; i < 40; i++) {
      expect(dealFromTheHouse(`z${i}`, all, teams).kind).toBe("ghost");
    }
  });
});
