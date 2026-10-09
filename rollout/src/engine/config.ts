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
export const PULL_LOG_MAX = 60;
// A resolved rare/common tier with fewer players than this is degenerate
// (e.g. NO MIDS + WR: exactly ONE cheeks-eligible receiver) — its mass
// redistributes uniformly over the whole pool instead of looping one card.
export const MIN_TIER_POOL = 5;      // per-pull log cap (luck strip + vault)

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

// ── Verdicts: the celebration layer (decoupled from tiers) ─────────────────
// Peak 80+ mirrors cheeks ≤62 (~9% each); atomic ≤58 is as rare as a 99.
export const PEAK_MIN_RATING = 80;
export const CHEEKS_MAX_RATING = 62;
export const ATOMIC_CHEEKS_MAX_RATING = 58;

// The judgment beat: silence between the OVR lock and the celebration.
export const VERDICT_BEAT_MS = 400;
export const CELEBRATION_MS = { peak: 2100, cheeks: 2400, atomic: 2900 } as const;

// PG-13, deadpan-forward; "He is ass." stays in the pool so it lands ~1 in 20.
export const CHEEKS_LINES = [
  "He is ass.",
  "Mom doesn't even come to his games anymore.",
  "Bad at sports. Period.",
  "The reel has spoken.",
  "My condolences.",
  "That's a mentorship-presence kind of pull.",
  "Tragic. Genuinely.",
  "Somewhere, a scout got fired.",
  "The card tried its best.",
  "Framed… in a cautionary way.",
  "He plays like the controller is dead.",
  "His highlight reel is a moment of silence.",
  "Traded for a conditional seventh. The condition was 'no.'",
  "The mascot gets more targets.",
  "He couldn't start on a bye week.",
  "His dad watches from the car.",
  "The film session skips his plays to save time.",
  "His 40 time needs a halftime.",
  "Special teams. Very special.",
  "He was a healthy scratch. In a video game.",
  "Fantasy managers drafted him by accident. On purpose, never.",
  "Scouts use him as a cautionary PowerPoint.",
] as const;
export const ATOMIC_CHEEKS_LINES = [
  "Scientists are studying this pull.",
  "This is the rarest thing that can happen to you today.",
  "Historically bad. Museum-grade cheeks.",
  "A 54 is as rare as a 99. The universe has jokes.",
  "The reel didn't miss. It aimed.",
  "Fate saw you coming.",
  "The house is blushing.",
  "Printed on recycled disappointment.",
  "Frame it. As a warning to others.",
  "This card has been reported to the authorities.",
  "The manufacturing process apologized.",
  "Chemistry can't explain this. Neither can the film.",
] as const;
export const PEAK_LINES = [
  "Certified dude.",
  "Your group chat is about to be unwell.",
  "Frame it. Immediately.",
  "Somebody screenshot this before it un-happens.",
  "He doesn't do push-ups. He pushes the Earth down.",
  "He doesn't read playbooks. Playbooks study him.",
  "He doesn't wear the helmet. The helmet wears him for protection.",
  "The injury report once had a near-him experience.",
  "He can stiff-arm a revolving door.",
  "He counts to infinity twice. Before kickoff.",
  "Bigfoot's phone wallpaper is this guy.",
  "Defenses game-plan for him during their bye week.",
  "He doesn't celebrate touchdowns. Touchdowns celebrate him.",
  "The Hall of Fame keeps his measurements on file. Just in case.",
  "His jersey number retired itself.",
  "He once trucked a defender into next season.",
  "The G.O.A.T. debate asked him to mediate.",
  "His 40-yard dash was clocked by air traffic control.",
  "The rulebook has a chapter titled 'Regarding Him.'",
  "He doesn't watch film. Film confesses.",
  "The entire playbook is 'give it to him.'",
] as const;
export const STREAK_LINES: Record<number, string> = {
  3: "3 straight cheeks. Seek help.",
  5: "5 straight. The house is laughing.",
  7: "7 straight. Unprecedented despair.",
  10: "10 straight. Consider gardening.",
};

export const TIER_ACCENT: Record<Tier, string> = {
  common: "#8b98ad",
  rare: "#38bdf8",
  elite: "#a78bfa",
  legend: "#fbbf24",
};

