# FORMATION — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The daily (one attempt, streak, share line, locally-seeded until the phase-C Worker), the 32-mascot trophy wall with gold frames, and the quarter-final house voice.

**Architecture:** Everything extends `rollout/src/formation/` and the existing save; no Worker yet (spec §11-B transitional design: daily = seed `f(date, dataVersion)` derived on-device). Determinism switches to **per-pull seeded RNG** so a resumed game needs no stream resync (dissolves the "persist the seed" landmine: a pull's randomness depends only on seed + pull index).

**Tech Stack:** unchanged (React+TS+Vite, vitest, existing houseVoice/clipboard/mascot assets).

**Spec:** `docs/superpowers/specs/2026-11-07-formation-design.md` §7 (modes, wall, share, spoilers n/a until C), §11 build order, §5 house voice. Phase-A ledger landmines honored: per-pull RNG (seed persistence moot), `#formation` hash cleared on exit, House Voice on the quarter-final's ~2s stage.

## Global Constraints

Same as phase A (Node 22, no new deps, all code in `src/formation/`, feel timings in `feel.ts`, 320px-first, reduced-motion, tests from `rollout/`). Additions:
- The daily must NEVER be replayable in the same local day (one attempt, in-progress resumes).
- Local dates (`YYYY-MM-DD` from local time), never UTC.
- Old `rollout.formation.v1` saves load with defaults for every new field (no key bump).
- Wall art = existing `public/mascots/*.png` via `MASCOT_ART`; names via `MASCOTS` (engine/void.ts) — no duplication.

## Review Focus

1. **A daily resumed on a new local day** (started 11:59pm, resumed 12:01am): the in-progress daily finishes under its original date/seed; the NEW day's daily stays fresh — test in Task 1/5.
2. **Clock/timezone**: streak math uses injected date strings (pure), never `new Date()` inside the engine — test in Task 1.
3. **Wall write conflicts**: solving the same team again must not downgrade an existing gold frame — test in Task 4.
4. **Free play must not touch daily state** (and vice versa) — one shared in-progress slot must swap safely between modes — test in Task 5.
5. **Share text on a turnover-heavy game** (0 quarters solved): formats sanely, no NaN/undefined — test in Task 5.

---

### Task 1: `engine/daily.ts` — seeds, dates, streak (pure)

**Files:** Create `rollout/src/formation/engine/daily.ts` · Test `daily.test.ts`

**Interfaces (produces):**
- `localDay(d = new Date()): string` — `YYYY-MM-DD` in local time.
- `dailySeed(day: string, dataVersion: string): string` — `"fm-daily:" + day + ":" + dataVersion`.
- `nextStreak(streak: number, lastPlayedDay: string | null, todayDay: string): number` — yesterday → streak+1 (min 1), today → streak, older/gap → 1, null → 1.
- `interface DailyResult { score: number; quartersSolved: number; perfects: number; turnovers: number; day: string }`
- `interface DailyState { day: string; seed: string; streak: number; lastPlayedDay: string | null; result: DailyResult | null }`
- `freshDaily(): DailyState`; `startDaily(state, day, dataVersion): DailyState` (new day → fresh state with that seed; same day → unchanged); `finishDaily(state, result): DailyState` (records result, bumps streak via nextStreak).

- [ ] **Step 1 (failing tests):** same day+version → same seed → same `createGame` teams (uses real M27 lineups); different version → different teams; `nextStreak` table (yesterday 2→3, today 4→4, 3-days-ago 9→1, null→1 — yesterday computed from a fixed "today" string, pure); `startDaily` twice same day → identical state; `finishDaily` sets streak 1 on first-ever play.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (no Date.now inside; arithmetic on `YYYY-MM-DD` via `new Date(y, m-1, d+1)` for yesterday). **Step 4:** PASS. **Step 5:** commit `feat(formation): daily engine — local-day seeds, streak math, one-attempt state machine`.

### Task 2: Per-pull deterministic RNG

**Files:** Modify `engine/game.ts` (add helper), `FormationScreen.tsx` (use it) · Test `game.test.ts` append

**Interfaces:** `pullRng(seed: string, pullIndex: number): () => number` = `makeRng(seed + ":pull:" + pullIndex)`. Screen: before each `planPull`, `rng = pullRng(gameSeedRef.current, g.pulls)`; drop the stream ref. `nextQuarter` keeps its `:q${n}` seeds.

- [ ] **Step 1 (failing tests):** same seed → identical first-6 reveal targets+texts; **resume pin**: play 4 pulls, `JSON.parse(JSON.stringify(g))`, continue on the clone 3 more pulls → identical to an unbroken 7-pull run (same reveal sequence); STAR POWER/cheeks-roast randomness consumes no stream (roast rand derived inside the per-pull rng — assert two runs identical even when a CHEEKS reveal fires).
- [ ] **Step 2:** FAIL → **Step 3:** implement (move roast rng to the passed-in rng — it already is) → **Step 4:** PASS → **Step 5:** commit `feat(formation): per-pull seeded rng — deterministic games that survive save/resume with no stream resync`.

### Task 3: Store — wall + daily sections (v1-compatible)

**Files:** Modify `store.ts`/`store.test.ts`

**Interfaces:** `FormationSave` += `wall: Record<string, { day: string; gold: boolean }>` and `daily: DailyState | null`; old saves default both; `recordWallSolve(save, abbr, gold): FormationSave` (never downgrades gold); save/write round-trips.

- [ ] **Step 1 (failing tests):** migration (old save object without new fields → defaults); `recordWallSolve` gold-upgrade and no-downgrade; corrupt daily section → null daily but wall kept. **Step 2:** FAIL → **Step 3/4:** implement + PASS → **Step 5:** commit.

### Task 4: The trophy wall (32 mascots, gold frames)

**Files:** Create `WallSheet.tsx` · Modify `FormationScreen.tsx` (WALL chip beside TAPE; wall writes in `callSide`), `sheets.tsx` · Test append

**Interfaces:** `WallSheet({ wall, onClose })` renders 32 tiles: `MASCOT_ART[abbr]` image, `MASCOTS[abbr].name`, lit vs `?` silhouette, gold class when `gold`; tap tile → `{day, gold}` footnote. `callSide` on correct: `saveRef.current = recordWallSolve(saveRef.current, S.team, S.wrongCalls === 0)` + persist.

- [ ] **Step 1 (failing tests):** solving KC lights `pick-wall-KC` tile with the name "KANSAS CITY..."—no—`MASCOTS.KC.name` (`BBQ NATION`); gold iff `wrongCalls === 0` on that side; re-solving gold→plain blocked (stays gold); unlit teams show `?` and no img; sheet lists exactly 32 tiles. **Step 2:** FAIL → **Step 3/4:** implement + PASS → **Step 5:** commit `feat(formation): trophy wall — the house's 32 light up; gold for first-try calls`.

### Task 5: Daily UX — mode chooser, one attempt, streak, share

**Files:** Modify `FormationScreen.tsx`, `sheets.tsx`, `App.tsx` (hash clear) · Create `share.ts` · Test append

**Interfaces:**
- `shareLine(r: DailyResult, streak: number): string` → `FORMATION 11/08 · 41 pulls · 3 PERFECT · 1 TO · 🔥5` (0-solved safe: `FORMATION 11/08 · 70 pulls · 4 TO · all turnovers` — exact copy in test).
- Entering formation with an **unplayed daily** → `ModeSheet`: "TODAY'S GAME · streak N" / "FREE PRACTICE" / "THE WALL"; daily finished → chooser shows the result + share instead of play.
- Daily game over → final sheet shows streak + `SHARE` (uses `copyText`, shows "COPIED ✓"/"COPIED ✗") and no NEW GAME (back to chooser); free play unchanged (NEW GAME stays).
- Mode swap safety: starting a mode persists which mode owns `inProgress`; switching away from an unfinished game keeps it resumable in its own mode (daily in `daily`-owned slot via existing inProgress + mode marker `save.mode: "daily" | "free" | null`).
- `App.tsx`: on formation exit, `history.replaceState(null, "", location.pathname + location.search)` (clears `#formation`).

- [ ] **Step 1 (failing tests):** share format table (normal, zero-solved, zero-perfects); chooser appears when daily unplayed + not when finished; picking TODAY starts a game whose teams match `createGame(dailySeed(...))`; finishing the daily → reopening shows result, not a fresh game (one attempt); starting free practice does not alter daily state; hash cleared after exit. **Step 2:** FAIL → **Step 3/4:** implement + PASS → **Step 5:** commit `feat(formation): the daily — one attempt, streak, share line, mode chooser`.

### Task 6: House voice on the quarter-final (thin wrap, cut-able)

**Files:** Create `formation/voice.ts` · Modify `sheets.tsx` (OverSheet line) · Test `voice.test.ts`

**Interfaces:** `quarterLine(kind: "peak-quarter" | "final" | "turnover", ctx: { spins: number; teams: string }, rand): string` — pool lines now, houseVoice upgrade where `detectVoice()` (same detect/fallback law as the PoC; ∞ mark class reused). 6-8 pool lines in house voice (e.g. peak-quarter: "Four downs. Two calls. No doubt.").

- [ ] **Step 1 (failing tests):** pool lines deterministic for a seed; falls back to pool when voice unavailable (mock detectVoice false). **Step 2-4:** TDD. **Step 5:** commit `feat(formation): the house speaks on quarter finals — pool lines with on-device voice upgrade`.

### Task 7: Bench + ship

**Files:** Modify `formation-probe.mjs` (daily leg: enter → chooser → TODAY → one pull → finish via turnovers → reopen → result shown + wall tile lit) · full suite · build · phone reload · push.

- [ ] **Step 1:** probe PASS incl. daily leg. **Step 2:** `npx vitest run` green. **Step 3:** build + `formation-audit.mjs` PASS. **Step 4:** phone bench reload (if connected). **Step 5:** commit + push (auto-deploys).

## Self-Review

- Spec coverage: §7 daily (T1/T2/T5) + wall (T3/T4) + share (T5) + streak (T1) + one-attempt (T5) + local-date (T1) + no Worker (constraint honored); ledger landmines: per-pull RNG (T2), hash clear (T5), house voice (T6). Gaps: none for B.
- Placeholders: none — interfaces and copy are concrete.
- Type consistency: `DailyState`/`DailyResult` (T1) consumed by T3/T5 verbatim; `recordWallSolve` (T3) consumed by T4.
- Review Focus: each pinned to T1 (day-rollover via `startDaily` same-day idempotence + clock purity), T1 (injected dates), T4 (gold no-downgrade), T5 (mode ownership), T5 (share edge).
