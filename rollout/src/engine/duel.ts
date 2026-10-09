// Luck Duel: pass-and-play exhibition. Duel pulls score here ONLY — saved
// session stats are never touched. State lives in memory; refresh abandons.
import type { Card } from "@/data/schema";
import type { Verdict } from "./draw";

export const DUEL_PULLS = 5;

export interface DuelPlayer {
  pulls: number;
  peaks: number;
  cheeks: number; // cheeks + atomic
  best: Card | null;
  peaksExp: number;
  cheeksExp: number;
  varP: number;
  varC: number;
}

export interface DuelState {
  turn: 0 | 1;
  finished: boolean;
  players: [DuelPlayer, DuelPlayer];
}

export interface DuelVerdict {
  winner: 0 | 1 | null;
  L: [number, number];
  line: string;
  duke: 0 | 1 | null; // most cheeks eaten
  dukeCheeks: number;
}

const blank = (): DuelPlayer =>
  ({ pulls: 0, peaks: 0, cheeks: 0, best: null, peaksExp: 0, cheeksExp: 0, varP: 0, varC: 0 });

export const startDuel = (): DuelState => ({ turn: 0, finished: false, players: [blank(), blank()] });

/** Records into the CURRENT player's tally. Does not advance the turn —
 *  the caller advances after the celebration clears. */
export function recordDuelPull(s: DuelState, card: Card, verdict: Verdict,
  pPeak: number, pCheeks: number): DuelState {
  const p = s.players[s.turn];
  const next: DuelPlayer = {
    pulls: p.pulls + 1,
    peaks: p.peaks + (verdict === "peak" ? 1 : 0),
    cheeks: p.cheeks + (verdict && verdict !== "peak" ? 1 : 0),
    best: !p.best || card.rating > p.best.rating ? card : p.best,
    peaksExp: p.peaksExp + pPeak,
    cheeksExp: p.cheeksExp + pCheeks,
    varP: p.varP + pPeak * (1 - pPeak),
    varC: p.varC + pCheeks * (1 - pCheeks),
  };
  const players = [...s.players] as [DuelPlayer, DuelPlayer];
  players[s.turn] = next;
  return { ...s, players };
}

/** Pass the phone. Finished when both players have completed their pulls. */
export function advanceDuel(s: DuelState): DuelState {
  if (s.finished) return s;
  if (s.turn === 0) return { ...s, turn: 1 };
  const [p1, p2] = s.players;
  if (p1.pulls >= DUEL_PULLS && p2.pulls >= DUEL_PULLS) return { ...s, finished: true };
  return { ...s, turn: 0 };
}

/** Same honest z-combination the Cheeks Gauge uses, per player. */
function luckOf(p: DuelPlayer): number {
  const sdP = Math.sqrt(p.varP), sdC = Math.sqrt(p.varC);
  if (sdP < 0.001 || sdC < 0.001) return 0;
  const z = (p.peaks - p.peaksExp) / sdP - (p.cheeks - p.cheeksExp) / sdC;
  return Math.max(-3, Math.min(3, z));
}

export function duelVerdict(s: DuelState): DuelVerdict {
  const L: [number, number] = [luckOf(s.players[0]), luckOf(s.players[1])];
  let winner: 0 | 1 | null;
  if (Math.abs(L[0] - L[1]) < 0.05) {
    const b0 = s.players[0].best?.rating ?? -1;
    const b1 = s.players[1].best?.rating ?? -1;
    if (b0 !== b1) winner = b0 > b1 ? 0 : 1;
    else if (s.players[0].peaks !== s.players[1].peaks) winner = s.players[0].peaks > s.players[1].peaks ? 0 : 1;
    else winner = null;
  } else {
    winner = L[0] > L[1] ? 0 : 1;
  }
  const line = winner === null ? "FATE IS COWARDLY — DRAW." : `FATE FAVORS PLAYER ${winner + 1}`;
  const c0 = s.players[0].cheeks, c1 = s.players[1].cheeks;
  return { winner, L, line, duke: c0 === c1 ? null : c0 > c1 ? 0 : 1, dukeCheeks: Math.max(c0, c1) };
}
