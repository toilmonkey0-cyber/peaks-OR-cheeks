import type { GameState } from "./engine/game";
import { localDay, type DailyPayload, type DailyState } from "./engine/daily";

const KEY = "rollout.formation.v1";

export interface WallEntry { day: string; gold: boolean }
export interface FormationSave {
  inProgress: GameState | null;
  bestGame: number | null; // lowest final score; null = no finished game yet
  gamesPlayed: number;
  wall: Record<string, WallEntry>; // abbr → first solve (gold never downgrades)
  daily: DailyState | null;
  dailyGame: GameState | null; // the daily's own in-progress slot — free play's inProgress is never clobbered
  published: DailyPayload | null; // today's Worker-published envelope when one has been fetched (offline replay)
  playerId: string; // stable device identity (uuid) - the board knows no accounts
  nick: string; // display name on the board (editable; stored per device)
  groups: { code: string; name: string }[];
  pendingScores: { groupCode: string; day: string; playerId: string; nick: string; score: number; detailJson: string }[];
}

const isPayload = (v: unknown): v is DailyPayload =>
  !!v && typeof v === "object" && Array.isArray((v as DailyPayload).quarters) && (v as DailyPayload).quarters.length === 4 && typeof (v as DailyPayload).seed === "string";

export const freshFormationSave = (): FormationSave => ({ inProgress: null, bestGame: null, gamesPlayed: 0, wall: {}, daily: null, dailyGame: null, published: null, playerId: "", nick: "", groups: [], pendingScores: [] });

/** Give the device its identity once - never re-rolled. */
export function ensurePlayer(save: FormationSave): FormationSave {
  if (save.playerId) return save;
  const id = (globalThis.crypto?.randomUUID?.() ?? "p-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
  return { ...save, playerId: id };
}

/** A finished daily that couldn't post queues here; same (group, day) replaces. */
export function queueScore(save: FormationSave, post: FormationSave["pendingScores"][number]): FormationSave {
  const rest = save.pendingScores.filter((x) => !(x.groupCode === post.groupCode && x.day === post.day));
  return { ...save, pendingScores: [...rest, post] };
}

export function clearQueued(save: FormationSave, match: (x: FormationSave["pendingScores"][number]) => boolean): FormationSave {
  return { ...save, pendingScores: save.pendingScores.filter((x) => !match(x)) };
}

const isDaily = (d: unknown): d is DailyState =>
  !!d && typeof d === "object" && typeof (d as DailyState).day === "string" && typeof (d as DailyState).seed === "string" && "result" in (d as DailyState);

const isWall = (w: unknown): w is FormationSave["wall"] =>
  !!w && typeof w === "object" && Object.values(w).every((e) =>
    !!e && typeof e === "object" && typeof (e as WallEntry).day === "string" && typeof (e as WallEntry).gold === "boolean");

const isGame = (g: unknown): g is GameState =>
  !!g && typeof g === "object" && Array.isArray((g as GameState).sides) && (g as GameState).sides.length === 2 &&
  (g as GameState).sides.every((s) => Array.isArray(s?.slots) && Array.isArray(s?.lineup));

/** A pull that was mid-flight when the tab died never landed: clear `pending` so the slot is pullable again. */
function settle(g: GameState): GameState {
  for (const S of g.sides) for (const s of S.slots) s.pending = false;
  // pre-B saves lack the seed and quarter counters — default them (seed stable per game: derived from its teams)
  g.seed ??= `fm-legacy-${g.sides[0].team}-${g.sides[1].team}-${g.quarter}`;
  g.quartersSolved ??= 0;
  g.turnovers ??= 0;
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
      wall: isWall(parsed.wall) ? parsed.wall : {},
      daily: isDaily(parsed.daily) ? parsed.daily : null,
      dailyGame: isGame(parsed.dailyGame) ? settle(parsed.dailyGame) : null,
      published: isPayload(parsed.published) ? parsed.published : null,
      playerId: typeof parsed.playerId === "string" ? parsed.playerId : "",
      nick: typeof parsed.nick === "string" ? parsed.nick : "",
      groups: Array.isArray(parsed.groups) ? parsed.groups.filter((g) => g && typeof g.code === "string" && typeof g.name === "string") : [],
      pendingScores: Array.isArray(parsed.pendingScores) ? parsed.pendingScores : [],
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
    ...save,
    inProgress: null,
    bestGame: save.bestGame === null ? finalScore : Math.min(save.bestGame, finalScore),
    gamesPlayed: save.gamesPlayed + 1,
  };
}

/** Light a team's trophy the first time you solve them; gold (first-try call) never downgrades. */
export function recordWallSolve(save: FormationSave, abbr: string, gold: boolean): FormationSave {
  const prev = save.wall[abbr];
  if (prev && (prev.gold || !gold)) return save;
  return { ...save, wall: { ...save.wall, [abbr]: { day: prev?.day ?? localDay(), gold: prev?.gold || gold } } };
}
