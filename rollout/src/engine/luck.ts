import type { Card, Tier } from "@/data/schema";
import type { SourceStats } from "@/storage/storage";
import { CHEEKS_MAX_RATING, ODDS, PEAK_MIN_RATING, TIER_RANK } from "./config";

const TIER_ORDER: Tier[] = ["legend", "elite", "rare", "common"];

/**
 * Probability mass that actually lands on each non-empty tier after
 * degradeTier redistribution (empty tiers fall through to lower tiers).
 */
function resolvedTierWeights(pool: Card[]): Record<Tier, number> {
  const counts: Record<Tier, number> = { legend: 0, elite: 0, rare: 0, common: 0 };
  for (const c of pool) counts[c.tier]++;
  const out: Record<Tier, number> = { legend: 0, elite: 0, rare: 0, common: 0 };
  for (const t of TIER_ORDER) {
    const resolved = [t, ...TIER_ORDER.filter((x) => TIER_RANK[x] < TIER_RANK[t])]
      .find((x) => counts[x] > 0);
    if (resolved) out[resolved] += ODDS[t] / 100; // ODDS are percents
  }
  return out;
}

/** True per-pull probability of each verdict for a given pool (filter-aware). */
export function poolVerdictRates(pool: Card[]): { pPeak: number; pCheeks: number } {
  const weights = resolvedTierWeights(pool);
  const members: Record<Tier, Card[]> = { legend: [], elite: [], rare: [], common: [] };
  for (const c of pool) members[c.tier].push(c);
  let pPeak = 0, pCheeks = 0;
  for (const t of TIER_ORDER) {
    const n = members[t].length;
    if (!n || !weights[t]) continue;
    pPeak += weights[t] * members[t].filter((c) => c.rating >= PEAK_MIN_RATING).length / n;
    pCheeks += weights[t] * members[t].filter((c) => c.rating <= CHEEKS_MAX_RATING).length / n;
  }
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
