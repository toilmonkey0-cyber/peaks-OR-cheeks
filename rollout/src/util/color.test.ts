import { describe, expect, it } from "vitest";
import { hexToRgb, liftColor, relLuminance } from "./color";

describe("color helpers", () => {
  it("parses hex", () => {
    expect(hexToRgb("#97233F")).toEqual([151, 35, 63]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
  });

  it("lifts black toward the luminance floor without overshooting much", () => {
    const lifted = liftColor("#000000");
    const [r, g, b] = hexToRgb(lifted);
    expect(relLuminance(r, g, b)).toBeGreaterThanOrEqual(0.29);
    expect(relLuminance(r, g, b)).toBeLessThan(0.45);
  });

  it("passes bright colors through untouched", () => {
    expect(liftColor("#fbbf24")).toBe("#fbbf24");
    expect(liftColor("#38bdf8")).toBe("#38bdf8");
  });
});
