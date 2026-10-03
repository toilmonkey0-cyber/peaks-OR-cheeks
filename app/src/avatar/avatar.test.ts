import { describe, it, expect } from "vitest";
import { generateAvatar } from "./avatar";

describe("avatar", () => {
  it("same seed -> identical grid; different seed -> different grid", () => {
    const a = generateAvatar("00-001"), b = generateAvatar("00-001");
    expect(a).toEqual(b);
    expect(generateAvatar("00-002")).not.toEqual(a);
  });
  it("is 12x12 with palette indices 0..5", () => {
    const g = generateAvatar("TEAM-ARI");
    expect(g.w).toBe(12);
    expect(g.h).toBe(12);
    expect(g.pixels.flat().every((v) => v >= 0 && v <= 5)).toBe(true);
  });
  it("helmets keep a consistent silhouette (outline pixels fixed)", () => {
    // crown row 1 cols 4-7 are always outline (index 3): part of the helmet template
    expect(generateAvatar("x1").pixels[1].slice(4, 8)).toEqual([3, 3, 3, 3]);
    expect(generateAvatar("x2").pixels[1].slice(4, 8)).toEqual([3, 3, 3, 3]);
  });
});
