import { makeRng } from "@/engine/rng";
import type { SlotClass, SlotPlayer, TeamLineups } from "./lineups";

export type Layer = 0 | 1 | 2 | 3;
export interface SlotState { layer: Layer; fd: boolean; sealed: boolean; ghost: boolean; pending: boolean }
export interface SideState {
  team: string;
  lineup: SlotPlayer[]; // the 11 players — the game carries its own roster (resumable, daily-ready)
  slots: SlotState[];
  solved: boolean;
  out: string[];
  wrongCalls: number;
}
export interface LogEntry { n: number; kind: "plain" | "peak" | "cheeks"; text: string }
export interface PullPlan {
  side: 0 | 1; index: number;
  kind: "fd" | "lit" | "cheeks"; face: "gold" | "brown" | "plain";
  num: string; sub: string; toast: string;
}
export interface GameState {
  quarter: number;
  sides: [SideState, SideState];
  pulls: number;
  downs: number;
  chips: number;
  noHuddle: boolean;
  film: boolean;
  schemes: { starPower: boolean; scouting: boolean };
  over: null | { kind: "solved" | "turnover"; score: number; banked: number };
  total: number;
  perfects: number;
  log: LogEntry[];
}

export const WEIGHTS: Record<SlotClass, number> = { common: 3, skill: 2, jack: 1 };

const ROASTS = ["The house has notes.", "Starting. Somehow.", "Bold depth chart.", "Thoughts and prayers.", "His mom is the scout.", "A brave choice."];

const freshSlot = (): SlotState => ({ layer: 0, fd: false, sealed: false, ghost: false, pending: false });

function sideState(team: string, lineup: SlotPlayer[]): SideState {
  return { team, lineup, slots: lineup.map(freshSlot), solved: false, out: [], wrongCalls: 0 };
}

/** Two different teams, deterministic for a seed. */
export function pickTeams(teams: string[], rng: () => number): [string, string] {
  const sorted = [...teams].sort();
  const a = sorted[Math.floor(rng() * sorted.length)];
  const rest = sorted.filter((t) => t !== a);
  return [a, rest[Math.floor(rng() * rest.length)]];
}

export function createGame(seed: string, lineups: Record<string, TeamLineups>, teams?: [string, string]): GameState {
  const [a, b] = teams ?? pickTeams(Object.keys(lineups), makeRng(seed));
  return {
    quarter: 1,
    sides: [sideState(a, lineups[a].off.slots), sideState(b, lineups[b].def.slots)],
    pulls: 0, downs: 4, chips: 0, noHuddle: false, film: false,
    schemes: { starPower: false, scouting: false },
    over: null, total: 0, perfects: 0, log: [],
  };
}

const open = (s: SlotState) => !s.fd && !s.sealed && !s.pending;

/** Fresh slots first, per side; only once a side has no fresh slot does it dig (layers 1-2 → deeper). */
export function eligible(state: GameState): { side: 0 | 1; index: number }[] {
  const out: { side: 0 | 1; index: number }[] = [];
  state.sides.forEach((S, si) => {
    if (S.solved) return;
    const fresh = S.slots.flatMap((s, i) => (open(s) && s.layer === 0 ? [i] : []));
    const pool = fresh.length ? fresh : S.slots.flatMap((s, i) => (open(s) && s.layer >= 1 && s.layer < 3 ? [i] : []));
    for (const index of pool) out.push({ side: si as 0 | 1, index });
  });
  return out;
}

const where = (side: 0 | 1, p: SlotPlayer) => (side ? "DEF " : "OFF ") + p.label;

/** Choose a slot (weighted by rarity class), mark it pending, and describe the reveal. Mutates only `pending`. */
export function planPull(state: GameState, rng: () => number): PullPlan | null {
  const pool = eligible(state);
  if (!pool.length) return null;
  const weight = (e: { side: 0 | 1; index: number }) => WEIGHTS[state.sides[e.side].lineup[e.index].cls];
  let r = rng() * pool.reduce((a, e) => a + weight(e), 0);
  let pick = pool[pool.length - 1];
  for (const e of pool) { r -= weight(e); if (r <= 0) { pick = e; break; } }

  const { side, index } = pick;
  const slot = state.sides[side].slots[index];
  const p = state.sides[side].lineup[index];
  slot.pending = true;
  const at = where(side, p);
  const num = "#" + p.jersey;
  if (slot.layer === 0 && p.stamp === "P") {
    return { side, index, kind: "fd", face: "gold", num: "▲", sub: "PEAK", toast: `PEAK at ${at}. Face-down: tap it on the field.` };
  }
  if (slot.layer === 0) {
    const cheeks = p.stamp === "C";
    const roast = cheeks ? ". CHEEKS. " + ROASTS[Math.floor(rng() * ROASTS.length)] : "";
    return { side, index, kind: cheeks ? "cheeks" : "lit", face: cheeks ? "brown" : "plain", num, sub: cheeks ? "CHEEKS" : "", toast: `${at} ${num}${roast}` };
  }
  if (slot.layer === 1) return { side, index, kind: "lit", face: "plain", num, sub: p.ini, toast: `${at} ${num} is ${p.ini}.` };
  return { side, index, kind: "lit", face: "plain", num, sub: p.college, toast: `${at} ${num} played at ${p.college}${p.college.endsWith(".") ? "" : "."}` };
}

/** Land a planned reveal: clear pending, flip or deepen the slot, log it newest-first. */
export function commitPull(state: GameState, plan: PullPlan): LogEntry {
  const slot = state.sides[plan.side].slots[plan.index];
  slot.pending = false;
  if (plan.kind === "fd") slot.fd = true;
  else slot.layer = Math.min(3, slot.layer + 1) as Layer;
  const entry: LogEntry = { n: state.pulls, kind: plan.kind === "fd" ? "peak" : plan.kind === "cheeks" ? "cheeks" : "plain", text: plan.toast };
  state.log.unshift(entry);
  return entry;
}
