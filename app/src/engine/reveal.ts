import type { Card } from "@/data/schema";
import { TIER_RANK } from "./config";

export type RevealScript = "standard" | "escalated" | "troll" | "gem";

export function orderCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.rating - b.rating);
}

export function assignScripts(cards: Card[], _rng: () => number): RevealScript[] {
  return cards.map(() => "standard");
}
