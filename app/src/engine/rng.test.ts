import { describe, it, expect } from "vitest";
import { makeRng, hashSeed } from "./rng";

describe("rng", () => {
  it("same seed -> identical sequence", () => {
    const a = makeRng("pack-1"), b = makeRng("pack-1");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("different seeds -> different sequences", () => {
    expect(makeRng("a")()).not.toBe(makeRng("b")());
  });
  it("outputs stay in [0,1)", () => {
    const r = makeRng("x");
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("hashSeed is stable", () => {
    expect(hashSeed("rippack")).toBe(1112309373);
  });
});
