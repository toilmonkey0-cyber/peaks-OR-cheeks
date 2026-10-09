// Temporary diagnostic: does planScan loop on the WR pool (or any group)?
import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { GROUPS } from "./config";
import { filterPool, planScan, stripMids } from "./draw";
import { poolVerdictRates } from "./luck";
import { verdictOf } from "./draw";

const snap26 = loadSnapshot("m26");
const snap27 = loadSnapshot("m27");

function probe(label: string, pool: ReturnType<typeof filterPool>) {
  const N = 300;
  const counts = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const card = planScan(`probe-${label}-${i}-${Math.random()}`, pool).card;
    counts.set(card.playerId, (counts.get(card.playerId) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  const expectedShare = 1 / Math.max(1, counts.size);
  console.log(
    `${label}: pool=${pool.length} uniqueResults=${counts.size} top=${top[1]}/${N} (${((top[1] / N) * 100).toFixed(1)}%) expectedShareIfUniform=${(expectedShare * 100).toFixed(1)}% topId=${top[0]}`,
  );
  return { unique: counts.size, topShare: top[1] / N };
}

describe("loop diagnostic", () => {
  it("WR group, both sources, mids on/off", () => {
    for (const src of ["m26", "m27"] as const) {
      const snap = src === "m26" ? snap26 : snap27;
      const wr = filterPool(snap.players, GROUPS.WR);
      probe(`${src} WR (mids)`, wr);
      probe(`${src} WR (NO MIDS)`, stripMids(wr));
    }
  });

  it("the WR + NO MIDS loop is dead, and rates match draws (honesty contract)", () => {
    for (const src of ["m26", "m27"] as const) {
      const snap = src === "m26" ? snap26 : snap27;
      const pool = stripMids(filterPool(snap.players, GROUPS.WR));
      const r = probe(`${src} WR (NO MIDS) regression`, pool);
      expect(r.topShare).toBeLessThan(0.15);   // was 0.90 — one-card loop
      expect(r.unique).toBeGreaterThan(20);
      // expected rates must match what the draw actually produces
      const { pPeak, pCheeks } = poolVerdictRates(pool);
      const N = 600;
      let peaks = 0, cheeks = 0;
      for (let i = 0; i < N; i++) {
        const v = verdictOf(planScan(`hc-${src}-${i}-${Math.random()}`, pool).card);
        if (v === "peak") peaks++;
        if (v && v !== "peak") cheeks++;
      }
      expect(Math.abs(peaks / N - pPeak)).toBeLessThan(0.06);
      expect(Math.abs(cheeks / N - pCheeks)).toBeLessThan(0.06);
    }
  });

  it("NO MIDS: no group ping-pongs between two players (top-2 combined share)", () => {
    for (const src of ["m26", "m27"] as const) {
      const snap = src === "m26" ? snap26 : snap27;
      for (const [name, positions] of Object.entries(GROUPS)) {
        const pool = stripMids(filterPool(snap.players, positions));
        if (pool.length === 0) continue;
        const counts = new Map<string, number>();
        const N = 200;
        for (let i = 0; i < N; i++) {
          const id = planScan(`pp-${src}-${name}-${i}-${Math.random()}`, pool).card.playerId;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        const top2 = [...counts.values()].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
        expect(top2 / N).toBeLessThan(0.2); // a two-card loop would dominate 60%+
      }
    }
  });

  it("every group, m26, sanity shares", () => {
    for (const [name, positions] of Object.entries(GROUPS)) {
      const pool = filterPool(snap26.players, positions);
      const r = probe(`m26 ${name}`, pool);
      // pathological loop = one card dominating; uniform draws spread wide
      expect(r.topShare).toBeLessThan(0.25);
      expect(r.unique).toBeGreaterThan(Math.min(10, pool.length));
    }
  });
});
