import type { Card } from "@/data/schema";
import { HISTORY_MAX } from "@/engine/config";
import { nextCheekStreak, type Verdict } from "@/engine/draw";

const KEY = "rollout.save.v1";

export type Source = "m26" | "m27";
export const SOURCES: Source[] = ["m26", "m27"];

export interface SourceStats {
  pulls: number;
  bestId: string | null;
  bestRating: number; // -1 = no best yet
  historyIds: string[];
  cheekStreak: number;
  peaks: number;
  cheeks: number; // cheeks + atomic combined (atomic is a cheeks flavor)
  // fate's tab: expected verdict counts + variance accumulators, summed at
  // pull time so filter switches stay statistically exact
  peaksExp: number;
  cheeksExp: number;
  varP: number;
  varC: number;
}

export interface SaveState {
  source: Source;
  stats: Record<Source, SourceStats>;
  soundOn: boolean;
  hapticsOn: boolean;
  crowdOn: boolean;
  group: string;
}

export const freshStats = (): SourceStats =>
  ({ pulls: 0, bestId: null, bestRating: -1, historyIds: [], cheekStreak: 0, peaks: 0, cheeks: 0,
     peaksExp: 0, cheeksExp: 0, varP: 0, varC: 0 });

export const freshSave = (): SaveState => ({
  source: "m26",
  stats: { m26: freshStats(), m27: freshStats() },
  soundOn: true,
  hapticsOn: true,
  crowdOn: true,
  group: "ALL",
});

export function loadSave(): SaveState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as Partial<SaveState> & Partial<SourceStats>;
    // v1 saves (pre-source-toggle) kept pulls/best*/history at the top level → fold into m26
    const legacy = typeof parsed.pulls === "number" || parsed.bestId || Array.isArray(parsed.historyIds);
    const merge = (s: Partial<SourceStats>): SourceStats => ({ ...freshStats(), ...s });
    const statsBase = legacy
      ? {
          m26: merge({
            pulls: typeof parsed.pulls === "number" ? parsed.pulls : 0,
            bestId: parsed.bestId ?? null,
            bestRating: typeof parsed.bestRating === "number" ? parsed.bestRating : -1,
            historyIds: Array.isArray(parsed.historyIds) ? parsed.historyIds : [],
          }),
          m27: freshStats(),
        }
      : { m26: merge(parsed.stats?.m26 ?? {}), m27: merge(parsed.stats?.m27 ?? {}) };
    for (const s of SOURCES) {
      statsBase[s].historyIds = (statsBase[s].historyIds ?? []).slice(0, HISTORY_MAX);
      // pre-luck-meter saves carry real pulls but no fate tab → backfill with
      // the ALL-pool approximation so the gauge starts honest-ish
      const st = statsBase[s];
      if (st.pulls > 0 && st.peaksExp === 0 && st.cheeksExp === 0) {
        st.peaksExp = st.pulls * 0.095;
        st.cheeksExp = st.pulls * 0.09;
        st.varP = st.pulls * 0.095 * 0.905;
        st.varC = st.pulls * 0.09 * 0.91;
      }
    }
    return {
      ...freshSave(),
      source: parsed.source === "m27" ? "m27" : "m26",
      stats: statsBase,
      soundOn: parsed.soundOn ?? true,
      hapticsOn: parsed.hapticsOn ?? true,
      crowdOn: parsed.crowdOn ?? true,
      group: parsed.group ?? "ALL",
    };
  } catch {
    // corrupt or unavailable storage → fresh (nothing worth backing up in a generator)
    return freshSave();
  }
}

export function writeSave(save: SaveState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // private-mode Safari: session-only is fine
  }
}

export interface PullOutcome {
  save: SaveState;
  isNewBest: boolean;
  streak: number;
}

export function recordPull(save: SaveState, card: Card, verdict: Verdict,
  pPeak = 0.095, pCheeks = 0.09): PullOutcome {
  const cur = save.stats[save.source];
  const isNewBest = card.rating > cur.bestRating;
  const streak = nextCheekStreak(cur.cheekStreak, verdict);
  const next: SourceStats = {
    pulls: cur.pulls + 1,
    bestId: isNewBest ? card.playerId : cur.bestId,
    bestRating: isNewBest ? card.rating : cur.bestRating,
    historyIds: [card.playerId, ...cur.historyIds.filter((id) => id !== card.playerId)].slice(0, HISTORY_MAX),
    cheekStreak: streak,
    peaks: cur.peaks + (verdict === "peak" ? 1 : 0),
    cheeks: cur.cheeks + (verdict && verdict !== "peak" ? 1 : 0),
    peaksExp: cur.peaksExp + pPeak,
    cheeksExp: cur.cheeksExp + pCheeks,
    varP: cur.varP + pPeak * (1 - pPeak),
    varC: cur.varC + pCheeks * (1 - pCheeks),
  };
  return {
    save: { ...save, stats: { ...save.stats, [save.source]: next } },
    isNewBest,
    streak,
  };
}
