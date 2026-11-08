import type { Card, Snapshot } from "@/data/schema";

/** [Madden position, chip label] in field order — 11 per side. */
export const OFF_SLOTS: [string, string][] = [
  ["QB", "QB"], ["HB", "HB"], ["WR", "WR"], ["WR", "WR"], ["WR", "WR"], ["TE", "TE"],
  ["LT", "LT"], ["LG", "LG"], ["C", "C"], ["RG", "RG"], ["RT", "RT"],
];
export const DEF_SLOTS: [string, string][] = [
  ["LEDG", "EDGE"], ["REDG", "EDGE"], ["DT", "DT"], ["DT", "DT"], ["MIKE", "MIKE"], ["WILL", "WILL"],
  ["CB", "CB"], ["CB", "CB"], ["CB", "CB"], ["FS", "FS"], ["SS", "SS"],
];

export type Stamp = "P" | "M" | "C";
export type SlotClass = "common" | "skill" | "jack";

export interface SlotPlayer {
  key: string; label: string; pos: string; jersey: number; ini: string; college: string;
  stamp: Stamp; cls: SlotClass; rating: number; playerId: string; fullName: string;
}
export interface SideLineup { team: string; slots: SlotPlayer[] }
export interface TeamLineups { off: SideLineup; def: SideLineup }

/** Verdicts are judged per team-slot: top/bottom 3 of the 32 starters at a position. */
const STAMP_PER_TEAM_SLOT = 3;

const initials = (name: string) =>
  name.replace(/ (Jr|Sr|II|III|IV)\.?$/, "").split(/[ -]/).filter(Boolean).map((w) => w[0].toUpperCase()).join(".") + ".";

/** Starters for one side: the top-rated player per slot, slot keys numbered when a position repeats. */
function pickStarters(players: Card[], spec: [string, string][]): { key: string; label: string; card: Card }[] {
  const used = new Set<string>();
  const seen = new Map<string, number>();
  return spec.map(([pos, label]) => {
    const card = players.filter((p) => p.position === pos && !used.has(p.playerId)).sort((a, b) => b.rating - a.rating)[0];
    used.add(card.playerId);
    const n = (seen.get(pos) ?? 0) + 1;
    seen.set(pos, n);
    const repeats = spec.filter(([q]) => q === pos).length > 1;
    return { key: repeats ? pos + n : pos, label, card };
  });
}

export function buildLineups(snapshot: Snapshot): Record<string, TeamLineups> {
  const byTeam = new Map<string, Card[]>();
  for (const p of snapshot.players) {
    if (p.team === "FA") continue;
    byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
  }

  const picks = new Map<string, { off: ReturnType<typeof pickStarters>; def: ReturnType<typeof pickStarters> }>();
  for (const [team, players] of byTeam) picks.set(team, { off: pickStarters(players, OFF_SLOTS), def: pickStarters(players, DEF_SLOTS) });

  // rank each position among the league's STARTERS only
  const stampOf = new Map<string, Stamp>();
  const starterCards = [...picks.values()].flatMap((s) => [...s.off, ...s.def].map((x) => x.card));
  for (const pos of new Set(starterCards.map((c) => c.position))) {
    const ranked = starterCards.filter((c) => c.position === pos).sort((a, b) => b.rating - a.rating);
    const k = STAMP_PER_TEAM_SLOT * (ranked.length / byTeam.size);
    ranked.forEach((c, i) => stampOf.set(c.playerId, i < k ? "P" : i >= ranked.length - k ? "C" : "M"));
  }

  const toSlot = (x: { key: string; label: string; card: Card }, cls: SlotClass): SlotPlayer => ({
    key: x.key, label: x.label, pos: x.card.position, jersey: x.card.jersey, ini: initials(x.card.fullName),
    college: x.card.college, stamp: stampOf.get(x.card.playerId)!, cls, rating: x.card.rating,
    playerId: x.card.playerId, fullName: x.card.fullName,
  });

  const out: Record<string, TeamLineups> = {};
  for (const [team, s] of picks) {
    const best = [...s.def].sort((a, b) => b.card.rating - a.card.rating)[0].card.playerId;
    out[team] = {
      off: { team, slots: s.off.map((x, i) => toSlot(x, i === 0 ? "jack" : i <= 5 ? "skill" : "common")) },
      def: { team, slots: s.def.map((x) => toSlot(x, x.card.playerId === best ? "jack" : "common")) },
    };
  }
  return out;
}
