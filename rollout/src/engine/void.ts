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
  ARI: { name: "DRY HEAT", archetype: "bird" },
  ATL: { name: "HOTLANTA", archetype: "bird" },
  BAL: { name: "CHARM CITY", archetype: "bird" },
  BUF: { name: "BUFFALO WINGS", archetype: "reptile" },
  CAR: { name: "QUEEN CITY", archetype: "feline" },
  CHI: { name: "WINDY CITY", archetype: "ursa" },
  CIN: { name: "THE NATTI", archetype: "feline" },
  CLE: { name: "THE LAND", archetype: "canine" },
  DAL: { name: "BIG D", archetype: "hoof" },
  DEN: { name: "THE MILE HIGH", archetype: "hoof" },
  DET: { name: "MOTOR CITY", archetype: "feline" },
  GB: { name: "CHEESEHEAD", archetype: "canine" },
  HOU: { name: "H-TOWN", archetype: "hoof" },
  IND: { name: "THE 500", archetype: "hoof" },
  JAX: { name: "THE RIVER WALK", archetype: "feline" },
  KC: { name: "BBQ NATION", archetype: "canine" },
  LA: { name: "LA LA LAND", archetype: "hoof" },
  LAC: { name: "BOLT UP", archetype: "hoof" },
  LV: { name: "SIN CITY", archetype: "canine" },
  MIA: { name: "THE MAGIC", archetype: "reptile" },
  MIN: { name: "TWIN CITIES", archetype: "canine" },
  NE: { name: "FOXBORO", archetype: "bird" },
  NO: { name: "JAZZ", archetype: "reptile" },
  NYG: { name: "BIG APPLE", archetype: "reptile" },
  NYJ: { name: "GANG GREEN", archetype: "bird" },
  PHI: { name: "BROTHERLY LOVE", archetype: "bird" },
  PIT: { name: "STEEL CURTAIN", archetype: "bird" },
  SF: { name: "GOLD RUSH", archetype: "feline" },
  SEA: { name: "THE 12s", archetype: "bird" },
  TB: { name: "CUDAZONIA", archetype: "canine" },
  TEN: { name: "MUSIC CITY", archetype: "feline" },
  WAS: { name: "DMV", archetype: "ursa" },
};

/** Hand-made mascot art (relative paths — works under the Pages subpath).
 *  Missing entries fall back to procedural CreatureCanvas art. */
export const MASCOT_ART: Record<string, string> = {
  ARI: "mascots/ari.png",
  ATL: "mascots/atl.png",
  BAL: "mascots/bal.png",
  BUF: "mascots/buf.png",
  CAR: "mascots/car.png",
  CHI: "mascots/chi.png",
  CIN: "mascots/cin.png",
  CLE: "mascots/cle.png",
  DAL: "mascots/dal.png",
  DEN: "mascots/den.png",
  DET: "mascots/det.png",
  GB: "mascots/gb.png",
  HOU: "mascots/hou.png",
  IND: "mascots/ind.png",
  JAX: "mascots/jax.png",
  KC: "mascots/kc.png",
  LA: "mascots/la.png",
  LAC: "mascots/lac.png",
  LV: "mascots/lv.png",
  MIA: "mascots/mia.png",
  MIN: "mascots/min.png",
  NE: "mascots/ne.png",
  NO: "mascots/no.png",
  NYG: "mascots/nyg.png",
  NYJ: "mascots/nyj.png",
  PHI: "mascots/phi.png",
  PIT: "mascots/pit.png",
  SF: "mascots/sf.png",
  SEA: "mascots/sea.png",
  TB: "mascots/tb.png",
  TEN: "mascots/ten.png",
  WAS: "mascots/was.png",
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
