# FORMATION — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship FORMATION phase A — the pure game engine, the full screen (field up / action area down), solo free play (4 quarters), and THE PULL at full feel (charge, PERFECT release, reel, verdict faces, arc flight, landing) plus both call theatricals.

**Architecture:** All new code in `rollout/src/formation/` (engine + store + feel + screen), reusing the app's seeded RNG, synth/haptics architecture, and storage idiom. The screen is ported from the committed, smoke-tested mock `docs/design/formation-mock-v3.html`. Game state is plain JSON (rng passed in, never stored) so a game survives tab kills.

**Tech Stack:** React + TypeScript + Vite (existing app), vitest + @testing-library/react, WebAudio Synth class (existing), navigator.vibrate via existing `haptic()`, Canvas 2D for charge FX, WAAPI for the card flight.

**Spec:** `docs/superpowers/specs/2026-11-07-formation-design.md` (read it first — rules §2, screen §4, the pull §5, theatricals §6, architecture §9). Feel/copy source of truth: `docs/design/formation-mock-v3.html`.

## Global Constraints

- CI needs Node 22 (workflows already pin it); no new npm dependencies.
- Formation code lives only in `rollout/src/formation/` + bench scripts at `rollout/formation-*.mjs`. Never modify Scanner behavior; `App.test.tsx` must stay green untouched.
- Design width 320 CSS px (his phone is 320×624 @ DPR 3.375); zero page scroll; field height `min(320px, 41dvh)`.
- Every ms / size / haptic / volume constant lives in `rollout/src/formation/feel.ts`. No magic numbers in components.
- Storage key `rollout.formation.v1`; corrupt JSON → fresh save; `pending` flags never persist.
- Reduced motion: no growth, no particles, no flight; sounds + haptics retained.
- Workbox precache: per-file cap 3 MB (formation adds only code — no new precached assets; the 32 mascots are already cached).
- House-voice English copy; the wrong call is always flat (`no.`), never a celebration.
- Tests run from `rollout/`: `npx vitest run <path>`.

## Review Focus

1. **Tab killed mid-pull** (between flight start and commit): a `pending` slot must never persist — `loadFormationSave` clears pending/fd-in-flight flags, or the resumed game strands a clue nobody can reveal. Test in Task 4.
2. **31 teams crossed out, one live**: the call picker must still offer the one live team and the call must resolve — no dead-end sheet. Test in Task 8.
3. **Every slot revealed, downs left, nobody called**: spin must disable with "Make the call." — not crash on an empty pool. Test in Task 3.
4. **NO-HUDDLE with exactly one eligible slot left**: deals one card, never loops or double-picks the same slot. Tests in Tasks 2 and 3.
5. **Both data sources**: `buildLineups` must fill 11+11 for all 32 teams on `m26` AND `m27` (position sets differ slightly). Test in Task 1.

---

### Task 1: Lineup derivation + stamps (`engine/lineups.ts`)

**Files:**
- Create: `rollout/src/formation/engine/lineups.ts`
- Test: `rollout/src/formation/engine/lineups.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `Card` from `@/data/schema` (`Card` has `playerId, fullName, position, team, jersey, college, rating`).
- Produces (later tasks rely on exactly these names):
  - `OFF_SLOTS: [pos: string, label: string][]` and `DEF_SLOTS: [pos: string, label: string][]`
  - `SlotPlayer { key, label, pos, jersey, ini, college, stamp: "P"|"M"|"C", cls: "common"|"skill"|"jack", rating, playerId, fullName }`
  - `SideLineup { team: string; slots: SlotPlayer[] }` (11, in slot order)
  - `TeamLineups { off: SideLineup; def: SideLineup }`
  - `buildLineups(snapshot: Snapshot): Record<string, TeamLineups>` — 32 teams, `"FA"` excluded.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@/data/snapshot";
import { buildLineups, OFF_SLOTS, DEF_SLOTS } from "./lineups";

for (const src of ["m26", "m27"] as const) {
  describe(`lineups ${src}`, () => {
    const L = buildLineups(loadSnapshot(src));
    it("fills 11+11 for all 32 teams (no FA)", () => {
      expect(Object.keys(L).length).toBe(32);
      for (const t of Object.values(L)) {
        expect(t.off.slots.length).toBe(11);
        expect(t.def.slots.length).toBe(11);
        t.off.slots.forEach((s) => expect(s.jersey).toBeGreaterThan(0));
        t.def.slots.forEach((s) => expect(s.jersey).toBeGreaterThan(0));
      }
    });
    it("ranks stamps: exactly 3-per-team-slot top PEAK / bottom CHEEKS (9/96 WR+CB, 6/64 DT)", () => {
      const byPos = new Map<string, number[]>();
      for (const t of Object.values(L)) for (const s of [...t.off.slots, ...t.def.slots]) {
        byPos.set(s.pos, [...(byPos.get(s.pos) ?? []), s.stamp === "P" ? 1 : s.stamp === "C" ? -1 : 0]);
      }
      for (const t of Object.values(L)) for (const s of [...t.off.slots, ...t.def.slots]) {
        // every PEAK-rated slot player must outrate every CHEEKS-rated one at his position
        const peers = Object.values(L).flatMap((x) => [...x.off.slots, ...x.def.slots]).filter((p) => p.pos === s.pos);
        if (s.stamp === "P") for (const p of peers) if (p.stamp === "C") expect(s.rating).toBeGreaterThan(p.rating);
      }
      const count = (arr: number[], v: number) => arr.filter((x) => x === v).length;
      for (const [pos, marks] of byPos) {
        expect(count(marks, 1)).toBe(pos === "WR" || pos === "CB" ? 9 : pos === "DT" ? 6 : 3);
        expect(count(marks, -1)).toBe(count(marks, 1));
      }
    });
    it("classes: QB is offense jackpot, defense jackpot = its top-rated defender", () => {
      for (const t of Object.values(L)) {
        expect(t.off.slots[0].pos).toBe("QB");
        expect(t.off.slots[0].cls).toBe("jack");
        expect(t.off.slots.filter((s) => s.cls === "skill").length).toBe(5); // HB WR WR WR TE
        expect(t.off.slots.filter((s) => s.cls === "common").length).toBe(5); // OL
        const best = [...t.def.slots].sort((a, b) => b.rating - a.rating)[0];
        expect(t.def.slots.filter((s) => s.cls === "jack")).toEqual([expect.objectContaining({ playerId: best.playerId })]);
      }
    });
    it("initials: first letters of name parts, suffixes stripped (Jr/Sr/II/III/IV)", () => {
      const L27 = buildLineups(loadSnapshot("m27"));
      const geno = Object.values(L27).flatMap((t) => [...t.off.slots, ...t.def.slots]).find((s) => s.fullName === "Geno Smith");
      expect(geno?.ini).toBe("G.S.");
      const derwin = Object.values(L27).flatMap((t) => [...t.off.slots, ...t.def.slots]).find((s) => s.fullName.startsWith("Derwin James"));
      expect(derwin?.ini).toBe("D.J.");
    });
  });
}
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/formation/engine/lineups.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**

```ts
import type { Snapshot, Card } from "@/data/schema";

export const OFF_SLOTS: [string, string][] = [["QB","QB"],["HB","HB"],["WR","WR"],["WR","WR"],["WR","WR"],["TE","TE"],["LT","LT"],["LG","LG"],["C","C"],["RG","RG"],["RT","RT"]];
export const DEF_SLOTS: [string, string][] = [["LEDG","EDGE"],["REDG","EDGE"],["DT","DT"],["DT","DT"],["MIKE","MIKE"],["WILL","WILL"],["CB","CB"],["CB","CB"],["CB","CB"],["FS","FS"],["SS","SS"]];

export interface SlotPlayer { key: string; label: string; pos: string; jersey: number; ini: string; college: string; stamp: "P"|"M"|"C"; cls: "common"|"skill"|"jack"; rating: number; playerId: string; fullName: string }
export interface SideLineup { team: string; slots: SlotPlayer[] }
export interface TeamLineups { off: SideLineup; def: SideLineup }

const ini = (name: string) => name.replace(/ (Jr|Sr|II|III|IV)\.?$/,"").split(/[ -]/).filter(Boolean).map((w) => w[0].toUpperCase()).join(".") + ".";

export function buildLineups(snapshot: Snapshot): Record<string, TeamLineups> {
  const byTeam = new Map<string, Card[]>();
  for (const p of snapshot.players) {
    if (p.team === "FA") continue;
    byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), p]);
  }
  // stamps per position across the league: top/bottom 3 per team-slot share
  const stampOf = new Map<string, "P"|"M"|"C">();
  const positions = new Set([...OFF_SLOTS, ...DEF_SLOTS].map(([p]) => p));
  const perTeamCount = new Map(positions.map((p) => [p, [...OFF_SLOTS, ...DEF_SLOTS].filter(([q]) => q === p).length]));
  for (const pos of positions) {
    const league = [...byTeam.values()].flatMap((ps) => ps.filter((p) => p.position === pos)).sort((a,b) => b.rating - a.rating);
    const k = 3 * (perTeamCount.get(pos) ?? 1);
    league.forEach((p, i) => stampOf.set(p.playerId, i < k ? "P" : i >= league.length - k ? "C" : "M"));
  }
  const side = (team: string, spec: [string,string][], cls: (i: number, pos: string) => "common"|"skill"|"jack", jackpotId: string | null): SideLineup => {
    const ps = byTeam.get(team) ?? [];
    const out: SlotPlayer[] = [];
    spec.forEach(([pos, label], i) => {
      const p = ps.filter((x) => x.position === pos).sort((a,b) => b.rating - a.rating)[0];
      out.push({ key: pos + (spec.filter(([q]) => q === pos).length > 1 ? String(spec.slice(0, i + 1).filter(([q]) => q === pos).length) : ""), label, pos, jersey: p.jersey, ini: ini(p.fullName), college: p.college, stamp: stampOf.get(p.playerId)!, cls: p.playerId === jackpotId ? "jack" : cls(i, pos), rating: p.rating, playerId: p.playerId, fullName: p.fullName });
    });
    return { team, slots: out };
  };
  const offCls = (i: number) => (i === 0 ? "jack" : i <= 5 ? "skill" : "common") as const;
  const L: Record<string, TeamLineups> = {};
  for (const [team, ps] of byTeam) {
    const defSpec = DEF_SLOTS;
    const defPicks = defSpec.map(([pos]) => ps.filter((x) => x.position === pos).sort((a,b) => b.rating - a.rating)[0]);
    const jackpot = defPicks.slice().sort((a,b) => b.rating - a.rating)[0];
    L[team] = { off: side(team, OFF_SLOTS, offCls, null), def: side(team, defSpec, () => "common", jackpot.playerId) };
  }
  return L;
}
```

- [ ] **Step 4: Run tests → PASS** (all 8).
- [ ] **Step 5: Commit** — `git add src/formation/engine && git commit -m "feat(formation): lineup derivation — starters, within-slot PEAK/CHEEKS stamps, rarity classes"`

### Task 2: Game state + pulls (`engine/game.ts`, part 1)

**Files:**
- Create: `rollout/src/formation/engine/game.ts`
- Test: `rollout/src/formation/engine/game.test.ts`

**Interfaces:**
- Consumes: `SlotPlayer, TeamLineups` from `./lineups`; `makeRng` from `@/engine/rng`.
- Produces:
  - `type Layer = 0|1|2|3`; `interface SlotState { layer: Layer; fd: boolean; sealed: boolean; ghost: boolean; pending: boolean }`
  - `interface SideState { team: string; slots: SlotState[]; solved: boolean; out: string[]; wrongCalls: number }`
  - `interface LogEntry { n: number; kind: "plain"|"peak"|"cheeks"; text: string }`
  - `interface PullPlan { side: 0|1; index: number; kind: "fd"|"lit"|"cheeks"; face: "gold"|"brown"|"plain"; num: string; sub: string; toast: string }`
  - `interface GameState { quarter: number; sides: [SideState, SideState]; pulls: number; downs: number; chips: number; noHuddle: boolean; film: boolean; schemes: { starPower: boolean; scouting: boolean }; over: null | { kind: "solved"|"turnover"; score: number; banked: number }; total: number; perfects: number; log: LogEntry[] }`
  - `createGame(seed: string, lineups: Record<string, TeamLineups>, teams?: [string, string]): GameState` — picks two different teams via rng when not given (tests pass explicit teams)
  - `lineupOf(state, side, lineups): SideLineup` helper for rendering
  - `eligible(state): { side: 0|1; index: number }[]` — fresh-first; `fd`/`sealed`/`pending` excluded from both pools
  - `planPull(state, rng): PullPlan | null` — marks the slot `pending`, computes the reveal
  - `commitPull(state, plan): LogEntry` — clears `pending`, applies layer/fd
  - `WEIGHTS = { common: 3, skill: 2, jack: 1 }` (from `feel.ts` in Task 5; until then define locally and re-export — Task 5 swaps the source)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { makeRng } from "@/engine/rng";
import { loadSnapshot } from "@/data/snapshot";
import { buildLineups } from "./lineups";
import { commitPull, createGame, eligible, planPull } from "./game";

const L = buildLineups(loadSnapshot("m27"));
const g0 = () => createGame("t", L, ["KC", "BUF"]);

describe("pulls", () => {
  it("fresh-first: 22 pulls light 11+11 numbers before any dig", () => {
    const g = g0();
    for (let i = 0; i < 22; i++) { const p = planPull(g, makeRng(String(i)))!; commitPull(g, p); }
    expect(g.sides[0].slots.filter((s) => s.layer > 0).length).toBe(11);
    expect(g.sides[1].slots.filter((s) => s.layer > 0).length).toBe(11);
  });
  it("a face-down PEAK is not fresh and not diggable; commit marks fd", () => {
    const g = g0();
    let plan: ReturnType<typeof planPull>;
    let guard = 0;
    do { plan = planPull(g, makeRng("x" + guard++))!; commitPull(g, plan); } while (plan.kind !== "fd" && guard < 80);
    expect(plan!.kind).toBe("fd");
    const fdIdx = g.sides[plan!.side].slots.findIndex((s) => s.fd);
    expect(fdIdx).toBeGreaterThanOrEqual(0);
    expect(eligible(g).some((e) => e.side === plan!.side && e.index === fdIdx)).toBe(false);
  });
  it("no-huddle plans two DIFFERENT slots and never a pending one", () => {
    const g = g0(); g.noHuddle = true;
    const a = planPull(g, makeRng("a"))!; const b = planPull(g, makeRng("b"))!;
    expect(a.side !== b.side || a.index !== b.index).toBe(true);
  });
  it("empty pool returns null (make the call)", () => {
    const g = g0();
    for (const si of [0, 1] as const) g.sides[si].slots.forEach((s) => { s.layer = 1; });
    expect(planPull(g, makeRng("z"))).toBeNull();
  });
  it("digs deepen the same slot: number → initials → college", () => {
    const g = g0();
    // seal 10 of 11 offense slots so the only eligible target is slot 0, already lit at layer 1
    g.sides[0].slots.forEach((s, i) => { if (i > 0) s.sealed = true; });
    g.sides[0].slots[0].layer = 1;
    const p1 = planPull(g, makeRng("d1"))!;
    expect(p1.index).toBe(0);
    expect(p1.sub).toBe(L.KC.off.slots[0].ini);
    commitPull(g, p1);
    const p2 = planPull(g, makeRng("d2"))!;
    expect(p2.sub).toBe(L.KC.off.slots[0].college);
    expect(p2.toast).toContain(L.KC.off.slots[0].college);
  });
});
```

- [ ] **Step 2: Run → FAIL** (module missing).
- [ ] **Step 3: Implement** — port `eligible`/`choose`/`planReveal`/`commit` from `docs/design/formation-mock-v3.html` (`eligible()`, `choose()`, `planReveal()`, `commit()`), typed per Interfaces; toast copy verbatim from the mock (`where()` helper: `(side ? "DEF " : "OFF ") + label`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `feat(formation): pull engine — fresh-first eligibility, weighted choice, layer digs, face-down PEAKs`

### Task 3: Calls, downs, quarters, chips, scoring (`engine/game.ts`, part 2)

**Files:**
- Modify: `rollout/src/formation/engine/game.ts`
- Test: `rollout/src/formation/engine/game.test.ts` (append)

**Interfaces:**
- Produces:
  - `call(state, side: 0|1, team: string): { correct: boolean; quarterEnded: boolean; banked: number }`
  - `applyPlay(state, play: "nohuddle"|"film"|"flag"): boolean` (false when not affordable/applicable)
  - `buyScheme(state, which: "starPower"|"scouting"): boolean` (halftime only, chips ≥ 2/3)
  - `quarterScore(state): number` — pulls, or `TURNOVER_PENALTY` (feel) when turnover
  - `finalScore(state): number` — `total − chips`
  - `nextQuarter(state, lineups, rng)` / `restartGame(...)` mutators; `SCOUTING_CROSSES = 3`

- [ ] **Step 1: Failing tests** (append):

```ts
describe("calls + scoring", () => {
  it("wrong call burns a shared down, crosses out that team on that side only", () => {
    const g = g0();
    const r = call(g, 0, "NE"); // KC offense
    expect(r.correct).toBe(false); expect(g.downs).toBe(3); expect(g.sides[0].out).toEqual(["NE"]); expect(g.sides[1].out).toEqual([]);
  });
  it("four wrongs = turnover scoring TURNOVER_PENALTY, banks face-down chips, ghosts appear", () => {
    const g = g0();
    for (const t of ["NE","ARI","ATL","CAR"]) call(g, 0, t);
    expect(g.over).toEqual({ kind: "turnover", score: 70, banked: expect.any(Number) });
    expect(g.sides[0].slots.every((s) => s.ghost || s.layer > 0 || s.fd === false)).toBe(true);
  });
  it("solving a side removes it from pulls and its team from the other side's picker", () => {
    const g = g0();
    expect(call(g, 0, "KC").correct).toBe(true);
    expect(eligible(g).every((e) => e.side === 1)).toBe(true);
    expect(call(g, 1, "KC").correct).toBe(false); // blocked from the picker by the UI; engine still counts it wrong
  });
  it("both sides solved ends the quarter with score = pulls; turnover always scores worse than a slow solve", () => {
    const g = g0();
    for (let i = 0; i < 60; i++) { const p = planPull(g, makeRng("s" + i)); if (!p) break; commitPull(g, p); }
    const slow = g.pulls;
    call(g, 0, "KC"); call(g, 1, "BUF");
    expect(g.over!.kind).toBe("solved"); expect(g.over!.score).toBe(slow);
    expect(70).toBeGreaterThan(slow + 20);
  });
  it("chips: unspent knock the final score; schemes cost at halftime only", () => {
    const g = g0(); g.chips = 3; g.quarter = 2; g.total = 40;
    expect(buyScheme(g, "starPower")).toBe(true); expect(g.chips).toBe(1); expect(g.schemes.starPower).toBe(true);
    expect(buyScheme(g, "scouting")).toBe(false); // costs 3, only 1 left
    g.chips = 5; g.quarter = 1;
    expect(buyScheme(g, "scouting")).toBe(false); // not halftime
    expect(finalScore(g)).toBe(40 - 5 + 0); // total - unspent chips (schemes already spent)
  });
  it("challenge flag restores a down exactly once per wrong call", () => {
    const g = g0();
    call(g, 0, "NE"); expect(applyPlay(g, "flag")).toBe(true); expect(g.downs).toBe(4);
    expect(applyPlay(g, "flag")).toBe(false);
  });
  it("scouting crosses 3 wrong teams on each remaining quarter's start", () => {
    const g = g0(); g.schemes.scouting = true; g.over = { kind: "solved", score: 5, banked: 0 };
    nextQuarter(g, L, makeRng("q2"));
    expect(g.sides[0].wrongCalls).toBe(0); expect(g.sides[0].out.length + g.sides[1].out.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run → FAIL.** **Step 3: Implement** (port `call`/`end`/`applyPlay` logic from the mock's `call()`/`end()`; add `buyScheme`/`nextQuarter`/score helpers; `TURNOVER_PENALTY`, `PEAK_QUARTER_PULLS`, `SCOUTING_CROSSES` from feel values 70 / 8 / 3 — local consts until Task 5). **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(formation): calls, shared downs, quarters, chip economy, scoring`

### Task 4: Persistence (`store.ts`)

**Files:**
- Create: `rollout/src/formation/store.ts` + `store.test.ts`

**Interfaces:**
- `interface FormationSave { inProgress: GameState | null; bestGame: number | null; gamesPlayed: number }`
- `freshFormationSave()`, `loadFormationSave()`, `writeFormationSave(save)` (idiom: copy `storage/storage.ts`)

- [ ] **Step 1: Failing tests** — round-trip; corrupt JSON → fresh; **pending never persists** (set a slot `pending: true`, write, load, expect all `pending === false`); best-game math (`bestGame = min`).
- [ ] **Step 2: FAIL.** **Step 3: Implement** — `loadFormationSave` deep-copies and clears `pending` on every slot of a resumed game. **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(formation): save/resume — in-progress games survive reloads; pending never persists`

### Task 5: Feel constants + haptics + synth additions

**Files:**
- Create: `rollout/src/formation/feel.ts`
- Modify: `rollout/src/haptics/haptics.ts` (append), `rollout/src/audio/synth.ts` (append)
- Test: `rollout/src/formation/feel.test.ts` (haptic names present)

**Interfaces:**
- `feel.ts` exports every constant in spec §13: `WEIGHTS`, `TURNOVER_PENALTY = 70`, `PEAK_QUARTER_PULLS = 8`, `FULL_CHARGE_MS = 1400`, `BREATH_MIN = 0.9`, `BREATH_MAX = 3.0`, `PERFECT_SIN = 0.75`, `REEL_FIRST_MS = 950`, `REEL_MS = 620`, `FLIGHT_MS = 560`, `VERDICT_PLAIN_MS = 430`, `VERDICT_BIG_MS = 780`, `CONFIRMED_WAVE_STAGGER_MS = 75`, `FLAT_DEAD_AIR_MS = 380`, `FLAT_HOLD_MS = 750`, `SCOUTING_CROSSES = 3`, `SCHEME_PRICES = { starPower: 2, scouting: 3 }`, `CELEBRATE_LINGER_MS = 2100`.
- Haptics: append names `formationTick [8]`, `formationLand [35]`, `formationPerfect [10,30,10,30,80]`, `formationFlat [28]`, `formationWave [8]` to `HAPTICS` + union.
- Synth (append methods, same idiom as `chargeStart`): `formationRiserStart()`, `formationRiserUpdate(level: number, breath: number)`, `formationRiserStop()`, `waveTick(i: number)`, `fanfare()`, `thunk()`, `whoosh()`, `landThud()`, `crackle()` — port oscillator recipes verbatim from the mock's `riserStart/riserUpdate/riserStop` and `sfx` object (`docs/design/formation-mock-v3.html`), adapted to `this.ctx/this.master/this.t` and `this.enabled`.

- [ ] **Step 1: Failing test** — every `feel.ts` export is a number/record with the spec values; every new `HapticName` resolves in `HAPTICS`.
- [ ] **Step 2: FAIL → Step 3: Implement → Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(formation): feel constants + haptic vocabulary + formation synth voices`

### Task 6: Screen shell — field, chips, HUD, sheets, door

**Files:**
- Create: `rollout/src/formation/FormationScreen.tsx`, `FormationScreen.css`, `Field.tsx`, `SlotChip.tsx`, `sheets.tsx`
- Modify: `rollout/src/App.tsx` (view switch + door)
- Test: `rollout/src/formation/FormationScreen.test.tsx`

**Interfaces:**
- Consumes: engine (Tasks 1-3), store (4), feel (5), `synth`/`haptic`.
- Produces: `FormationScreen({ lineups, onExit }: { lineups: Record<string, TeamLineups>; onExit: () => void })` rendered by App when `view === "formation"`.
- **Port source:** markup + CSS verbatim from `docs/design/formation-mock-v3.html` — phone wrapper becomes the screen root; `.fs-phone` styles become `FormationScreen.css` root classes (drop the 780px fixed height; `100dvh` + `min(320px,41dvh)` field per constraints); `FIELD` coordinate map, `chip()` renderer, `hud()`, `barWho/barCall`, `sheet()`/`overSheet()` markup, TAPE sheet — all in the mock's `<script>`, copy and type them.

- [ ] **Step 1: Failing render test**

```tsx
import { render, screen } from "@testing-library/react";
import { buildLineups } from "./engine/lineups";
import { loadSnapshot } from "@/data/snapshot";
import { FormationScreen } from "./FormationScreen";

it("renders the field: 22 chips, HUD Q1, four down pips, both CALL buttons, TAPE", () => {
  render(<FormationScreen lineups={buildLineups(loadSnapshot("m27"))} onExit={() => {}} />);
  expect(screen.getAllByTestId(/^slot-/).length).toBe(22);
  expect(screen.getByText("Q1")).toBeInTheDocument();
  expect(screen.getAllByTestId("down-pip").length).toBe(4);
  expect(screen.getAllByRole("button", { name: /CALL/ }).length).toBe(2);
  expect(screen.getByRole("button", { name: "TAPE" })).toBeInTheDocument();
});
```

- [ ] **Step 2: FAIL → Step 3: Implement the port** (state via a `useReducer`-less `useState<GameState>` + helper mutators; sheets as local state `{type: ...}`; `data-testid={"slot-" + side + "-" + i}` on every chip; App.tsx gains `const [view, setView] = useState<"scanner"|"formation">("scanner")` and a door button `data-testid="formation-door"` in the top bar area; App.test stays green — the door is additive). **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(formation): screen shell — field, chips, HUD, sheets, App door`

### Task 7: THE PULL — charge, detonation, reel, flight, landing

**Files:**
- Modify: `rollout/src/formation/FormationScreen.tsx` (+ `ActionStage.tsx`, `ChargeFX.tsx` new)
- Test: `rollout/src/formation/FormationScreen.test.tsx` (append)

**Interfaces:**
- `ActionStage` owns: pointer/keyboard hold on the card + HOLD button (`pointerdown` → charge; window `pointerup/pointercancel` → release; Space/Enter down/up), the charge rAF loop (grow 1→1.5×, lift, breath 0.9→3.0/s, `--glow`), `ChargeFX` canvas (90 streak particles spawning screen-wide spiraling into the card, pull strongest on inhale; gold motes > 70%; crackle > 55%; echo rings at full; shiver at full), vignette, riser via synth, haptic ladder via `chargeLevel()`.
- Release path = **plan → animate → commit** (the mock's proven order): compute plans (1 or 2 for no-huddle), then per plan: reel (`REEL_FIRST_MS`/`REEL_MS`, tick sfx, number flicker) → verdict face (`gold`+stamp+burst / `brown`+droop+flutter / plain click) → WAAPI arc flight (`FLIGHT_MS`, 3 keyframes, fixed-position clone; skip when `prefers-reduced-motion`) → `commitPull` → `render` → `landThud` + ring flash. **The stage DOM is never inside the re-render blast radius** (mock's `kept` pattern: re-renders adopt the live action element).
- PERFECT: `C.level >= 1 && sin(C.phase) > PERFECT_SIN` → flash + gold shockwave + stamp + `formationPerfect` haptic; increments `state.perfects`; never alters plans.

- [ ] **Step 1: Failing interaction test** — `fireEvent.pointerDown/pointerUp` on the hold button with `prefers-reduced-motion` stubbed true: after release + `await waitFor`, exactly one slot gains a number (`slot-N-*` gains `lit` class / aria-label containing `#`), SPINS increments to 1, no throw.
- [ ] **Step 2: FAIL → Step 3: Port from the mock** (`chargeStart`, `chargeFrame`, `fxLoop`, `spawn`, `release`, `revealAndFly`, `flyCard`, `resetCard`, `burstAt` — all verbatim-adapted; `matchMedia` guarded for jsdom: `const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false`). **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(formation): THE PULL — breathe-in-the-universe charge, detonation, reel, verdict faces, arc flight, landing, PERFECT release`

### Task 8: Call theatricals + quarter flow

**Files:**
- Modify: `rollout/src/formation/FormationScreen.tsx` / `sheets.tsx`
- Test: append to `FormationScreen.test.tsx`

**Interfaces:** async `callSide(side, team)` — closes picker, `engine.call`, then per result: CONFIRMED sequence (stamp, fanfare, tint `.enter`, 11-slot wave stagger `CONFIRMED_WAVE_STAGGER_MS` with `waveTick(i)` + every-3rd `formationWave` haptic, offense wave reversed to end on the QB, gold `burstAt` side center; CALL buttons visibly disabled while busy) or flat sequence (dead air `FLAT_DEAD_AIR_MS`, gray lowercase `no.` stamp, `thunk` + `formationFlat`, `FLAT_HOLD_MS`). Quarter-end → over sheet (`PEAK QUARTER` ≤ `PEAK_QUARTER_PULLS` / `Qn FINAL` / `TURNOVER ON DOWNS`), NEXT QUARTER (halftime: scheme shop when `quarter === 2`), NEW GAME resets + records `bestGame`.

- [ ] **Step 1: Failing tests** — pick a wrong team: await `no.` stamp appears then fades, downs pip count drops to 3; solve both sides via a forced known answer (pass explicit teams to `createGame` through a test-only prop `initialTeams`): CONFIRMED stamp + ≥9 slots gain `wave` class during the stagger + over sheet shows `Q1 FINAL` with the pull count. **Picker dead-end (Review Focus 2):** cross out 30 teams via repeated wrong calls with a rigged 4-down… instead unit-test the engine path `sides[0].out.length === 31` then `call(state,0,liveTeam)` returns `{correct:true}` — append to `game.test.ts`.
- [ ] **Step 2: FAIL → Step 3: Port** (`celebrateCall`, `flatNo`, mock's call sheet + picker with crossed-out teams). **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(formation): call theatricals — CONFIRMED wave vs flat no.; quarter finals, halftime shop`

### Task 9: Free-play loop + TAPE + resume

**Files:**
- Modify: screen files; Test: append

- [ ] **Step 1: Failing tests** — after Q1 ends, NEXT QUARTER → HUD `Q2`, fresh field; four quarters → final sheet shows `FINAL: n spins − n chips = m`; NEW GAME → `Q1`, `SPINS 0`; TAPE sheet lists log entries newest-first; **resume (Review Focus 1):** render with a saved in-progress game (write via `writeFormationSave` with `pending: true` on a slot), reload → game continues, that slot not stranded (its `pending` false, still pullable).
- [ ] **Step 2: FAIL → Step 3: Implement** (write save on every commit/quarter end; `loadFormationSave` on mount; TAPE = log slice 14). **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(formation): 4-quarter free-play loop, TAPE, save/resume`

### Task 10: Bench tools + full-suite green + ship

**Files:**
- Create: `rollout/formation-probe.mjs` (Playwright: 20 pulls incl. fd play/spend/leave, both ceremonies, 4 quarters to FINAL — assert 0 pageerrors; pattern: `smoke5.cjs` in this session's notes → adapt `rollout/void.mjs` structure), `rollout/formation-audit.mjs` (320×624 + 390×844 + 834×1194: page fit, 22 chips in field, no overlap — adapt `audit.mjs`), `rollout/formation-phone.mjs` (one-liner: `vite preview --host --port 4181` detached + `adb reverse tcp:4181 tcp:4181` + `adb shell am start ... localhost:4181` + CDP reload helper).

- [ ] **Step 1: Run `node formation-probe.mjs` against a local build → 0 errors, ceremonies observed. Step 2: Run `node formation-audit.mjs` → exact fit ×3 viewports. Step 3: `npx vitest run` (full suite) → green incl. untouched App tests. Step 4: `npm run build` → precache list sane (no >3MB file). Step 5: Commit + push** — `feat(formation): phase A complete — bench tools, full suite green` (push auto-deploys; the door ships dark to scanner users until announced).

## Self-Review (done)

- **Spec coverage:** rules §2 → Tasks 1-3 · screen §4 → 6 · pull §5 → 7 (+feel 5) · theatricals §6 → 8 · free play §7 (daily/wall = phase B per spec §11) · board/worker §8 = phase C · architecture §9 → folder layout in every task · testing §10 → task tests + Task 10 tools. Gaps: none for phase A.
- **Placeholders:** none — every step carries code or a verbatim port pointer into a committed file.
- **Type consistency:** `SlotPlayer/SideLineup/TeamLineups` (T1) consumed by T2/T6; `GameState` fields match across T2/T3/T4/T6-9; feel constants defined T5, referenced by name afterward.
- **Review Focus:** each line has its pinned test (T4, T8+game.test, T3, T2/T3, T1).
