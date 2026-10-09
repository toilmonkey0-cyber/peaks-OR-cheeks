import type { Card, Tier } from "@/data/schema";
import type { SourceStats } from "@/storage/storage";
import { CHEEKS_MAX_RATING, PEAK_MIN_RATING } from "./config";
import { tierMassOf } from "./draw";

/**
 * True per-pull probability of each verdict for a given pool (filter-aware).
 * Uses the SAME tier resolution as the draw (tierMassOf) so expected rates
 * and actual draws can never drift apart — including the degenerate-tier
 * any-bucket, which samples verdict probability uniformly from the pool.
 */
export function poolVerdictRates(pool: Card[]): { pPeak: number; pCheeks: number } {
  if (pool.length === 0) return { pPeak: 0, pCheeks: 0 };
  const { tier, any } = tierMassOf(pool);
  const members: Record<Tier, Card[]> = { legend: [], elite: [], rare: [], common: [] };
  for (const c of pool) members[c.tier].push(c);
  let pPeak = 0, pCheeks = 0;
  for (const t of Object.keys(tier) as Tier[]) {
    const n = members[t].length;
    if (!n || !tier[t]) continue;
    pPeak += (tier[t] as number) * members[t].filter((c) => c.rating >= PEAK_MIN_RATING).length / n;
    pCheeks += (tier[t] as number) * members[t].filter((c) => c.rating <= CHEEKS_MAX_RATING).length / n;
  }
  pPeak += any * pool.filter((c) => c.rating >= PEAK_MIN_RATING).length / pool.length;
  pCheeks += any * pool.filter((c) => c.rating <= CHEEKS_MAX_RATING).length / pool.length;
  return { pPeak, pCheeks };
}

export const MIN_LUCK_PULLS = 20;

export interface LuckReading {
  /** null until enough evidence; otherwise -3..+3 (positive = blessed) */
  L: number | null;
  zPeak: number;
  zCheeks: number;
}

/** You vs what fate owed you: z(peak surplus) − z(cheek surplus). */
export function luckIndex(s: SourceStats): LuckReading {
  const sdP = Math.sqrt(s.varP), sdC = Math.sqrt(s.varC);
  if (s.pulls < MIN_LUCK_PULLS || sdP < 0.001 || sdC < 0.001) return { L: null, zPeak: 0, zCheeks: 0 };
  const zPeak = (s.peaks - s.peaksExp) / sdP;
  const zCheeks = (s.cheeks - s.cheeksExp) / sdC;
  return { L: Math.max(-3, Math.min(3, zPeak - zCheeks)), zPeak, zCheeks };
}

/** Full gamer ladder — deadpan by way of the group chat. */
export function luckTitle(L: number | null, pulls: number): string {
  if (L === null) return `GATHERING EVIDENCE · ${pulls}/${MIN_LUCK_PULLS}`;
  if (L >= 2.5) return "CERTIFIED HIM";
  if (L >= 1.5) return "COOKING";
  if (L >= 0.75) return "LOWKEY BLESSED";
  if (L > -0.75) return "MID";
  if (L > -1.5) return "DOGWATER FORTUNE";
  if (L > -2.5) return "COOKED";
  return "SCIENTIFICALLY COOKED";
}
