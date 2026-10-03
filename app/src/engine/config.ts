import type { Tier } from "@/data/schema";

export type Odds = Record<"common" | "rare" | "elite" | "legend", number>; // percents, sum 100

export interface PackSpec {
  size: number;
  cost: number;
  odds: Odds;
  guaranteedRareOrBetter?: boolean;
}

export const PACK_CONFIG = {
  standard: { size: 5, cost: 100, odds: { common: 75, rare: 20, elite: 4.5, legend: 0.5 } },
  premium: { size: 3, cost: 250, odds: { common: 45, rare: 40, elite: 12, legend: 3 }, guaranteedRareOrBetter: true },
  theme: { size: 5, cost: 150, odds: { common: 65, rare: 27, elite: 6.5, legend: 1.5 } },
} satisfies Record<string, PackSpec>;

export const DUPE_VALUES: Record<Tier, number> = { common: 10, rare: 25, elite: 75, legend: 200, xfactor: 200 };
export const XFACTOR_SHARE = 0.2;   // share of legend hits drawn from the xfactor pool
export const FAKEOUT_CHANCE = 0.125; // chance a pack gets one troll/gem fake-out reveal
export const STARTING_COINS = 500;
export const TIER_RANK: Record<Tier, number> = { common: 0, rare: 1, elite: 2, legend: 3, xfactor: 4 };
