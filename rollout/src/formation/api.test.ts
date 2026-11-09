import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { gameFromPayload, nextPublishedQuarter, type DailyPayload, type PubPlayer } from "./engine/daily";

/** A real published payload shape (mirrors worker/src/daily.ts output). */
const pp = (team: string, jersey: number) => ({
  team, side: "off" as const, key: "QB", label: "QB", pos: "QB", jersey, ini: "P.M.", fullName: "Patrick Mahomes",
  college: "Texas Tech", rating: 94, playerId: `ea-${jersey}`, stamp: "M" as const, cls: "jack" as const,
});
const lineup = (team: string) => Array.from({ length: 11 }, (_, i) => ({ ...pp(team, 1 + i), key: `S${i}`, label: `P${i}` }));
const payload: DailyPayload = {
  day: "2026-11-09", dataVersion: "week-6", seed: "fm-daily:2026-11-09:week-6",
  quarters: [0, 1, 2, 3].map((q) => ({ offense: `O${q}`, defense: `D${q}`, lineups: { off: lineup(`O${q}`), def: lineup(`D${q}`) } })),
};

describe("gameFromPayload", () => {
  it("builds quarter one of a published game — no local dataset involved", () => {
    const g = gameFromPayload(payload, 0);
    expect(g.seed).toBe(payload.seed);
    expect(g.sides.map((s) => s.team)).toEqual(["O0", "D0"]);
    expect(g.sides[0].lineup.every((p) => (p as PubPlayer).team === "O0")).toBe(true);
    expect(g.sides[0].lineup[0].jersey).toBe(1);
    expect(eligibleAllFresh(g)).toBe(true);
  });
  it("nextPublishedQuarter deals the payload's next pairing, carrying chips/schemes/counters", () => {
    const g = gameFromPayload(payload, 0);
    g.chips = 2;
    g.schemes.scouting = true;
    g.quartersSolved = 1;
    g.over = { kind: "solved", score: 5, banked: 0 };
    expect(nextPublishedQuarter(g, payload)).toBe(true);
    expect(g.quarter).toBe(2);
    expect(g.sides.map((s) => s.team)).toEqual(["O1", "D1"]);
    expect([g.chips, g.schemes.scouting, g.quartersSolved, g.downs, g.pulls]).toEqual([2, true, 1, 4, 0]);
    expect(nextPublishedQuarter({ ...g, quarter: 4, over: { kind: "solved", score: 1, banked: 0 } }, payload)).toBe(false);
  });
});

function eligibleAllFresh(g: ReturnType<typeof gameFromPayload>): boolean {
  return g.sides.every((S) => S.slots.every((s) => s.layer === 0 && !s.fd && !s.sealed && !s.pending));
}

describe("fetchDaily", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = origFetch; vi.restoreAllMocks(); });
  beforeEach(() => { vi.unstubAllEnvs(); });

  it("returns the payload on success, null on failure or bad shape", async () => {
    const { setApiBase, fetchDaily } = await import("./api");
    setApiBase("https://worker.example");
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    expect((await fetchDaily("2026-11-09", "week-6"))?.seed).toBe(payload.seed);

    globalThis.fetch = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    expect(await fetchDaily("2026-11-09", "week-6")).toBeNull();

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ day: "x" }), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchDaily("2026-11-09", "week-6")).toBeNull();
    setApiBase("");
  });

  it("with no API configured it never fetches (clean degradation)", async () => {
    const { setApiBase, fetchDaily } = await import("./api");
    setApiBase("");
    const called = vi.fn();
    globalThis.fetch = called as unknown as typeof fetch;
    expect(await fetchDaily("2026-11-09", "week-6")).toBeNull();
    expect(called).not.toHaveBeenCalled();
  });
});
