import { describe, expect, it } from "vitest";
import { makeRng } from "@/engine/rng";
import { loadSnapshot } from "@/data/snapshot";
import { buildLineups } from "./lineups";
import {
  applyPlay, buyScheme, call, commitPull, createGame, eligible, filmSlot, finalScore, nextQuarter,
  planPull, playPeak, pullRng, SCHEME_PRICES, spendPeak, startPull, TURNOVER_PENALTY, weightOf, type GameState,
} from "./game";

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

/** Pull until a face-down PEAK lands (KC offense carries two PEAK linemen; BUF's QB is a PEAK). */
function pullUntilFd(g: GameState): { side: 0 | 1; index: number } {
  for (let i = 0; i < 80; i++) {
    const p = planPull(g, makeRng("fd" + i));
    if (!p) break;
    commitPull(g, p);
    if (p.kind === "fd") return { side: p.side, index: p.index };
  }
  throw new Error("no face-down PEAK surfaced");
}

describe("calls + downs", () => {
  it("a wrong call burns one shared down and crosses that team out on that side only", () => {
    const g = g0();
    const r = call(g, 0, "NE");
    expect(r).toEqual({ correct: false, quarterEnded: false, banked: 0 });
    expect(g.downs).toBe(3);
    expect(g.sides[0].out).toEqual(["NE"]);
    expect(g.sides[1].out).toEqual([]);
  });

  it("a correct call solves the side, ghosts its hidden numbers, and drops it out of pulls", () => {
    const g = g0();
    expect(call(g, 0, "KC").correct).toBe(true);
    expect(g.sides[0].solved).toBe(true);
    expect(g.sides[0].slots.every((s) => s.ghost || s.layer > 0 || s.fd)).toBe(true);
    expect(eligible(g).every((e) => e.side === 1)).toBe(true);
  });

  it("four wrong calls = turnover: penalty score, face-down PEAKs bank as chips", () => {
    const g = g0();
    const fd = pullUntilFd(g);
    for (const t of ["NE", "ARI", "ATL", "CAR"]) call(g, 0, t);
    expect(g.over).toEqual({ kind: "turnover", score: TURNOVER_PENALTY, banked: 1 });
    expect(g.chips).toBe(1);
    expect(g.sides[fd.side].slots[fd.index].fd).toBe(false);
  });

  it("both sides called right ends the quarter with score = pulls taken", () => {
    const g = g0();
    for (let i = 0; i < 5; i++) { startPull(g); commitPull(g, planPull(g, makeRng("s" + i))!); }
    call(g, 0, "KC");
    const r = call(g, 1, "BUF");
    expect(r.quarterEnded).toBe(true);
    expect(g.over).toEqual({ kind: "solved", score: 5, banked: expect.any(Number) });
    expect(g.total).toBe(5);
  });

  it("a turnover always scores worse than ANY solve (more than the max 22x3 pulls)", () => {
    expect(TURNOVER_PENALTY).toBeGreaterThan(22 * 3);
  });

  it("with 31 teams crossed out, calling the one live team still resolves", () => {
    const g = g0();
    g.sides[0].out = Object.keys(L).filter((t) => t !== "KC");
    expect(g.sides[0].out.length).toBe(31);
    expect(call(g, 0, "KC").correct).toBe(true);
  });
});

describe("pull counting", () => {
  it("one spin = one pull; NO-HUDDLE deals two cards for that one pull, then wears off", () => {
    const g = g0();
    expect(startPull(g)).toBe(1);
    g.noHuddle = true;
    expect(startPull(g)).toBe(2);
    expect(g.noHuddle).toBe(false);
    expect(startPull(g)).toBe(1);
    expect(g.pulls).toBe(3);
  });
});

describe("PEAKs, chips, plays", () => {
  it("PLAY flips a face-down PEAK to number + initials", () => {
    const g = g0();
    const fd = pullUntilFd(g);
    playPeak(g, fd.side, fd.index);
    const s = g.sides[fd.side].slots[fd.index];
    expect([s.fd, s.layer]).toEqual([false, 2]);
  });

  it("SPEND seals the PEAK's slot and applies the play without touching banked chips", () => {
    const g = g0();
    const fd = pullUntilFd(g);
    g.chips = 2;
    expect(spendPeak(g, fd.side, fd.index, "nohuddle")).toBe(true);
    const s = g.sides[fd.side].slots[fd.index];
    expect([s.fd, s.sealed]).toEqual([false, true]);
    expect(g.noHuddle).toBe(true);
    expect(g.chips).toBe(2);
  });

  it("plays from the bank cost one chip and fail when broke", () => {
    const g = g0();
    expect(applyPlay(g, "nohuddle")).toBe(false);
    g.chips = 1;
    expect(applyPlay(g, "nohuddle")).toBe(true);
    expect(g.chips).toBe(0);
  });

  it("CHALLENGE FLAG restores exactly one down per wrong call", () => {
    const g = g0();
    g.chips = 3;
    expect(applyPlay(g, "flag")).toBe(false); // nothing to challenge, no chip spent
    expect(g.chips).toBe(3);
    call(g, 0, "NE");
    expect(applyPlay(g, "flag")).toBe(true);
    expect(g.downs).toBe(4);
    expect(applyPlay(g, "flag")).toBe(false);
    expect(g.chips).toBe(2);
  });

  it("FILM STUDY digs a lit slot to its initials, once", () => {
    const g = g0();
    const p = planPull(g, makeRng("film"))!;
    commitPull(g, p);
    if (p.kind === "fd") playPeak(g, p.side, p.index);
    g.chips = 1;
    expect(applyPlay(g, "film")).toBe(true);
    const before = g.sides[p.side].slots[p.index].layer;
    expect(filmSlot(g, p.side, p.index)).toBe(true);
    expect(g.sides[p.side].slots[p.index].layer).toBe(Math.min(3, Math.max(2, before + 1)));
    expect(g.film).toBe(false);
    expect(filmSlot(g, p.side, p.index)).toBe(false);
  });
});

describe("schemes + scoring", () => {
  const halftime = (g: GameState) => { g.quarter = 2; g.over = { kind: "solved", score: 9, banked: 0 }; };

  it("schemes sell only at halftime (Q2 final whistle), at their price, once each", () => {
    const g = g0();
    g.chips = 5;
    expect(buyScheme(g, "starPower")).toBe(false); // Q1 in progress
    halftime(g);
    expect(buyScheme(g, "starPower")).toBe(true);
    expect(g.chips).toBe(5 - SCHEME_PRICES.starPower);
    expect(buyScheme(g, "starPower")).toBe(false); // already owned
    g.chips = SCHEME_PRICES.scouting - 1;
    expect(buyScheme(g, "scouting")).toBe(false); // can't afford
  });

  it("STAR POWER doubles the jackpot slots' weight", () => {
    const g = g0();
    expect(weightOf(g, 0, 0)).toBe(1); // KC QB
    g.schemes.starPower = true;
    expect(weightOf(g, 0, 0)).toBe(2);
    expect(weightOf(g, 0, 6)).toBe(3); // LT unchanged
  });

  it("final score = quarters played minus unspent chips", () => {
    const g = g0();
    g.total = 40;
    g.chips = 5;
    expect(finalScore(g)).toBe(35);
  });

  it("next quarter deals two new different teams with fresh downs; SCOUTING crosses 3 teams not in the game", () => {
    const g = g0();
    g.schemes.scouting = true;
    g.over = { kind: "solved", score: 7, banked: 0 };
    g.pulls = 7;
    nextQuarter(g, L, makeRng("q2"));
    expect(g.quarter).toBe(2);
    expect(g.over).toBeNull();
    expect([g.downs, g.pulls, g.flags]).toEqual([4, 0, 0]);
    const [o, d] = g.sides;
    expect(o.team).not.toBe(d.team);
    expect(o.out.length).toBe(3);
    expect(d.out).toEqual(o.out);
    expect(o.out).not.toContain(o.team);
    expect(o.out).not.toContain(d.team);
  });
});

describe("spec §10: statistical invariants", () => {
  /** Pull counts per rarity class with a controlled pool: only one jack, one skill, one common open. */
  function classFrequencies(n: number) {
    const g = createGame("w", L, ["KC", "BUF"]);
    g.sides[1].solved = true;
    g.sides[0].slots.forEach((s, i) => { if (![0, 1, 6].includes(i)) s.sealed = true; });
    const rng = makeRng("weights");
    const count = { jack: 0, skill: 0, common: 0 };
    for (let i = 0; i < n; i++) {
      const p = planPull(g, rng)!;
      count[g.sides[p.side].lineup[p.index].cls]++;
      const slot = g.sides[p.side].slots[p.index];
      slot.layer = 0; // keep the same three slots pullable forever (all three players are MIDs or better: no fd loop-invariant here)
      slot.pending = false;
    }
    return count;
  }

  it("weights 3:2:1 are honored by the selection (Monte-Carlo, ±15% relative tolerance)", () => {
    const n = 3000;
    const f = classFrequencies(n);
    const expectNear = (got: number, want: number) =>
      expect(Math.abs(got - want)).toBeLessThanOrEqual(want * 0.15);
    expectNear(f.jack, n / 6);
    expectNear(f.skill, n / 3);
    expectNear(f.common, n / 2);
  });

  it("same seed → identical game (full replay: teams, every reveal, the log)", () => {
    const play = (seed: string) => {
      const g = createGame(seed, L);
      const rng = makeRng(seed + ":pulls");
      for (let i = 0; i < 40; i++) { const p = planPull(g, rng); if (!p) break; commitPull(g, p); }
      call(g, 0, g.sides[0].team);
      call(g, 1, g.sides[1].team);
      return { teams: g.sides.map((s) => s.team), log: g.log.map((e) => e.text), total: g.total };
    };
    const a = play("daily-1");
    const b = play("daily-1");
    const c = play("daily-2");
    expect(a).toEqual(b);
    expect(a.teams).not.toEqual(c.teams);
  });
});

describe("per-pull determinism (the daily's spine)", () => {
  const seed = "fm-daily:2026-11-08:week-6";
  const play = (n: number, g0?: GameState) => {
    const g = g0 ?? createGame(seed, L);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = planPull(g, pullRng(seed, g.pulls));
      if (!p) break;
      out.push(`${p.side}:${p.index}:${p.num}:${p.sub}`);
      commitPull(g, p);
    }
    return { g, out };
  };

  it("same seed → identical reveal sequence", () => {
    const a = play(12);
    const b = play(12);
    expect(a.out).toEqual(b.out);
    expect(a.g.sides.map((s) => s.team)).toEqual(b.g.sides.map((s) => s.team));
  });

  it("a save/resume mid-game continues the exact sequence (no stream resync needed)", () => {
    const first4 = play(4);
    const clone = JSON.parse(JSON.stringify(first4.g)) as GameState;
    const resumed = play(3, clone);
    const unbroken = play(7);
    expect(resumed.out).toEqual(unbroken.out.slice(4));
    expect(resumed.g.sides.flatMap((s) => s.slots.map((x) => [x.layer, x.fd]))).toEqual(
      unbroken.g.sides.flatMap((s) => s.slots.map((x) => [x.layer, x.fd])));
  });

  it("different seed → a different game", () => {
    const g2 = createGame("fm-daily:2026-11-09:week-6", L);
    const other = (() => { const out: string[] = []; for (let i = 0; i < 6; i++) { const p = planPull(g2, pullRng("fm-daily:2026-11-09:week-6", g2.pulls)); if (!p) break; out.push(`${p.side}:${p.index}`); commitPull(g2, p); } return out; })();
    expect(other).not.toEqual(play(6).out.map((x) => x.split(":").slice(0, 2).join(":")));
  });
});
