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
  flags: number; // CHALLENGE FLAGs used this quarter (one per wrong call)
  log: LogEntry[];
}

export const WEIGHTS: Record<SlotClass, number> = { common: 3, skill: 2, jack: 1 };
export const TURNOVER_PENALTY = 70;
export const PEAK_QUARTER_PULLS = 8;
export const SCOUTING_CROSSES = 3;
export const SCHEME_PRICES = { starPower: 2, scouting: 3 } as const;
export type Play = "nohuddle" | "film" | "flag";
export type Scheme = keyof typeof SCHEME_PRICES;

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
    over: null, total: 0, perfects: 0, flags: 0, log: [],
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
  const weight = (e: { side: 0 | 1; index: number }) => weightOf(state, e.side, e.index);
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

/** Rarity weight of a slot; STAR POWER doubles the jackpots. */
export function weightOf(state: GameState, side: 0 | 1, index: number): number {
  const cls = state.sides[side].lineup[index].cls;
  return WEIGHTS[cls] * (cls === "jack" && state.schemes.starPower ? 2 : 1);
}

/** One spin = one pull. Returns how many cards it deals (NO-HUDDLE: 2, then wears off). */
export function startPull(state: GameState): number {
  state.pulls++;
  const n = state.noHuddle ? 2 : 1;
  state.noHuddle = false;
  return n;
}

const SIDE_NAME = ["offense", "defense"] as const;

function ghostHidden(S: SideState): void {
  for (const s of S.slots) if (!s.fd && !s.sealed && s.layer === 0) s.ghost = true;
}

/** Final whistle: face-down PEAKs bank as chips, every hidden number shows, the quarter is scored. */
function endQuarter(state: GameState, kind: "solved" | "turnover"): number {
  let banked = 0;
  for (const S of state.sides) for (const s of S.slots) if (s.fd) { s.fd = false; banked++; }
  for (const S of state.sides) ghostHidden(S);
  state.chips += banked;
  const score = kind === "solved" ? state.pulls : TURNOVER_PENALTY;
  state.total += score;
  state.over = { kind, score, banked };
  return banked;
}

export function call(state: GameState, side: 0 | 1, team: string): { correct: boolean; quarterEnded: boolean; banked: number } {
  const S = state.sides[side];
  if (state.over || S.solved) return { correct: false, quarterEnded: false, banked: 0 };
  let banked = 0;
  const correct = team === S.team;
  if (correct) {
    S.solved = true;
    ghostHidden(S);
    state.log.unshift({ n: state.pulls, kind: "peak", text: `CALLED IT: the ${SIDE_NAME[side]} is ${team}.` });
    if (state.sides.every((x) => x.solved)) banked = endQuarter(state, "solved");
  } else {
    S.out.push(team);
    S.wrongCalls++;
    state.downs--;
    state.log.unshift({ n: state.pulls, kind: "cheeks", text: `Wrong call: the ${SIDE_NAME[side]} is not ${team}.` });
    if (state.downs <= 0) banked = endQuarter(state, "turnover");
  }
  return { correct, quarterEnded: state.over !== null, banked };
}

function canApply(state: GameState, play: Play): boolean {
  if (state.over) return false;
  if (play === "flag") return state.sides[0].wrongCalls + state.sides[1].wrongCalls - state.flags > 0;
  if (play === "nohuddle") return !state.noHuddle;
  return !state.film;
}

function applyEffect(state: GameState, play: Play): void {
  if (play === "flag") { state.flags++; state.downs = Math.min(4, state.downs + 1); }
  else if (play === "nohuddle") state.noHuddle = true;
  else state.film = true;
}

/** Spend a banked chip on a play. False (and nothing spent) when broke or the play can't apply. */
export function applyPlay(state: GameState, play: Play): boolean {
  if (state.chips < 1 || !canApply(state, play)) return false;
  state.chips--;
  applyEffect(state, play);
  return true;
}

/** PLAY a face-down PEAK: it flips with number + initials. */
export function playPeak(state: GameState, side: 0 | 1, index: number): boolean {
  const s = state.sides[side].slots[index];
  if (!s.fd || state.over) return false;
  s.fd = false;
  s.layer = 2;
  const p = state.sides[side].lineup[index];
  state.log.unshift({ n: state.pulls, kind: "peak", text: `Flipped: ${side ? "DEF" : "OFF"} ${p.label} #${p.jersey} ${p.ini}. A PEAK.` });
  return true;
}

/** SPEND a face-down PEAK on a play: its slot stays sealed for the quarter; no chip used. */
export function spendPeak(state: GameState, side: 0 | 1, index: number, play: Play): boolean {
  const s = state.sides[side].slots[index];
  if (!s.fd || !canApply(state, play)) return false;
  s.fd = false;
  s.sealed = true;
  applyEffect(state, play);
  return true;
}

/** FILM STUDY: the armed film digs one lit slot (number → initials, initials → college). */
export function filmSlot(state: GameState, side: 0 | 1, index: number): boolean {
  const s = state.sides[side].slots[index];
  if (!state.film || s.fd || s.sealed || s.layer < 1 || s.layer > 2) return false;
  s.layer = (s.layer < 2 ? 2 : 3) as Layer;
  state.film = false;
  const p = state.sides[side].lineup[index];
  state.log.unshift({ n: state.pulls, kind: "plain", text: `FILM: ${side ? "DEF" : "OFF"} ${p.label} #${p.jersey} is ${p.ini}${s.layer === 3 ? ", from " + p.college : ""}.` });
  return true;
}

/** Halftime adjustments: schemes sell only at the Q2 final whistle, once each. */
export function buyScheme(state: GameState, which: Scheme): boolean {
  const halftime = state.quarter === 2 && state.over !== null;
  if (!halftime || state.schemes[which] || state.chips < SCHEME_PRICES[which]) return false;
  state.chips -= SCHEME_PRICES[which];
  state.schemes[which] = true;
  return true;
}

export const finalScore = (state: GameState): number => state.total - state.chips;

/** Deal the next quarter: new teams, fresh downs; schemes, chips, and the running total carry. */
export function nextQuarter(state: GameState, lineups: Record<string, TeamLineups>, rng: () => number): boolean {
  if (!state.over || state.quarter >= 4) return false;
  const [a, b] = pickTeams(Object.keys(lineups), rng);
  state.quarter++;
  state.sides = [sideState(a, lineups[a].off.slots), sideState(b, lineups[b].def.slots)];
  Object.assign(state, { pulls: 0, downs: 4, flags: 0, noHuddle: false, film: false, over: null, log: [] });
  if (state.schemes.scouting) {
    const pool = Object.keys(lineups).sort().filter((t) => t !== a && t !== b);
    const crossed: string[] = [];
    while (crossed.length < SCOUTING_CROSSES && pool.length) crossed.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    state.sides[0].out = [...crossed];
    state.sides[1].out = [...crossed];
  }
  return true;
}
