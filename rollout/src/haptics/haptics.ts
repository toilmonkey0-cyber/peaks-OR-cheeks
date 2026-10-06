export type HapticName =
  | "tickLight" | "charge0" | "charge1" | "charge2" | "charge3"
  | "lock1" | "lock2" | "lock3" | "lockFinal"
  | "nearMiss" | "common" | "rare" | "elite" | "legend" | "xfactor" | "ui";

// ms patterns — the whole vocabulary in one table
export const HAPTICS: Record<HapticName, number[]> = {
  tickLight: [6],
  charge0: [10],
  charge1: [15, 30, 15],
  charge2: [20, 30, 20, 30, 20],
  charge3: [30, 30, 30, 30, 30, 60],
  lock1: [18],
  lock2: [24],
  lock3: [35],
  lockFinal: [45, 20, 80],
  nearMiss: [12, 30, 12],
  common: [15],
  rare: [20, 40, 20],
  elite: [30, 40, 30, 40, 60],
  legend: [40, 30, 40, 30, 40, 30, 120],
  xfactor: [8, 20, 8, 20, 8],
  ui: [8],
};

/** Charge-hold escalation by elapsed ms (0..3). */
export function chargeLevel(elapsedMs: number): 0 | 1 | 2 | 3 {
  if (elapsedMs >= 900) return 3;
  if (elapsedMs >= 600) return 2;
  if (elapsedMs >= 300) return 1;
  return 0;
}

export function vibrationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

let enabled = true;
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export function haptic(pattern: number[]): void {
  if (!enabled) return;
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}
