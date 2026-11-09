import { describe, expect, it } from "vitest";
import { quarterLine, voiceCapable } from "./voice";

describe("quarter-final voice", () => {
  it("pool lines are deterministic per rand and never empty", () => {
    const r = () => 0.42;
    expect(quarterLine("peak-quarter", r)).toBe(quarterLine("peak-quarter", r));
    for (const k of ["peak-quarter", "final", "turnover"] as const) {
      expect(quarterLine(k, () => 0.99).length).toBeGreaterThan(4);
    }
  });
  it("voice capability is a clean boolean (jsdom: pool carries)", () => {
    expect(typeof voiceCapable()).toBe("boolean");
  });
});
