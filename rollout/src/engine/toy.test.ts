import { describe, expect, it } from "vitest";
import type { Card } from "@/data/schema";
import { advanceDuel, duelVerdict, DUEL_PULLS, recordDuelPull, startDuel } from "./duel";
import { weatherOf, WEATHER_MOTE_CAP } from "./weather";

const card = (id: string, rating: number): Card => ({
  playerId: id, name: id, fullName: id, position: "WR", team: "KC", jersey: 1, age: 25,
  heightIn: 74, weightLb: 200, college: "", yearsPro: 3, rating,
  tier: rating >= 90 ? "legend" : rating >= 80 ? "elite" : rating >= 70 ? "rare" : "common",
  attributes: [], xfactor: false, abilities: [], avatarSeed: id,
});

describe("weatherOf", () => {
  it("clears the sky when nothing has happened", () => {
    const w = weatherOf(0, 0, 0);
    expect(w).toEqual({ motes: 0, leafEveryMs: null, gloom: 0 });
  });

  it("gold dust grows with peaks, capped", () => {
    expect(weatherOf(1, 0, 0).motes).toBe(9);
    expect(weatherOf(4, 0, 0).motes).toBe(WEATHER_MOTE_CAP);
    expect(weatherOf(50, 0, 0).motes).toBe(WEATHER_MOTE_CAP);
  });

  it("sad leaves cadence by atomic count; gloom ladder on streaks", () => {
    expect(weatherOf(1, 1, 4).leafEveryMs).toBe(40_000);
    expect(weatherOf(1, 2, 4).leafEveryMs).toBe(20_000);
    expect(weatherOf(1, 0, 5).gloom).toBe(1);
    expect(weatherOf(1, 0, 8).gloom).toBe(2);
    expect(weatherOf(1, 0, 4).gloom).toBe(0);
  });
});

describe("Luck Duel", () => {
  it("records into the current player without advancing the turn", () => {
    let d = startDuel();
    d = recordDuelPull(d, card("a", 91), "peak", 0.095, 0.09);
    expect(d.players[0].pulls).toBe(1);
    expect(d.players[0].peaks).toBe(1);
    expect(d.players[1].pulls).toBe(0);
    expect(d.turn).toBe(0);
  });

  it("alternates turns on advance and finishes after both complete", () => {
    let d = startDuel();
    for (let round = 0; round < DUEL_PULLS; round++) {
      d = recordDuelPull(d, card(`p0-${round}`, 70), null, 0.095, 0.09);
      d = advanceDuel(d);
      expect(d.turn).toBe(1);
      d = recordDuelPull(d, card(`p1-${round}`, 70), null, 0.095, 0.09);
      d = advanceDuel(d);
      if (round < DUEL_PULLS - 1) expect(d.turn).toBe(0);
    }
    expect(d.finished).toBe(true);
    expect(advanceDuel(d)).toBe(d); // finished is terminal
  });

  it("fate favors the peak-rich player over the cheek-scarred one", () => {
    let d = startDuel();
    for (let i = 0; i < 5; i++) {
      d = recordDuelPull(d, card(`g${i}`, 88), "peak", 0.095, 0.09);
      d = advanceDuel(d);
      d = recordDuelPull(d, card(`b${i}`, 58), "atomic", 0.095, 0.09);
      d = advanceDuel(d);
    }
    const v = duelVerdict(d);
    expect(v.winner).toBe(0);
    expect(v.line).toBe("FATE FAVORS PLAYER 1");
    expect(v.duke).toBe(1);
    expect(v.dukeCheeks).toBe(5);
  });

  it("near-tie L falls through to best-rating tiebreak, then draw", () => {
    let d = startDuel();
    for (let i = 0; i < 5; i++) {
      d = recordDuelPull(d, card(`x${i}`, 75), null, 0.095, 0.09);
      d = advanceDuel(d);
      d = recordDuelPull(d, card(`y${i}`, 75), null, 0.095, 0.09);
      d = advanceDuel(d);
    }
    // identical luck → tiebreak on best rating → equal → peaks equal → draw
    expect(duelVerdict(d).winner).toBeNull();
    expect(duelVerdict(d).line).toBe("FATE IS COWARDLY — DRAW.");
  });
});
