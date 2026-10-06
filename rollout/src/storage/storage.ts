import type { Card } from "@/data/schema";
import { HISTORY_MAX } from "@/engine/config";

const KEY = "rollout.save.v1";

export interface SaveState {
  pulls: number;
  bestId: string | null;
  bestRating: number; // -1 = no best yet
  historyIds: string[];
  soundOn: boolean;
  hapticsOn: boolean;
  crowdOn: boolean;
  group: string;
}

export const freshSave = (): SaveState => ({
  pulls: 0,
  bestId: null,
  bestRating: -1,
  historyIds: [],
  soundOn: true,
  hapticsOn: true,
  crowdOn: true,
  group: "ALL",
});

export function loadSave(): SaveState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as Partial<SaveState>;
    return {
      ...freshSave(),
      ...parsed,
      pulls: typeof parsed.pulls === "number" ? parsed.pulls : 0,
      bestRating: typeof parsed.bestRating === "number" ? parsed.bestRating : -1,
      historyIds: Array.isArray(parsed.historyIds) ? parsed.historyIds.slice(0, HISTORY_MAX) : [],
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
  const isNewBest = card.rating > save.bestRating;
  return {
    save: {
      ...save,
      pulls: save.pulls + 1,
      bestId: isNewBest ? card.playerId : save.bestId,
      bestRating: isNewBest ? card.rating : save.bestRating,
      historyIds: [card.playerId, ...save.historyIds.filter((id) => id !== card.playerId)].slice(0, HISTORY_MAX),
    },
    isNewBest,
  };
}
