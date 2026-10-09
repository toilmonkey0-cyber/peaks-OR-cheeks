// HIGHER / LOWER: the stat gauntlet. Universal core stats only, so every
// comparison is fair — both players always own the stat being called.
import type { Card } from "@/data/schema";
import { makeRng } from "./rng";

export const CORE_STATS = ["SPD", "ACC", "AGI", "STR", "JMP", "AWR"] as const;
export type CoreStat = (typeof CORE_STATS)[number];

export interface HLState {
  current: Card;
  stat: CoreStat;
  streak: number;
  best: number;
  rounds: number;
}

export type Call = "higher" | "lower";

export interface HLResult {
  next: Card;
  nextValue: number;
  currentValue: number;
  outcome: "correct" | "wrong" | "push";
  state: HLState; // advanced for correct/push; streak zeroed on wrong
}

export function startHL(pool: Card[], seed: string): HLState {
  const rng = makeRng(seed);
  const current = pool[Math.floor(rng() * pool.length)];
  const stat = CORE_STATS[Math.floor(rng() * CORE_STATS.length)];
  return { current, stat, streak: 0, best: 0, rounds: 0 };
}

/** Rotate to a fresh stat + the revealed player becomes the new current. */
function advance(s: HLState, revealed: Card, keepStreak: boolean, rng: () => number): HLState {
  const stat = CORE_STATS[Math.floor(rng() * CORE_STATS.length)];
  return {
    current: revealed,
    stat,
    streak: keepStreak ? s.streak : 0,
    best: s.best,
    rounds: s.rounds + 1,
  };
}

export function callHL(s: HLState, next: Card, guess: Call, seed: string): HLResult {
  const rng = makeRng(seed);
  const currentValue = s.current.coreStats[s.stat];
  const nextValue = next.coreStats[s.stat];
  const outcome: HLResult["outcome"] =
    nextValue === currentValue ? "push" : (nextValue > currentValue) === (guess === "higher") ? "correct" : "wrong";
  const streak = outcome === "wrong" ? 0 : s.streak + (outcome === "correct" ? 1 : 0);
  const state = { ...advance(s, next, outcome !== "wrong", rng), streak };
  return { next, nextValue, currentValue, outcome, state: { ...state, best: Math.max(s.best, streak) } };
}
