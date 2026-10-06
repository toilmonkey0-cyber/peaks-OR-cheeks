import type { Card } from "@/data/schema";
import { HISTORY_MAX } from "@/engine/config";

const KEY = "rollout.save.v1";

export type Source = "m26" | "m27";
export const SOURCES: Source[] = ["m26", "m27"];

export interface SourceStats {
  pulls: number;
  bestId: string | null;
  bestRating: number; // -1 = no best yet
  historyIds: string[];
}

export interface SaveState {
  source: Source;
  stats: Record<Source, SourceStats>;
  soundOn: boolean;
  hapticsOn: boolean;
  crowdOn: boolean;
  group: string;
}

export const freshStats = (): SourceStats => ({ pulls: 0, bestId: null, bestRating: -1, historyIds: [] });

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
    const statsBase = legacy
      ? {
          m26: {
            pulls: typeof parsed.pulls === "number" ? parsed.pulls : 0,
            bestId: parsed.bestId ?? null,
            bestRating: typeof parsed.bestRating === "number" ? parsed.bestRating : -1,
            historyIds: Array.isArray(parsed.historyIds) ? parsed.historyIds.slice(0, HISTORY_MAX) : [],
          },
          m27: freshStats(),
        }
      : { m26: parsed.stats?.m26 ?? freshStats(), m27: parsed.stats?.m27 ?? freshStats() };
    for (const s of SOURCES) {
      statsBase[s].historyIds = (statsBase[s].historyIds ?? []).slice(0, HISTORY_MAX);
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
}

export function recordPull(save: SaveState, card: Card): PullOutcome {
  const cur = save.stats[save.source];
  const isNewBest = card.rating > cur.bestRating;
  const next: SourceStats = {
    pulls: cur.pulls + 1,
    bestId: isNewBest ? card.playerId : cur.bestId,
    bestRating: isNewBest ? card.rating : cur.bestRating,
    historyIds: [card.playerId, ...cur.historyIds.filter((id) => id !== card.playerId)].slice(0, HISTORY_MAX),
  };
  return {
    save: { ...save, stats: { ...save.stats, [save.source]: next } },
    isNewBest,
  };
}
