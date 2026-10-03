import type { Card } from "@/data/schema";
import type { RevealScript } from "@/engine/reveal";
import { TIER_RANK } from "@/engine/config";

// spec §7 tell ladder — pre-flip appearance derived from (script, tier):
// gem fakes dull, troll fakes gold; otherwise the real tier's tell.
export function apparentClass(card: Card, script: RevealScript): string {
  if (script === "gem") return "apparent-dull";
  if (script === "troll") return "apparent-gold";
  const rank = TIER_RANK[card.tier];
  if (rank >= 3) return "apparent-gold";   // legend | xfactor
  if (rank === 2) return "apparent-blue";  // elite — "strong vibration" tier
  if (rank === 1) return "apparent-mid";   // rare
  return "apparent-subtle";                // common — faint shimmer
}
