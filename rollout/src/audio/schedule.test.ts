import { describe, expect, it } from "vitest";
import { chargeFreq, lockFreq, LOCK_FREQS, rollupNotes, tickTimes } from "./schedule";

describe("tickTimes", () => {
  it("is monotonic and bounded by the duration", () => {
    const times = tickTimes(2900, 16, 2);
    expect(times[0]).toBe(0);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
    expect(times.at(-1)!).toBeLessThan(2900);
  });

  it("thins out as the stream decelerates", () => {
    const times = tickTimes(4000, 20, 1.5);
    const firstHalf = times.filter((t) => t < 2000).length;
    const secondHalf = times.filter((t) => t >= 2000).length;
    expect(firstHalf).toBeGreaterThan(secondHalf);
  });

  it("rejects invalid input", () => {
    expect(tickTimes(0, 10, 2)).toEqual([]);
    expect(tickTimes(100, 2, 10)).toEqual([]); // end > start
  });
});

describe("rollupNotes", () => {
  it("spaces arpeggio notes evenly", () => {
    expect(rollupNotes(5, 70)).toEqual([0, 70, 140, 210, 280]);
    expect(rollupNotes(0)).toEqual([]);
  });
});

describe("lockFreq / chargeFreq", () => {
  it("climbs the ladder and clamps", () => {
    expect(lockFreq(0)).toBe(LOCK_FREQS[0]);
    expect(lockFreq(1)).toBeGreaterThan(lockFreq(0));
    expect(lockFreq(99)).toBe(LOCK_FREQS[3]);
  });

  it("rises with hold time and caps at 440Hz", () => {
    expect(chargeFreq(500)).toBeGreaterThan(chargeFreq(0));
    expect(chargeFreq(5000)).toBe(440);
  });
});
