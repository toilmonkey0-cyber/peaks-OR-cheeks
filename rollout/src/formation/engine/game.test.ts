import { describe, expect, it } from "vitest";
import { makeRng } from "@/engine/rng";
import { loadSnapshot } from "@/data/snapshot";
import { buildLineups } from "./lineups";
import { commitPull, createGame, eligible, planPull, type GameState } from "./game";

const L = buildLineups(loadSnapshot("m27"));
const g0 = () => createGame("t", L, ["KC", "BUF"]);
const isFresh = (g: GameState, side: 0 | 1, i: number) => {
  const s = g.sides[side].slots[i];
  return s.layer === 0 && !s.fd && !s.sealed && !s.pending;
};

describe("createGame", () => {
  it("puts one team's offense against another team's defense, players carried in the state", () => {
    const g = g0();
    expect(g.sides[0].team).toBe("KC");
    expect(g.sides[1].team).toBe("BUF");
    expect(g.sides[0].lineup.map((p) => p.playerId)).toEqual(L.KC.off.slots.map((p) => p.playerId));
    expect(g.sides[1].lineup.map((p) => p.playerId)).toEqual(L.BUF.def.slots.map((p) => p.playerId));
    expect(g.downs).toBe(4);
    expect(g.quarter).toBe(1);
  });
  it("picks two DIFFERENT teams from the seed when none are given, deterministically", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const g = createGame(seed, L);
      expect(g.sides[0].team).not.toBe(g.sides[1].team);
      expect(createGame(seed, L).sides.map((s) => s.team)).toEqual(g.sides.map((s) => s.team));
    }
  });
});

describe("pulls", () => {
  it("fresh-first: a pull only digs a side once no fresh slot remains on it; drained = all lit or face-down", () => {
    const g = g0();
    let guard = 0;
    for (;;) {
      const p = planPull(g, makeRng("f" + guard));
      if (!p) break;
      const target = g.sides[p.side].slots[p.index];
      if (target.layer >= 1) {
        const anyFresh = g.sides[p.side].slots.some((_, i) => isFresh(g, p.side, i));
        expect(anyFresh).toBe(false);
      }
      commitPull(g, p);
      expect(++guard).toBeLessThan(100);
    }
    for (const side of g.sides) for (const s of side.slots) expect(s.layer >= 1 || s.fd).toBe(true);
  });

  it("a face-down PEAK is neither fresh nor diggable", () => {
    const g = g0();
    let plan = planPull(g, makeRng("x0"))!;
    commitPull(g, plan);
    for (let i = 1; plan.kind !== "fd" && i < 80; i++) { plan = planPull(g, makeRng("x" + i))!; commitPull(g, plan); }
    expect(plan.kind).toBe("fd");
    expect(plan.face).toBe("gold");
    expect(g.sides[plan.side].slots[plan.index].fd).toBe(true);
    expect(eligible(g).some((e) => e.side === plan.side && e.index === plan.index)).toBe(false);
  });

  it("two plans before committing never target the same slot (no-huddle safety)", () => {
    const g = g0();
    const a = planPull(g, makeRng("a"))!;
    const b = planPull(g, makeRng("a"))!; // same rng stream on purpose
    expect(a.side !== b.side || a.index !== b.index).toBe(true);
  });

  it("returns null when every slot is fully dug (make the call)", () => {
    const g = g0();
    for (const side of g.sides) side.slots.forEach((s) => { s.layer = 3; });
    expect(planPull(g, makeRng("z"))).toBeNull();
  });

  it("a solved side drops out of pulls", () => {
    const g = g0();
    g.sides[0].solved = true;
    expect(eligible(g).every((e) => e.side === 1)).toBe(true);
  });

  it("digs deepen the same slot: number → initials → college", () => {
    const g = g0();
    g.sides[1].solved = true; // only offense eligible
    g.sides[0].slots.forEach((s, i) => { if (i > 0) s.sealed = true; });
    g.sides[0].slots[0].layer = 1;
    const p1 = planPull(g, makeRng("d1"))!;
    expect([p1.side, p1.index]).toEqual([0, 0]);
    expect(p1.sub).toBe(L.KC.off.slots[0].ini);
    commitPull(g, p1);
    const p2 = planPull(g, makeRng("d2"))!;
    expect(p2.sub).toBe(L.KC.off.slots[0].college);
    expect(p2.toast).toContain(L.KC.off.slots[0].college);
    commitPull(g, p2);
    expect(g.sides[0].slots[0].layer).toBe(3);
  });

  it("a first reveal shows the number, CHEEKS reveals get a roast, and every commit logs newest-first", () => {
    const g = g0();
    const p = planPull(g, makeRng("r"))!;
    const player = g.sides[p.side].lineup[p.index];
    if (p.kind !== "fd") {
      expect(p.num).toBe("#" + player.jersey);
      expect(p.toast).toContain("#" + player.jersey);
    }
    commitPull(g, p);
    const p2 = planPull(g, makeRng("r2"))!;
    commitPull(g, p2);
    expect(g.log[0].text).toBe(p2.toast);
    expect(g.log[1].text).toBe(p.toast);
    expect(g.sides.flatMap((s) => s.slots).some((s) => s.pending)).toBe(false);
  });
});
