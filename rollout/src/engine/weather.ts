// Stage weather: ambient consequence, derived from live stats — never stored,
// so Reset Everything clears the sky automatically.

export interface Weather {
  motes: number;          // drifting gold dust particles (0 = clear)
  leafEveryMs: number | null; // sad-leaf cadence (null = no atomics yet)
  gloom: 0 | 1 | 2;       // brown tint ladder on cheek streaks
}

export const WEATHER_MOTE_CAP = 18;

export function weatherOf(peaks: number, atomics: number, cheekStreak: number): Weather {
  return {
    motes: peaks === 0 ? 0 : Math.min(WEATHER_MOTE_CAP, 6 + peaks * 3),
    leafEveryMs: atomics === 0 ? null : atomics === 1 ? 40_000 : 20_000,
    gloom: cheekStreak >= 8 ? 2 : cheekStreak >= 5 ? 1 : 0,
  };
}
