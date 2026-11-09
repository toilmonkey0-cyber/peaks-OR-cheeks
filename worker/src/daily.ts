// The published daily: deterministic, self-contained — the client renders it with NO local data.
// Same (day, dataVersion, data) → byte-identical payload, so the first player to fetch locks it for everyone.

export interface PubPlayer {
  team: string; key: string; label: string; pos: string; jersey: number; ini: string;
  side: "off" | "def"; college: string; rating: number; playerId: string; stamp: "P" | "M" | "C"; cls: "common" | "skill" | "jack";
}
export interface WorkerData {
  dataVersion: string;
  teams: { abbr: string; name: string; city: string; primary: string; secondary: string }[];
  players: PubPlayer[]; // the 704 starters, cls/stamp precomputed (same rules as the app)
}
export interface DailyQuarter { offense: string; defense: string; lineups: { off: PubPlayer[]; def: PubPlayer[] } }
export interface DailyPayload {
  day: string; dataVersion: string; seed: string;
  quarters: DailyQuarter[];
}

export const dailySeed = (day: string, dataVersion: string): string => `fm-daily:${day}:${dataVersion}`;

/** Same hash as the app's rng (FNV-1a + mulberry32) — the worker picks identically without sharing code. */
function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const makeRng = (seed: string) => mulberry32(hashSeed(seed));

function pickTeams(teams: string[], rng: () => number): [string, string] {
  const sorted = [...teams].sort();
  const a = sorted[Math.floor(rng() * sorted.length)];
  const rest = sorted.filter((t) => t !== a);
  return [a, rest[Math.floor(rng() * rest.length)]];
}

/** Four quarters, two different hidden teams each — deterministic for (day, dataVersion, data). */
export function publishDaily(day: string, dataVersion: string, data: WorkerData): DailyPayload {
  if (data.teams.length < 2) throw new Error("not enough teams");
  const seed = dailySeed(day, dataVersion);
  const rng = makeRng(seed);
  const byTeam = new Map<string, PubPlayer[]>();
  for (const p of data.players) byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);

  const quarters: DailyQuarter[] = [];
  const used = new Set<string>();
  for (let q = 0; q < 4; q++) {
    let [a, b] = pickTeams(data.teams.map((t) => t.abbr), rng);
    // never reuse a team across the game's quarters (fresh matchups, four chances at the wall)
    let guard = 0;
    while ((used.has(a) || used.has(b) || a === b) && guard++ < 200) [a, b] = pickTeams(data.teams.map((t) => t.abbr), rng);
    used.add(a); used.add(b);
    const off = (byTeam.get(a) ?? []).filter((p) => p.side === "off");
    const def = (byTeam.get(b) ?? []).filter((p) => p.side === "def");
    quarters.push({ offense: a, defense: b, lineups: { off, def } });
  }
  return { day, dataVersion, seed, quarters };
}
