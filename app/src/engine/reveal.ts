import type { Card } from "@/data/schema";
import { TIER_RANK, FAKEOUT_CHANCE, GEM_MIN_RANK, FAKEOUT_SPLIT } from "./config";

export type RevealScript = "standard" | "escalated" | "troll" | "gem";

export function orderCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) =>
    TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.rating - b.rating);
}

const isBig = (c: Card) => TIER_RANK[c.tier] >= 2; // elite | legend | xfactor

export function assignScripts(cards: Card[], rng: () => number): RevealScript[] {
  const scripts: RevealScript[] = cards.map((c) => (isBig(c) ? "escalated" : "standard"));
  if (rng() >= FAKEOUT_CHANCE) return scripts;

  const commonIdx = cards.map((c, i) => (c.tier === "common" ? i : -1)).filter((i) => i >= 0);
  const last = cards.length - 1;
  const rarestIsBig = cards.length > 0 && isBig(cards[last]) && TIER_RANK[cards[last].tier] >= GEM_MIN_RANK;

  if (rarestIsBig && commonIdx.length > 0) {
    if (rng() < FAKEOUT_SPLIT) scripts[last] = "gem";
    else scripts[commonIdx[Math.floor(rng() * commonIdx.length)]] = "troll";
  } else if (rarestIsBig) {
    scripts[last] = "gem";
  } else if (commonIdx.length > 0) {
    scripts[commonIdx[Math.floor(rng() * commonIdx.length)]] = "troll";
  }
  return scripts;
}
