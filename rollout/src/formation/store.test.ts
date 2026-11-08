import { beforeEach, describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { makeRng } from "@/engine/rng";
import { buildLineups } from "./engine/lineups";
import { createGame, planPull } from "./engine/game";
import { freshFormationSave, loadFormationSave, recordFinishedGame, writeFormationSave, type FormationSave } from "./store";

const L = buildLineups(loadSnapshot("m27"));
const KEY = "rollout.formation.v1";

beforeEach(() => localStorage.clear());

describe("formation store", () => {
  it("starts fresh when nothing is saved", () => {
    expect(loadFormationSave()).toEqual({ inProgress: null, bestGame: null, gamesPlayed: 0 });
  });

  it("round-trips an in-progress game", () => {
    const save = { ...freshFormationSave(), inProgress: createGame("rt", L, ["KC", "BUF"]), gamesPlayed: 2 };
    writeFormationSave(save);
    expect(loadFormationSave()).toEqual(save);
  });

  it("falls back to fresh on corrupt JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadFormationSave()).toEqual(freshFormationSave());
  });

  it("drops a malformed in-progress game but keeps the rest", () => {
    localStorage.setItem(KEY, JSON.stringify({ inProgress: { quarter: 2 }, bestGame: 30, gamesPlayed: 4 }));
    expect(loadFormationSave()).toEqual({ inProgress: null, bestGame: 30, gamesPlayed: 4 });
  });

  it("never resurrects a mid-flight pull: pending slots come back pullable", () => {
    const g = createGame("pend", L, ["KC", "BUF"]);
    const plan = planPull(g, makeRng("p"))!; // marks pending, never committed (tab killed mid-flight)
    expect(g.sides[plan.side].slots[plan.index].pending).toBe(true);
    writeFormationSave({ ...freshFormationSave(), inProgress: g });
    const back = loadFormationSave().inProgress!;
    expect(back.sides.flatMap((s) => s.slots).some((s) => s.pending)).toBe(false);
    expect(back.sides[plan.side].slots[plan.index].layer).toBe(0);
  });

  it("records a finished game: best = lowest score, count increments, in-progress cleared", () => {
    let s: FormationSave = { ...freshFormationSave(), inProgress: createGame("f", L, ["KC", "BUF"]) };
    s = recordFinishedGame(s, 41);
    expect(s).toEqual({ inProgress: null, bestGame: 41, gamesPlayed: 1 });
    s = recordFinishedGame(s, 55);
    expect(s.bestGame).toBe(41);
    s = recordFinishedGame(s, 29);
    expect([s.bestGame, s.gamesPlayed]).toEqual([29, 3]);
  });
});
