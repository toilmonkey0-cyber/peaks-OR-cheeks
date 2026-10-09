import { describe, expect, it } from "vitest";
import type { Card } from "@/data/schema";
import type { CoreStat } from "./highlow";
import { callHL, CORE_STATS, startHL } from "./highlow";

const card = (id: string, core: Partial<Record<CoreStat, number>> = {}): Card => ({
  playerId: id, name: id, fullName: id, position: "WR", team: "KC", jersey: 1, age: 25,
  heightIn: 74, weightLb: 200, college: "", yearsPro: 3, rating: 75, tier: "rare",
  attributes: [], coreStats: { SPD: 80, ACC: 80, AGI: 80, STR: 80, JMP: 80, AWR: 80, ...core },
  xfactor: false, abilities: [], avatarSeed: id,
});

describe("HIGHER/LOWER", () => {
  const pool = [card("a"), card("b"), card("c")];

  it("starts on a random player with a universal core stat", () => {
    const s = startHL(pool, "seed-1");
    expect(pool).toContain(s.current);
    expect(CORE_STATS).toContain(s.stat);
    expect(s.streak).toBe(0);
  });

  it("judges higher and lower calls correctly, including pushes", () => {
    let s = startHL(pool, "s");
    s = { ...s, current: card("cur", { SPD: 90 }), stat: "SPD" };
    const up = callHL(s, card("next", { SPD: 94 }), "higher", "x");
    expect(up.outcome).toBe("correct");
    expect(up.state.streak).toBe(1);
    expect(up.state.current.playerId).toBe("next"); // revealed becomes current
    const down = callHL(s, card("next2", { SPD: 85 }), "lower", "x");
    expect(down.outcome).toBe("correct");
    const wrong = callHL(s, card("next3", { SPD: 40 }), "higher", "x");
    expect(wrong.outcome).toBe("wrong");
    expect(wrong.state.streak).toBe(0);
    const push = callHL(s, card("next4", { SPD: 90 }), "higher", "x");
    expect(push.outcome).toBe("push");
    expect(push.state.streak).toBe(s.streak); // streak holds on a push
  });

  it("tracks the best run across a miss", () => {
    let s = startHL(pool, "s");
    s = { ...s, current: card("cur", { AGI: 50 }), stat: "AGI", streak: 0 };
    // re-pin the stat each round: the game rotates it (by design) after every call
    const step = (r: ReturnType<typeof callHL>) => ({ ...r.state, stat: "AGI" as const });
    s = step(callHL(s, card("n1", { AGI: 60 }), "higher", "a"));   // 1
    s = step(callHL(s, card("n2", { AGI: 70 }), "higher", "b"));   // 2
    s = step(callHL(s, card("n3", { AGI: 80 }), "higher", "c"));   // 3
    expect(s.streak).toBe(3);
    const dead = callHL(s, card("n4", { AGI: 40 }), "higher", "d");
    expect(dead.outcome).toBe("wrong");
    expect(dead.state.streak).toBe(0);
    expect(dead.state.best).toBe(3);
  });

  it("stat rotates and every comparison uses a stat both players own", () => {
    let s = startHL(pool, "s");
    for (let i = 0; i < 30; i++) {
      const r = callHL(s, card(`x${i}`), i % 2 ? "higher" : "lower", `s${i}`);
      expect(r.nextValue).toBeGreaterThanOrEqual(0);
      expect(CORE_STATS).toContain(r.state.stat);
      s = r.state;
    }
  });
});
