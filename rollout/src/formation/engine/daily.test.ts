import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { buildLineups } from "./lineups";
import { createGame } from "./game";
import { dailySeed, finishDaily, freshDaily, localDay, nextStreak, startDaily, type DailyResult } from "./daily";

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
