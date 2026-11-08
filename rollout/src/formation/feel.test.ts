import { describe, expect, it } from "vitest";
import { HAPTICS } from "@/haptics/haptics";
import * as feel from "./feel";
import * as game from "./engine/game";

describe("feel: the one tuning file", () => {
  it("holds the spec's initial values (spec §13)", () => {
    expect(feel.WEIGHTS).toEqual({ common: 3, skill: 2, jack: 1 });
    expect(feel.TURNOVER_PENALTY).toBe(70);
    expect(feel.PEAK_QUARTER_PULLS).toBe(8);
    expect(feel.SCOUTING_CROSSES).toBe(3);
    expect(feel.SCHEME_PRICES).toEqual({ starPower: 2, scouting: 3 });
    expect(feel.FULL_CHARGE_MS).toBe(1400);
    expect([feel.BREATH_MIN, feel.BREATH_MAX]).toEqual([0.9, 3.0]);
    expect(feel.PERFECT_SIN).toBe(0.75);
    expect([feel.REEL_FIRST_MS, feel.REEL_MS, feel.FLIGHT_MS]).toEqual([950, 620, 560]);
    expect([feel.VERDICT_PLAIN_MS, feel.VERDICT_BIG_MS]).toEqual([430, 780]);
    expect([feel.CONFIRMED_WAVE_STAGGER_MS, feel.FLAT_DEAD_AIR_MS, feel.FLAT_HOLD_MS]).toEqual([75, 380, 750]);
    expect([feel.CONFIRMED_PRE_WAVE_MS, feel.CONFIRMED_LINGER_MS, feel.TURNOVER_HOLD_MS]).toEqual([300, 640, 1200]);
    expect([feel.LANDING_BEAT_MS, feel.REEL_TAIL_MS, feel.REEL_TICK_MS, feel.REEL_TICK_RM_MS]).toEqual([200, 110, 75, 40]);
  });

  it("is the engine's source of truth (game re-exports the same objects)", () => {
    expect(game.WEIGHTS).toBe(feel.WEIGHTS);
    expect(game.SCHEME_PRICES).toBe(feel.SCHEME_PRICES);
    expect(game.TURNOVER_PENALTY).toBe(feel.TURNOVER_PENALTY);
  });

  it("names a real haptic pattern for every formation moment", () => {
    for (const name of ["formationTick", "formationLand", "formationPerfect", "formationFlat", "formationWave", "formationPeak", "formationCheeks"] as const) {
      expect(HAPTICS[name].length).toBeGreaterThan(0);
      expect(HAPTICS[name].every((ms) => Number.isInteger(ms) && ms > 0)).toBe(true);
    }
    expect(HAPTICS.formationPerfect).toEqual([10, 30, 10, 30, 80]);
    expect(HAPTICS.formationFlat).toEqual([28]);
    expect(HAPTICS.formationPeak).toEqual([20, 40, 20, 40, 90]);
    expect(HAPTICS.formationCheeks).toEqual([160]);
  });
});
