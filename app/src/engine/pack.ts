import type { Card, Snapshot, Tier } from "@/data/schema";
import { makeRng } from "./rng";
import { orderCards, assignScripts, type RevealScript } from "./reveal";
import { PACK_CONFIG, DUPE_VALUES, TIER_RANK, XFACTOR_SHARE, type PackSpec } from "./config";

export type { RevealScript };
export type PackType = keyof typeof PACK_CONFIG;
export type DupeConversion = { playerId: string; coins: number };
export type PackResult = { cards: Card[]; scripts: RevealScript[]; dupesConverted: DupeConversion[] };

function pickTier(rng: () => number, odds: Record<string, number>): "common" | "rare" | "elite" | "legend" {
  const roll = rng() * 100;
  let acc = 0;
  for (const tier of ["common", "rare", "elite", "legend"] as const) {
    acc += odds[tier];
    if (roll < acc) return tier;
  }
  return "legend";
}

function pickCard(pool: Card[], rng: () => number): Card | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

export function openPack(args: {
  packType: PackType; seed: string; ownedIds: ReadonlySet<string>;
  snapshot: Snapshot; themePositions?: string[];
}): PackResult {
  const spec: PackSpec = PACK_CONFIG[args.packType];
  const rng = makeRng(args.seed);
  const base = args.themePositions && args.packType === "theme"
    ? args.snapshot.players.filter((p) => args.themePositions!.includes(p.position))
    : args.snapshot.players;
  const pool = base.length >= spec.size ? base : args.snapshot.players; // widen tiny themes
  const xfactorPool = pool.filter((p) => args.snapshot.xfactorIds.includes(p.playerId));
  const picked: Card[] = [];
  const pickedIds = new Set<string>();

  for (let i = 0; i < spec.size; i++) {
    let tier: Tier = pickTier(rng, spec.odds);
    if (tier === "legend" && xfactorPool.length > 0 && rng() < XFACTOR_SHARE) tier = "xfactor";
    let card = pickCard(pool.filter((c) => c.tier === tier && !pickedIds.has(c.playerId)), rng)
      ?? pickCard(pool.filter((c) => !pickedIds.has(c.playerId)), rng) // tier out of new players -> any unpicked
      ?? pickCard(pool, rng); // entire pool already in this pack -> slot never empty
    // reroll-once applies to the HIT: a legend/xfactor card is worth rerolling
    // wherever it came from (tier pool, unpicked fallback, or promotion)
    if (card && (card.tier === "legend" || card.tier === "xfactor") && args.ownedIds.has(card.playerId)) {
      const tierOfHit = card.tier;
      const reroll = pickCard(
        pool.filter((c) => c.tier === tierOfHit && !args.ownedIds.has(c.playerId) && !pickedIds.has(c.playerId)),
        rng,
      );
      if (reroll) card = reroll; // else keep dupe; it converts below
    }
    if (card) {
      picked.push(card);
      pickedIds.add(card.playerId);
    }
  }

  if (spec.guaranteedRareOrBetter && picked.every((c) => TIER_RANK[c.tier] === 0)) {
    const upgrade = pickCard(pool.filter((c) => TIER_RANK[c.tier] >= 1), rng);
    if (upgrade) picked[picked.length - 1] = upgrade;
  }

  const cards = orderCards(picked);
  const dupesConverted = cards
    .filter((c) => args.ownedIds.has(c.playerId))
    .map((c) => ({ playerId: c.playerId, coins: DUPE_VALUES[c.tier] }));
  return { cards, scripts: assignScripts(cards, rng), dupesConverted };
}
