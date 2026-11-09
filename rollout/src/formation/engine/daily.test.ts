import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { buildLineups } from "./lineups";
import { createGame } from "./game";
import { dailySeed, finishDaily, freshDaily, gameFromPayload, localDay, nextPublishedQuarter, nextStreak, startDaily, type DailyResult } from "./daily";

const L = buildLineups(loadSnapshot("m27"));
const V = "madden-ratings-week-6";

describe("localDay", () => {
  it("formats local dates, never UTC", () => {
    // 2026-11-08 00:30 local = 2026-11-07 UTC-ish — must print the LOCAL day
    expect(localDay(new Date(2026, 10, 8, 0, 30))).toBe("2026-11-08");
    expect(localDay(new Date(2026, 0, 2, 23, 59))).toBe("2026-01-02");
  });
});

describe("nextStreak", () => {
  it("yesterday keeps the streak alive, today is idempotent, a gap resets to 1", () => {
    expect(nextStreak(2, "2026-11-07", "2026-11-08")).toBe(3);
    expect(nextStreak(4, "2026-11-08", "2026-11-08")).toBe(4);
    expect(nextStreak(9, "2026-11-04", "2026-11-08")).toBe(1);
    expect(nextStreak(1, null, "2026-11-08")).toBe(1);
  });
});

describe("the daily seed", () => {
  it("same day + data version = the same game for everyone", () => {
    const s = dailySeed("2026-11-08", V);
    expect(createGame(s, L).sides.map((x) => x.team)).toEqual(createGame(dailySeed("2026-11-08", V), L).sides.map((x) => x.team));
  });
  it("a new week's data or a new day deals a different game", () => {
    const a = createGame(dailySeed("2026-11-08", V), L).sides.map((x) => x.team);
    const b = createGame(dailySeed("2026-11-08", "madden-ratings-week-7"), L).sides.map((x) => x.team);
    const c = createGame(dailySeed("2026-11-09", V), L).sides.map((x) => x.team);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe("daily state machine", () => {
  it("starting the same day twice changes nothing (one attempt)", () => {
    const first = startDaily(freshDaily(), "2026-11-08", V);
    const again = startDaily(first, "2026-11-08", V);
    expect(again).toEqual(first);
  });
  it("a new day starts fresh; an in-progress older day is replaced by today's", () => {
    const started = startDaily(freshDaily(), "2026-11-07", V);
    const today = startDaily(started, "2026-11-08", V);
    expect(today.day).toBe("2026-11-08");
    expect(today.result).toBeNull();
  });
  it("finishing records the result and the streak", () => {
    const r: DailyResult = { score: 41, quartersSolved: 4, perfects: 3, turnovers: 1, day: "2026-11-08" };
    const done = finishDaily(startDaily(freshDaily(), "2026-11-08", V), r);
    expect(done.result).toEqual(r);
    expect(done.streak).toBe(1);
    expect(done.lastPlayedDay).toBe("2026-11-08");
    // yesterday's streak carries into today
    const y: DailyResult = { score: 50, quartersSolved: 3, perfects: 0, turnovers: 1, day: "2026-11-08" };
    const chain = finishDaily(startDaily({ ...freshDaily(), streak: 2, lastPlayedDay: "2026-11-07" }, "2026-11-08", V), y);
    expect(chain.streak).toBe(3);
  });
  it("a finished day never restarts (startDaily is a no-op once finished)", () => {
    const done = finishDaily(startDaily(freshDaily(), "2026-11-08", V), { score: 41, quartersSolved: 4, perfects: 0, turnovers: 0, day: "2026-11-08" });
    expect(startDaily(done, "2026-11-08", V)).toEqual(done);
  });
});

describe("published quarters (the Worker's sealed envelope)", () => {
  const pp = (team: string, i: number, side: "off" | "def") => ({
    team, side, key: `K${i}`, label: `L${i}`, pos: "QB", jersey: i, ini: "A.B.", fullName: "Alpha Beta",
    college: "Somewhere St.", rating: 80, playerId: `ea-${team}-${i}`, stamp: "M" as const, cls: "common" as const,
  });
  const payload = {
    day: "2026-11-08", dataVersion: "v", seed: "fm-daily:2026-11-08:v",
    quarters: [0, 1, 2, 3].map((q) => ({
      offense: `O${q}`, defense: `D${q}`,
      lineups: { off: Array.from({ length: 11 }, (_, i) => pp(`O${q}`, i, "off")), def: Array.from({ length: 11 }, (_, i) => pp(`D${q}`, i, "def")) },
    })),
  };

  it("SCOUTING DEPT crosses 3 deterministic teams per side in published quarters", () => {
    const g = gameFromPayload(payload, 0);
    g.schemes.scouting = true;
    g.over = { kind: "solved", score: 5, banked: 0 };
    expect(nextPublishedQuarter(g, payload)).toBe(true);
    expect(g.sides[0].out.length).toBe(3);
    const known = ["O0", "D0", "O1", "D1", "O2", "D2", "O3", "D3"].filter((t) => t !== "O1" && t !== "D1");
    expect(known).toEqual(expect.arrayContaining(g.sides[0].out));
    expect(g.sides[1].out).toEqual(g.sides[0].out);
    expect(g.sides[0].out).not.toContain(g.sides[0].team);
    expect(g.sides[0].out).not.toContain(g.sides[1].team);
    const g2 = gameFromPayload(payload, 0);
    g2.schemes.scouting = true;
    g2.over = { kind: "solved", score: 5, banked: 0 };
    nextPublishedQuarter(g2, payload);
    expect(g2.sides[0].out).toEqual(g.sides[0].out);
  });

  it("carries hold: chips, counters, perfects ride to the payload's next pairing", () => {
    const g = gameFromPayload(payload, 1);
    g.chips = 2; g.quartersSolved = 1; g.perfects = 3;
    g.over = { kind: "solved", score: 9, banked: 0 };
    nextPublishedQuarter(g, payload);
    expect(g.quarter).toBe(3);
    expect([g.chips, g.quartersSolved, g.perfects, g.downs, g.pulls]).toEqual([2, 1, 3, 4, 0]);
    expect(g.sides.map((s) => s.team)).toEqual(["O2", "D2"]);
  });
});
