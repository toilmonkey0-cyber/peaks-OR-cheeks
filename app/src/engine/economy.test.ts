import { describe, it, expect } from "vitest";
import { applyDaily, canClaimDaily, totalDupeCoins } from "./economy";

describe("daily", () => {
  it("first claim: streak 1, no bonus coins, marks today", () => {
    const s = applyDaily({ coins: 100, streak: 0, lastDailyClaim: null }, "2026-10-03");
    expect(s).toEqual({ coins: 100, streak: 1, lastDailyClaim: "2026-10-03" });
  });
  it("consecutive day: streak 2 -> +50", () => {
    const s = applyDaily({ coins: 100, streak: 1, lastDailyClaim: "2026-10-02" }, "2026-10-03");
    expect(s.coins).toBe(150);
    expect(s.streak).toBe(2);
  });
  it("streak bonus caps at 250 (day 6+)", () => {
    const s = applyDaily({ coins: 0, streak: 6, lastDailyClaim: "2026-10-02" }, "2026-10-03");
    expect(s.coins).toBe(250);
  });
  it("gap day resets streak to 1", () => {
    const s = applyDaily({ coins: 0, streak: 4, lastDailyClaim: "2026-09-30" }, "2026-10-03");
    expect(s.streak).toBe(1);
    expect(s.coins).toBe(0);
  });
  it("double claim same day is a no-op", () => {
    const before = { coins: 123, streak: 3, lastDailyClaim: "2026-10-03" };
    expect(applyDaily(before, "2026-10-03")).toEqual(before);
  });
  it("canClaimDaily", () => {
    expect(canClaimDaily(null, "2026-10-03")).toBe(true);
    expect(canClaimDaily("2026-10-03", "2026-10-03")).toBe(false);
  });
});

describe("dupes", () => {
  it("sums coins", () => {
    expect(totalDupeCoins([{ coins: 10 }, { coins: 200 }])).toBe(210);
    expect(totalDupeCoins([])).toBe(0);
  });
});
