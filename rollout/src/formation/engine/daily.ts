import type { GameState, SideState } from "./game";

/**
 * The daily: today's game, one attempt, same for everyone on the same data version.
 * Phase B derives the seed on-device (spec §11-B); the phase-C Worker publishes sealed lineups.
 * All functions are pure — dates come in as `YYYY-MM-DD` strings (local days), never computed from
 * the clock inside this module (tests and callers inject them).
 */

/** Local calendar day as `YYYY-MM-DD`. */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Yesterday of a `YYYY-MM-DD` local day, as a local day (never UTC math). */
function prevDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

/** Same game for every player on the same day + roster snapshot. */
export const dailySeed = (day: string, dataVersion: string): string => `fm-daily:${day}:${dataVersion}`;

// ── published dailies (phase C: the Worker's sealed envelope) ────────────────
export interface PubPlayer {
  team: string; side: "off" | "def"; key: string; label: string; pos: string; jersey: number; ini: string;
  fullName: string; college: string; rating: number; playerId: string; stamp: "P" | "M" | "C"; cls: "common" | "skill" | "jack";
}
export interface DailyPayload {
  day: string; dataVersion: string; seed: string;
  quarters: { offense: string; defense: string; lineups: { off: PubPlayer[]; def: PubPlayer[] } }[];
}

/** Streak arithmetic: yesterday keeps it alive, today is idempotent, any gap resets to 1. */
export function nextStreak(streak: number, lastPlayedDay: string | null, todayDay: string): number {
  if (lastPlayedDay === todayDay) return Math.max(1, streak);
  if (lastPlayedDay === prevDay(todayDay)) return streak + 1;
  return 1;
}

export interface DailyResult { score: number; quartersSolved: number; perfects: number; turnovers: number; day: string }
export interface DailyState {
  day: string; // the day this state belongs to
  seed: string;
  streak: number; // streak INCLUDING today's finish (maintained on finish)
  lastPlayedDay: string | null;
  result: DailyResult | null; // set once; presence = today's attempt is spent
}

export const freshDaily = (): DailyState => ({ day: "", seed: "", streak: 0, lastPlayedDay: null, result: null });

/** Begin today's attempt. Idempotent per day: a started or finished day is never re-rolled. */
export function startDaily(state: DailyState, day: string, dataVersion: string): DailyState {
  if (state.day === day) return state; // same day: one attempt, whatever its progress
  return { ...state, day, seed: dailySeed(day, dataVersion), result: null };
}

/** Record today's result and fold the streak in. */
export function finishDaily(state: DailyState, result: DailyResult): DailyState {
  const streak = nextStreak(state.streak, state.lastPlayedDay, result.day);
  return { ...state, streak, lastPlayedDay: result.day, result };
}

/** One quarter of a published daily as a fresh GameState — no local dataset touched. */
export function gameFromPayload(payload: DailyPayload, quarterIndex: number): GameState {
  const q = payload.quarters[Math.min(quarterIndex, payload.quarters.length - 1)];
  const side = (team: string, lineup: PubPlayer[]): SideState => ({
    team,
    lineup: lineup.map((p) => ({ ...p })),
    slots: lineup.map(() => ({ layer: 0, fd: false, sealed: false, ghost: false, pending: false })),
    solved: false,
    out: [],
    wrongCalls: 0,
  });
  return {
    seed: payload.seed,
    quarter: quarterIndex + 1,
    sides: [side(q.offense, q.lineups.off), side(q.defense, q.lineups.def)],
    pulls: 0, downs: 4, chips: 0, noHuddle: false, film: false,
    schemes: { starPower: false, scouting: false },
    over: null, total: 0, perfects: 0, quartersSolved: 0, turnovers: 0, flags: 0,
    log: [],
  };
}

/** Deal the payload's next quarter, carrying chips/schemes/counters (mirrors nextQuarter's carries). */
export function nextPublishedQuarter(state: GameState, payload: DailyPayload): boolean {
  if (!state.over || state.quarter >= 4) return false;
  const carry = {
    seed: state.seed, chips: state.chips, perfects: state.perfects, total: state.total,
    quartersSolved: state.quartersSolved, turnovers: state.turnovers, schemes: state.schemes,
  };
  const next = gameFromPayload({ ...payload, seed: state.seed }, state.quarter);
  Object.assign(state, next, carry, { quarter: state.quarter + 1, flags: 0 });
  return true;
}
