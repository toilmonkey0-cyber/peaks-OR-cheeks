import type { Card, Tier } from "@/data/schema";
import { ATOMIC_CHEEKS_MAX_RATING, CHEEKS_MAX_RATING, DELAYS, MAX_PLAYER_SHARE, NEAR_MISS_CHANCE, NEAR_MISS_MIN_RATING, ODDS, PEAK_MIN_RATING, REEL_SIZE, TIER_RANK, isBigTier } from "./config";
import { makeRng } from "./rng";

export interface ReelEntry { name: string; tier: Tier; rating: number }

export interface ScanPlan {
  card: Card;
  tier: Tier;
  reel: ReelEntry[];          // last entry is always the winner
  nearMiss: ReelEntry | null; // 97+ name that flashes by, never lands
  delays: { pos: number; team: number; name: number; ovr: number };
  planSeed: string;
}

const TIER_ORDER: Tier[] = ["legend", "elite", "rare", "common"];

function pickUniform<T>(items: T[], r: number): T {
  return items[Math.min(items.length - 1, Math.floor(r * items.length))];
}

/**
 * Tier resolution shared by the draw AND the luck meter's expected rates so
 * the two can never drift. Empty tiers walk down (filtered pools can lack
 * legends). Then the concentration cap: if any resolved rare/common tier
 * would give a single player more than MAX_PLAYER_SHARE of draws, the whole
 * tier's mass moves to the any-bucket (uniform over the pool) — that is the
 * loop disease, whatever the tier's size. Legend/elite are always drawable:
 * small precious tiers are the point, not the disease.
 */
export interface TierMass {
  tier: Partial<Record<Tier, number>>; // fractions, per resolved tier
  any: number;                         // fraction drawn uniformly from the pool
}

export function tierMassOf(pool: Card[]): TierMass {
  const counts: Record<Tier, number> = { legend: 0, elite: 0, rare: 0, common: 0 };
  for (const c of pool) counts[c.tier]++;
  const out: Partial<Record<Tier, number>> = {};
  let any = 0;
  for (const drawn of TIER_ORDER) {
    const w = ODDS[drawn] / 100;
    const resolved = [drawn, ...TIER_ORDER.filter((x) => TIER_RANK[x] < TIER_RANK[drawn])]
      .find((t) => counts[t] > 0);
    if (!resolved) { any += w; continue; }
    out[resolved] = (out[resolved] ?? 0) + w;
  }
  for (const t of ["rare", "common"] as const) {
    const m = out[t] ?? 0;
    if (counts[t] > 0 && m / counts[t] > MAX_PLAYER_SHARE) {
      any += m;
      delete out[t];
    }
  }
  return { tier: out, any };
}

export function planScan(planSeed: string, pool: Card[]): ScanPlan {
  const rng = makeRng(planSeed);
  const mass = tierMassOf(pool);
  const r = rng();
  let acc = 0;
  let resolved: Tier | null = null; // null → any-bucket: uniform over the pool
  for (const t of TIER_ORDER) {
    acc += mass.tier[t] ?? 0;
    if (r < acc) { resolved = t; break; }
  }
  const inTier = resolved === null ? pool : pool.filter((c) => c.tier === resolved);
  const tier = resolved ?? (pool[pool.length - 1]?.tier ?? "common");
  const card = pickUniform(inTier, rng());

  // Near-miss decided first so the reel is always exactly REEL_SIZE.
  let nearMiss: ReelEntry | null = null;
  if (!isBigTier(tier) && rng() < NEAR_MISS_CHANCE) {
    const stars = pool.filter((c) => c.rating >= NEAR_MISS_MIN_RATING);
    if (stars.length) {
      const s = pickUniform(stars, rng());
      nearMiss = { name: s.name, tier: s.tier, rating: s.rating };
    }
  }

  // Filler names for the stream: anything but the winner (dup names allowed once).
  const fillers: ReelEntry[] = [];
  const used = new Set([card.playerId]);
  const fillerCount = REEL_SIZE - 1 - (nearMiss ? 1 : 0);
  while (fillers.length < fillerCount) {
    const c = pickUniform(pool, rng());
    if (used.has(c.playerId) && fillers.length < pool.length - 1) continue;
    used.add(c.playerId);
    fillers.push({ name: c.name, tier: c.tier, rating: c.rating });
  }
  // Fisher–Yates with the same rng
  for (let i = fillers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [fillers[i], fillers[j]] = [fillers[j], fillers[i]];
  }
  if (nearMiss) fillers.push(nearMiss); // lands second-to-last, one frame before the winner

  const winner: ReelEntry = { name: card.name, tier: card.tier, rating: card.rating };
  const reel = [...fillers, winner];

  const stretch = isBigTier(tier);
  return {
    card,
    tier,
    reel,
    nearMiss,
    delays: {
      pos: DELAYS.pos,
      team: DELAYS.team,
      name: DELAYS.name + (stretch ? DELAYS.nameStretch : 0),
      ovr: DELAYS.ovr,
    },
    planSeed,
  };
}

export function filterPool(players: Card[], groupPositions: string[] | null): Card[] {
  return groupPositions ? players.filter((c) => groupPositions.includes(c.position)) : players;
}

/** NO MIDS: drop every verdict-free rating (63–79). Pool-level, so the draw,
 *  expected rates, gauge, and streaks all stay coherent automatically. */
export const stripMids = (pool: Card[]): Card[] =>
  pool.filter((c) => c.rating <= CHEEKS_MAX_RATING || c.rating >= PEAK_MIN_RATING);
// ── verdicts ────────────────────────────────────────────────────────────────
export type Verdict = "peak" | "cheeks" | "atomic" | null;

export function verdictOf(card: Card): Verdict {
  if (card.rating >= PEAK_MIN_RATING) return "peak";
  if (card.rating <= ATOMIC_CHEEKS_MAX_RATING) return "atomic";
  if (card.rating <= CHEEKS_MAX_RATING) return "cheeks";
  return null;
}

/** Streak rule: cheeks/atomic extend it, peaks break it, middles are forgettable. */
export function nextCheekStreak(current: number, verdict: Verdict): number {
  if (verdict === "peak") return 0;
  if (verdict === "cheeks" || verdict === "atomic") return current + 1;
  return current;
}

