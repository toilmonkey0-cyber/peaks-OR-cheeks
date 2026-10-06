import { describe, expect, it, vi } from "vitest";
import { chargeLevel, haptic, HAPTICS, setHapticsEnabled } from "./haptics";

describe("haptics vocabulary", () => {
  it("defines non-empty patterns for every name", () => {
    for (const pattern of Object.values(HAPTICS)) {
      expect(pattern.length).toBeGreaterThan(0);
      expect(pattern.every((ms) => ms >= 0)).toBe(true);
    }
  });

  it("escalates charge levels by elapsed time", () => {
    expect(chargeLevel(50)).toBe(0);
    expect(chargeLevel(300)).toBe(1);
    expect(chargeLevel(600)).toBe(2);
    expect(chargeLevel(900)).toBe(3);
  });

  it("respects the enabled gate", () => {
    const vibrate = vi.fn();
    Object.assign(navigator, { vibrate });
    setHapticsEnabled(false);
    haptic([10]);
    expect(vibrate).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    haptic([10]);
    expect(vibrate).toHaveBeenCalledWith([10]);
  });
});
