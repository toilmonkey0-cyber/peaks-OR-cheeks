export type HapticName = "rip" | "tick" | "doubleTick" | "rumble" | "troll" | "gem" | "coin";

// spec §10 table — exact ms patterns
export const HAPTICS: Record<HapticName, number[]> = {
  rip: [30, 40, 60],
  tick: [10],
  doubleTick: [15, 40, 15],
  rumble: [40, 30, 40, 30, 90],
  troll: [50, 50, 20, 50, 8],
  gem: [10, 20, 20, 20, 40],
  coin: [8, 30, 8],
};

export function holdPulse(level: 0 | 1 | 2): number[] {
  return [[10], [15, 30, 15], [20, 30, 20]][level];
}

let enabled = true;
export function setHapticsEnabled(on: boolean): void { enabled = on; }

export function haptic(pattern: number[]): void {
  if (!enabled) return;
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}
