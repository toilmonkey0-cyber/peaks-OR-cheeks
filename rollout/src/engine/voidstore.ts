// The house's private collection — persisted under its own key.
import type { VoidEntry } from "@/engine/void";

const KEY = "rollout.void.v1";
export const HOUSE_SLOTS = 32;

export function loadVoidCollection(): VoidEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { entries?: VoidEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries.slice(0, HOUSE_SLOTS) : [];
  } catch {
    return [];
  }
}

export function writeVoidCollection(entries: VoidEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ entries: entries.slice(0, HOUSE_SLOTS) }));
  } catch {
    // private-mode Safari: session-only is fine
  }
}
