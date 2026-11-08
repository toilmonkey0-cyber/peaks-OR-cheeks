import type { GameState } from "./engine/game";

const KEY = "rollout.formation.v1";

export interface FormationSave {
  inProgress: GameState | null;
  bestGame: number | null; // lowest final score; null = no finished game yet
  gamesPlayed: number;
}

export const freshFormationSave = (): FormationSave => ({ inProgress: null, bestGame: null, gamesPlayed: 0 });

const isGame = (g: unknown): g is GameState =>
  !!g && typeof g === "object" && Array.isArray((g as GameState).sides) && (g as GameState).sides.length === 2 &&
  (g as GameState).sides.every((s) => Array.isArray(s?.slots) && Array.isArray(s?.lineup));

/** A pull that was mid-flight when the tab died never landed: clear `pending` so the slot is pullable again. */
function settle(g: GameState): GameState {
  for (const S of g.sides) for (const s of S.slots) s.pending = false;
  return g;
}

export function loadFormationSave(): FormationSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshFormationSave();
    const parsed = JSON.parse(raw) as Partial<FormationSave>;
    return {
      inProgress: isGame(parsed.inProgress) ? settle(parsed.inProgress) : null,
      bestGame: typeof parsed.bestGame === "number" ? parsed.bestGame : null,
      gamesPlayed: typeof parsed.gamesPlayed === "number" ? parsed.gamesPlayed : 0,
    };
  } catch {
    return freshFormationSave();
  }
}

export function writeFormationSave(save: FormationSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage full or blocked: the game still plays, it just won't resume */
  }
}

export function recordFinishedGame(save: FormationSave, finalScore: number): FormationSave {
  return {
    inProgress: null,
    bestGame: save.bestGame === null ? finalScore : Math.min(save.bestGame, finalScore),
    gamesPlayed: save.gamesPlayed + 1,
  };
}
