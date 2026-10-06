import type { Tier } from "@/data/schema";

// ── The disguised slot: all presentation, odds live here ────────────────────
export const ODDS: Record<Tier, number> = { common: 60.5, rare: 30, elite: 8, legend: 1.5 };

// Near-miss: only on common/rare results, a 97+ name flashes through the final
// deceleration and never lands. Slot psychology, one per scan max.
export const NEAR_MISS_CHANCE = 1 / 7;
export const NEAR_MISS_MIN_RATING = 97;

// Lock sequence (ms from fire). NAME is the last "reel": it stretches when the
// locked tier is elite+ — the anticipation window.
export const DELAYS = {
  pos: 900,
  team: 1900,
  name: 2900,
  nameStretch: 1600,
  ovr: 640,
} as const;

export const REEL_SIZE = 30;         // names in the stream (incl. winner last)
export const HISTORY_MAX = 12;

export const TIER_RANK: Record<Tier, number> = { common: 0, rare: 1, elite: 2, legend: 3 };
export const isBigTier = (t: Tier) => TIER_RANK[t] >= TIER_RANK.elite;

// Position-group filter chips (the "weighted reels"). Keys are chip labels.
export const GROUPS: Record<string, string[] | null> = {
  ALL: null,
  QB: ["QB"],
  RB: ["HB", "FB"],
  WR: ["WR"],
  TE: ["TE"],
  OL: ["LT", "LG", "C", "RG", "RT"],
  EDGE: ["LEDG", "REDG"],
  LB: ["SAM", "MIKE", "WILL"],
  DL: ["DT"],
  DB: ["CB", "FS", "SS"],
  ST: ["K", "P", "LS"],
};

export const TIER_ACCENT: Record<Tier, string> = {
  common: "#8b98ad",
  rare: "#38bdf8",
  elite: "#a78bfa",
  legend: "#fbbf24",
};
