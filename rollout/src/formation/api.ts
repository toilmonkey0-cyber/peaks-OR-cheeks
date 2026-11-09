/**
 * The thin client for FORMATION's Worker. No API base configured = every call is a clean null
 * and the game runs entirely on-device (phase-B behavior) — the board is an upgrade, never a dependency.
 */
import type { DailyPayload } from "./engine/daily";

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
let base: string = env.VITE_FORMATION_API ?? "";

/** Tests override; production reads the build-time env (empty string = feature off). */
export function setApiBase(url: string): void { base = url; }
export const apiBase = (): string => base;

const shapeOk = (v: unknown): v is DailyPayload => {
  const p = v as DailyPayload;
  return !!p && typeof p.day === "string" && typeof p.seed === "string" &&
    Array.isArray(p.quarters) && p.quarters.length === 4 &&
    p.quarters.every((q) => q.lineups.off.length === 11 && q.lineups.def.length === 11 && q.offense !== q.defense);
};

/** Today's published daily; null when unreachable, misshapen, or not configured. */
export async function fetchDaily(day: string, dataVersion: string, timeoutMs = 3000): Promise<DailyPayload | null> {
  if (!base) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(`${base}/daily?day=${encodeURIComponent(day)}&dataVersion=${encodeURIComponent(dataVersion)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const v = await r.json();
    return shapeOk(v) ? v : null;
  } catch {
    return null;
  }
}

export interface ScorePost { day: string; playerId: string; nick: string; score: number; detailJson: string }
export interface BoardRow { nick: string; playerId: string; score: number; detailJson: string }
export interface Board { rows: BoardRow[]; youPlayed: boolean }

async function call(method: string, path: string, body?: unknown, timeoutMs = 4000): Promise<Response | null> {
  if (!base) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(base + path, {
      method,
      signal: ctrl.signal,
      ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}),
    });
    clearTimeout(t);
    return r;
  } catch {
    return null;
  }
}

export async function createGroup(name: string): Promise<string | null> {
  const r = await call("POST", "/groups", { name });
  if (!r || !r.ok) return null;
  const v = (await r.json().catch(() => null)) as { code?: string } | null;
  return v?.code ?? null;
}

export async function joinGroup(code: string, playerId: string, nick: string): Promise<boolean> {
  const r = await call("POST", `/groups/${code}/join`, { playerId, nick });
  return !!r && r.ok;
}

export async function postScore(code: string, post: ScorePost): Promise<boolean> {
  const r = await call("POST", `/groups/${code}/score`, post);
  return !!r && r.ok;
}

export async function fetchBoard(code: string, day: string, playerId: string): Promise<Board | null> {
  const r = await call("GET", `/groups/${code}/board?day=${encodeURIComponent(day)}&playerId=${encodeURIComponent(playerId)}`);
  if (!r || !r.ok) return null;
  const v = (await r.json().catch(() => null)) as Board | null;
  return v && Array.isArray(v.rows) ? v : null;
}
