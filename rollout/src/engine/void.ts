// THE VOID: what happens when the pool is empty. The house deals from its
// private collection — 32 mascot slots (fixed, collect-them-all) plus
// procedural ghost manifestations (infinite, unique every time).
import type { Team } from "@/data/schema";
import { makeRng } from "./rng";

export interface GhostCard {
  kind: "ghost";
  id: string;
  code: string;          // NVL-07
  title: string;         // "THE ABSENCE"
  stats: { label: string; value: number }[];
  foundAt: number;
}

export interface MascotCard {
  kind: "mascot";
  id: string;            // abbr
  name: string;          // "THE SOMBRERO JACKALOPE"
  archetype: "bird" | "feline" | "ursa" | "hoof" | "canine" | "reptile";
  foundAt: number;
}

export type VoidEntry = GhostCard | MascotCard;

const GHOST_TITLES = [
  "THE ABSENCE", "THE ECHO", "THE STATIC", "THE HOLLOW", "THE VESPER",
  "THE MIRAGE", "THE ZERO", "THE WHISPER", "THE SEAM", "THE FRACTURE",
  "THE PAUSE", "THE UNANSWERED", "THE FOOTNOTE", "THE DRAFT NIGHT SLIP",
  "THE MISSED ASSIGNMENT", "THE CLIPBOARD",
] as const;

export const GHOST_STAT_LABELS = ["SPD", "ACC", "AGI", "STR", "JMP", "AWR"] as const;

/** The house's 32 — original creatures in team colors, never licensed marks. */
export const MASCOTS: Record<string, { name: string; archetype: MascotCard["archetype"] }> = {
  ARI: { name: "THE CARDINAL CODGER", archetype: "bird" },
  ATL: { name: "THE FALCON FLEDGLING", archetype: "bird" },
  BAL: { name: "THE HARBOR RAVEN", archetype: "bird" },
  BUF: { name: "THE LAKE MONSTER", archetype: "reptile" },
  CAR: { name: "THE PANTHER PROWLER", archetype: "feline" },
  CHI: { name: "THE WINDY BEAR", archetype: "ursa" },
  CIN: { name: "THE RIVER STRIPE", archetype: "feline" },
  CLE: { name: "THE DAWG POUND POOCH", archetype: "canine" },
  DAL: { name: "THE LONE STAR STEER", archetype: "hoof" },
  DEN: { name: "THE THUNDER GOAT", archetype: "hoof" },
  DET: { name: "THE MOTOR CITY LION", archetype: "feline" },
  GB: { name: "THE CHEESEHEAD WOLF", archetype: "canine" },
  HOU: { name: "THE ASTRO LONGHORN", archetype: "hoof" },
  IND: { name: "THE BRICKYARD STALLION", archetype: "hoof" },
  JAX: { name: "THE SWAMP JAGUAR", archetype: "feline" },
  KC: { name: "THE PRAIRIE WOLF", archetype: "canine" },
  LA: { name: "THE RAMSHACKLE RAM", archetype: "hoof" },
  LAC: { name: "THE BOLT BISON", archetype: "hoof" },
  LV: { name: "THE DESERT OUTLAW", archetype: "canine" },
  MIA: { name: "THE TIDE FIN", archetype: "reptile" },
  MIN: { name: "THE NORTH SKY WOLF", archetype: "canine" },
  NE: { name: "THE MINUTEMAN OWL", archetype: "bird" },
  NO: { name: "THE JAZZ GATOR", archetype: "reptile" },
  NYG: { name: "THE SKYLINE LIZARD", archetype: "reptile" },
  NYJ: { name: "THE RUNWAY FALCON", archetype: "bird" },
  PHI: { name: "THE LIBERTY RAPTOR", archetype: "bird" },
  PIT: { name: "THE FORGE OWL", archetype: "bird" },
  SF: { name: "THE FORTY-NINER PANTHER", archetype: "feline" },
  SEA: { name: "THE SALMON SEA-HAWK", archetype: "bird" },
  TB: { name: "THE GULF BUCCANEER", archetype: "canine" },
  TEN: { name: "THE RIVERBOAT CAT", archetype: "feline" },
  WAS: { name: "THE POTOMAC BOAR", archetype: "ursa" },
};

export function makeGhost(seed: string): GhostCard {
  const rng = makeRng(seed);
  const n = String(Math.floor(rng() * 89) + 10);
  const title = GHOST_TITLES[Math.floor(rng() * GHOST_TITLES.length)];
  const stats = GHOST_STAT_LABELS.map((label) => ({ label, value: Math.floor(rng() * 100) }));
  return { kind: "ghost", id: `ghost-${seed}`, code: `NVL-${n}`, title, stats, foundAt: Date.now() };
}

export const MASCOT_CHANCE = 0.6;

/** What the house deals: first visit is always a ghost; later visits favor
 *  unrecovered mascots, with ghosts as infinite manifestations. */
export function dealFromTheHouse(
  seed: string, collectedIds: string[], teams: Team[],
): VoidEntry {
  const rng = makeRng(seed);
  const firstVisit = collectedIds.length === 0;
  const missing = Object.keys(MASCOTS).filter((abbr) => !collectedIds.includes(abbr));
  if (!firstVisit && missing.length > 0 && rng() < MASCOT_CHANCE) {
    const abbr = missing[Math.floor(rng() * missing.length)];
    void teams;
    return { kind: "mascot", id: abbr, name: MASCOTS[abbr].name, archetype: MASCOTS[abbr].archetype, foundAt: Date.now() };
  }
  return makeGhost(`g-${seed}`);
}
