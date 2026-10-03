import { describe, it, expect, vi, beforeEach } from "vitest";
import { HAPTICS, holdPulse, haptic, setHapticsEnabled } from "./haptics";

describe("haptics", () => {
  beforeEach(() => { setHapticsEnabled(true); (navigator as any).vibrate = undefined; });

  it("patterns match the spec §10 table", () => {
    expect(HAPTICS.rip).toEqual([30, 40, 60]);
    expect(HAPTICS.tick).toEqual([10]);
    expect(HAPTICS.doubleTick).toEqual([15, 40, 15]);
    expect(HAPTICS.rumble).toEqual([40, 30, 40, 30, 90]);
    expect(HAPTICS.troll).toEqual([50, 50, 20, 50, 8]);
    expect(HAPTICS.gem).toEqual([10, 20, 20, 20, 40]);
    expect(HAPTICS.coin).toEqual([8, 30, 8]);
    expect(holdPulse(0)).toEqual([10]);
    expect(holdPulse(2)).toEqual([20, 30, 20]);
  });
  it("every pattern is a valid vibrate pattern (numbers >= 0)", () => {
    for (const p of [...Object.values(HAPTICS), holdPulse(0), holdPulse(1), holdPulse(2)])
      expect(p.every((n) => typeof n === "number" && n >= 0)).toBe(true);
  });
  it("calls navigator.vibrate when supported+enabled", () => {
    const spy = vi.fn();
    (navigator as any).vibrate = spy;
    haptic(HAPTICS.tick);
    expect(spy).toHaveBeenCalledWith(HAPTICS.tick);
  });
  it("no-ops when disabled or unsupported", () => {
    const spy = vi.fn();
    (navigator as any).vibrate = spy;
    setHapticsEnabled(false);
    haptic(HAPTICS.tick);
    expect(spy).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    (navigator as any).vibrate = undefined;
    expect(() => haptic(HAPTICS.tick)).not.toThrow();
  });
});
