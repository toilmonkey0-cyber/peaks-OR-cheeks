import type { Card, Tier } from "@/data/schema";
import { ATOMIC_CHEEKS_MAX_RATING, CHEEKS_MAX_RATING, DELAYS, NEAR_MISS_CHANCE, NEAR_MISS_MIN_RATING, ODDS, PEAK_MIN_RATING, REEL_SIZE, TIER_RANK, isBigTier } from "./config";
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

function drawTier(r: number): Tier {
  // weighted walk over ODDS (percent, sums to 100)
  let acc = 0;
  for (const t of TIER_ORDER) {
    acc += ODDS[t];
    if (r < acc) return t;
  }
  return "common";
}

function pickUniform<T>(items: T[], r: number): T {
  return items[Math.min(items.length - 1, Math.floor(r * items.length))];
}

/** Highest non-empty tier at-or-below the drawn one (filtered pools can lack legends). */
function degradeTier(pool: Card[], tier: Tier): Tier {
  for (const t of [tier, ...TIER_ORDER.filter((x) => TIER_RANK[x] < TIER_RANK[tier])]) {
    if (pool.some((c) => c.tier === t)) return t;
  }
  return "common";
}

export function planScan(planSeed: string, pool: Card[]): ScanPlan {
  const rng = makeRng(planSeed);
  const tier = degradeTier(pool, drawTier(rng() * 100));
  const inTier = pool.filter((c) => c.tier === tier);
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

