import { describe, it, expect } from "vitest";
import { canFill, squadRating, exportText, exportCsv } from "./squad";
import type { Card } from "@/data/schema";

const mk = (id: string, position: string, rating = 80, tier: Card["tier"] = "rare"): Card => ({
  playerId: id, name: id, fullName: `Full ${id}`, position, team: "ARI", jersey: 1,
  age: 25, rating, tier, keyStats: [], fantasyPpg: 1, avatarSeed: id });

describe("canFill", () => {
  it("enforces exact, flex, and def rules", () => {
    expect(canFill("QB", mk("q", "QB"))).toBe(true);
    expect(canFill("RB1", mk("w", "WR"))).toBe(false);
    expect(canFill("FLEX", mk("w", "WR"))).toBe(true);
    expect(canFill("FLEX", mk("q", "QB"))).toBe(false);
    expect(canFill("DEF", mk("d", "DEF"))).toBe(true);
    expect(canFill("K", mk("d", "DEF"))).toBe(false);
  });
});

describe("squadRating", () => {
  it("averages filled slots, rounds, empty = 0", () => {
    const byId = new Map([["a", mk("a", "QB", 90)], ["b", mk("b", "RB", 80)]]);
    expect(squadRating({ QB: "a", RB1: "b", RB2: null }, byId)).toBe(85);
    expect(squadRating({ QB: null }, byId)).toBe(0);
  });
});

describe("exports", () => {
  const byId = new Map([["a", mk("a", "QB", 90, "legend")]]);
  const squad = { QB: "a", RB1: null, RB2: null, WR1: null, WR2: null, WR3: null, TE: null, FLEX: null, K: null, DEF: null };
  it("text format", () => {
    const t = exportText(squad, byId);
    expect(t.split("\n")).toHaveLength(11); // header + 10 slots
    expect(t).toContain("RipPack Squad (OVR 90)");
    expect(t).toContain("QB  Full a — ARI QB [legend] 90");
  });
  it("csv format", () => {
    expect(exportCsv(squad, byId)).toContain("slot,playerId,fullName,position,team,rating,tier");
    expect(exportCsv(squad, byId)).toContain("QB,a,Full a,QB,ARI,90,legend");
  });
});
