// Pure scheduling math — no WebAudio, fully testable.

/**
 * Tick times (ms, starting at 0) for a stream that decelerates from startHz
 * to endHz over durationMs. Rate decays exponentially; density thins out as
 * the reel slows, like a physical spinner ticking past pegs.
 */
export function tickTimes(durationMs: number, startHz: number, endHz: number): number[] {
  if (durationMs <= 0 || startHz <= 0 || endHz <= 0 || endHz > startHz) return [];
  // integrate rate(t) = end + (start-end) * exp(-k t) ; solve k so rate(end)=endHz
  // using a discrete march instead — simpler and good enough for ticks.
  const times: number[] = [];
  let t = 0;
  // exponential rate decay constant: reaches endHz ~85% of the way
  const k = -Math.log(endHz / startHz) / (durationMs * 0.85);
  while (t < durationMs) {
    times.push(t);
    const rate = endHz + (startHz - endHz) * Math.exp(-k * t);
    t += 1000 / rate;
  }
  return times;
}

/** Monotonic rising offsets (ms) for the OVR rollup arpeggio. */
export function rollupNotes(count: number, stepMs = 70): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => i * stepMs);
}

/** The lock-note ladder: each lock lands a higher note. E2 A2 D3 G3. */
export const LOCK_FREQS = [82.41, 110.0, 146.83, 196.0] as const;

export function lockFreq(step: number): number {
  return LOCK_FREQS[Math.max(0, Math.min(LOCK_FREQS.length - 1, step))];
}

/** Charge-riser frequency (Hz) for a hold of elapsedMs — climbs, caps. */
export function chargeFreq(elapsedMs: number): number {
  const x = Math.min(1, Math.max(0, elapsedMs / 1400));
  return 110 + 330 * x * x; // 110 → 440, accelerating curve
}
