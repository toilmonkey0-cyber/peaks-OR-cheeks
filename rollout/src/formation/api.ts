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
