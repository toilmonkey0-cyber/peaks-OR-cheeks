import { beforeEach, describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { makeRng } from "@/engine/rng";
import { buildLineups } from "./engine/lineups";
import { createGame, planPull } from "./engine/game";
import { clearQueued, ensurePlayer, freshFormationSave, loadFormationSave, queueScore, recordFinishedGame, recordWallSolve, writeFormationSave, type FormationSave } from "./store";
import { finishDaily, freshDaily, startDaily } from "./engine/daily";

const L = buildLineups(loadSnapshot("m27"));
const KEY = "rollout.formation.v1";

beforeEach(() => localStorage.clear());

describe("formation store", () => {
  it("starts fresh when nothing is saved", () => {
    expect(loadFormationSave()).toEqual({ ...freshFormationSave() });
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
    expect(loadFormationSave()).toEqual({ ...freshFormationSave(), bestGame: 30, gamesPlayed: 4 });
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
    expect(s).toMatchObject({ inProgress: null, bestGame: 41, gamesPlayed: 1 });
    expect(s.wall).toEqual({});
    s = recordFinishedGame(s, 55);
    expect(s.bestGame).toBe(41);
    s = recordFinishedGame(s, 29);
    expect([s.bestGame, s.gamesPlayed]).toEqual([29, 3]);
  });
});

describe("wall + daily sections", () => {
  it("old v1 saves migrate: wall empty, daily null, everything else kept", () => {
    const old = { inProgress: createGame("old", L, ["KC", "BUF"]), bestGame: 30, gamesPlayed: 2 };
    localStorage.setItem(KEY, JSON.stringify(old));
    const s = loadFormationSave();
    expect(s.wall).toEqual({});
    expect(s.daily).toBeNull();
    expect([s.bestGame, s.gamesPlayed]).toEqual([30, 2]);
  });

  it("wall solves persist; gold upgrades but never downgrades", () => {
    let s = freshFormationSave();
    s = recordWallSolve(s, "KC", false);
    expect(s.wall.KC).toEqual({ day: expect.any(String), gold: false });
    const firstDay = s.wall.KC!.day;
    s = recordWallSolve(s, "KC", true);
    expect(s.wall.KC).toEqual({ day: firstDay, gold: true });
    s = recordWallSolve(s, "KC", false);
    expect(s.wall.KC!.gold).toBe(true); // no downgrade
    s = recordWallSolve(s, "BUF", true);
    expect(Object.keys(s.wall).sort()).toEqual(["BUF", "KC"]);
    writeFormationSave(s);
    expect(loadFormationSave().wall).toEqual(s.wall);
  });

  it("the daily section round-trips", () => {
    let s = freshFormationSave();
    let d = startDaily(freshDaily(), "2026-11-08", "week-6");
    d = finishDaily(d, { score: 41, quartersSolved: 4, perfects: 3, turnovers: 1, day: "2026-11-08" });
    s = { ...s, daily: d };
    writeFormationSave(s);
    expect(loadFormationSave().daily).toEqual(d);
  });

  it("a corrupt daily section dies alone; the wall survives", () => {
    localStorage.setItem(KEY, JSON.stringify({ wall: { KC: { day: "2026-11-08", gold: true } }, daily: "nonsense", bestGame: 10, gamesPlayed: 1 }));
    const s = loadFormationSave();
    expect(s.daily).toBeNull();
    expect(s.wall.KC!.gold).toBe(true);
  });
});

describe("legacy phase-A saves", () => {
  it("load with a stable seed default (per-pull rng keeps working after the upgrade)", () => {
    const legacy = createGame("old-seed", L, ["KC", "BUF"]);
    const stripped = JSON.parse(JSON.stringify(legacy)) as Record<string, unknown>;
    delete stripped.seed; // exactly what a phase-A save looks like to phase B
    localStorage.setItem(KEY, JSON.stringify({ inProgress: stripped, bestGame: null, gamesPlayed: 1 }));
    const a = loadFormationSave().inProgress!;
    expect(typeof a.seed).toBe("string");
    expect(a.seed.length).toBeGreaterThan(3);
    expect(loadFormationSave().inProgress!.seed).toBe(a.seed); // stable, not re-rolled per load
  });
});

describe("published payload cache", () => {
  const payload = {
    day: "2026-11-09", dataVersion: "w6", seed: "fm-daily:2026-11-09:w6",
    quarters: [0, 1, 2, 3].map((q) => ({ offense: `O${q}`, defense: `D${q}`, lineups: { off: [], def: [] } })),
  };
  it("round-trips and survives corrupt sections", () => {
    let s = { ...freshFormationSave(), published: payload };
    writeFormationSave(s);
    expect(loadFormationSave().published).toEqual(payload);
    localStorage.setItem(KEY, JSON.stringify({ ...s, published: "junk" }));
    expect(loadFormationSave().published).toBeNull();
  });
});

describe("groups + the offline score queue", () => {
  it("player identity is stable per device; groups and queue round-trip", () => {
    let s = ensurePlayer(freshFormationSave());
    const id = s.playerId;
    expect(id).toMatch(/^[a-z0-9-]{8,}$/);
    expect(ensurePlayer(s).playerId).toBe(id); // never re-rolled
    s = { ...s, groups: [{ code: "BLTZ7K", name: "the boys" }], pendingScores: [{ groupCode: "BLTZ7K", day: "2026-11-09", playerId: id, nick: "AARON", score: 38, detailJson: "{}" }] };
    writeFormationSave(s);
    const back = loadFormationSave();
    expect(back.groups).toEqual(s.groups);
    expect(back.pendingScores).toEqual(s.pendingScores);
    expect(back.playerId).toBe(id);
  });
  it("queueScore adds without duplicates per (group, day); clearQueued drains by predicate", () => {
    let s = ensurePlayer(freshFormationSave());
    const post = { groupCode: "BLTZ7K", day: "2026-11-09", playerId: s.playerId, nick: "AARON", score: 38, detailJson: "{}" };
    s = queueScore(s, post);
    s = queueScore(s, { ...post, score: 41 }); // same key replaces
    expect(s.pendingScores.length).toBe(1);
    expect(s.pendingScores[0].score).toBe(41);
    s = clearQueued(s, (x) => x.groupCode === "BLTZ7K" && x.day === "2026-11-09");
    expect(s.pendingScores).toEqual([]);
  });
});
