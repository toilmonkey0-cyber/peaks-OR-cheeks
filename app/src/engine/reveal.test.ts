import { describe, it, expect } from "vitest";
import { assignScripts, orderCards, type RevealScript } from "./reveal";
import { makeRng } from "./rng";
import type { Card, Tier } from "@/data/schema";

const card = (id: string, tier: Tier, rating = 75): Card => ({
  playerId: id, name: id, fullName: id, position: "WR", team: "ARI", jersey: 1,
  age: 25, rating, tier, keyStats: [], fantasyPpg: 1, avatarSeed: id });

describe("orderCards", () => {
  it("sorts worst -> best (tier rank, then rating)", () => {
    const ordered = orderCards([card("E", "elite", 88), card("C", "common", 50), card("R", "rare", 75), card("L", "legend", 95)]);
    expect(ordered.map((c) => c.playerId)).toEqual(["C", "R", "E", "L"]);
  });

  it("breaks tier ties by rating ascending", () => {
    const ordered = orderCards([card("hi", "rare", 80), card("lo", "rare", 70)]);
    expect(ordered.map((c) => c.playerId)).toEqual(["lo", "hi"]);
  });
});

describe("assignScripts", () => {
  const five = [card("a", "common", 50), card("b", "common", 60), card("c", "rare", 72), card("d", "elite", 85), card("e", "legend", 95)];

  it("escalates elite+ and leaves commons standard when no fake-out rolls", () => {
    let clean: RevealScript[] | null = null;
    for (let i = 0; i < 500 && clean === null; i++) {
      const s = assignScripts(five, makeRng(`plain-${i}`));
      if (!s.includes("troll") && !s.includes("gem")) clean = s;
    }
    expect(clean).not.toBeNull(); // no clean seed in 500 would itself signal a rate bug
    expect(clean![3]).toBe("escalated");
    expect(clean![4]).toBe("escalated");
    expect(clean![0]).toBe("standard");
    expect(clean![1]).toBe("standard");
    expect(clean![2]).toBe("standard");
  });

  it("never gems when the rarest card is only elite", () => {
    const four = [card("a", "common", 50), card("b", "common", 60), card("c", "rare", 72), card("d", "elite", 85)];
    let trollPacks = 0;
    for (let i = 0; i < 500; i++) {
      const s = assignScripts(four, makeRng(`ng-${i}`));
      expect(s.includes("gem")).toBe(false);
      if (s.includes("troll")) {
        trollPacks++;
        s.forEach((script, idx) => { if (script === "troll") expect(four[idx].tier).toBe("common"); });
      }
    }
    expect(trollPacks).toBeGreaterThan(0); // the fake-out path itself must have run
  });

  it("never assigns more than one fake-out per pack (across 500 seeds)", () => {
    for (let i = 0; i < 500; i++) {
      const s = assignScripts(five, makeRng(`seed-${i}`));
      const fakes = s.filter((x) => x === "troll" || x === "gem").length;
      expect(fakes).toBeLessThanOrEqual(1);
    }
  });

  it("troll only lands on common slots; gem only on the last (rarest) slot", () => {
    for (let i = 0; i < 500; i++) {
      const s = assignScripts(five, makeRng(`seed-${i}`));
      s.forEach((script, idx) => {
        if (script === "troll") expect(five[idx].tier).toBe("common");
        if (script === "gem") expect(idx).toBe(five.length - 1);
      });
    }
  });

  it("fake-outs occur at roughly the configured rate", () => {
    let fakes = 0;
    for (let i = 0; i < 4000; i++) {
      const s = assignScripts(five, makeRng(`rate-${i}`));
      if (s.includes("troll") || s.includes("gem")) fakes++;
    }
    expect(fakes / 4000).toBeGreaterThan(0.09);
    expect(fakes / 4000).toBeLessThan(0.16);
  });
});
