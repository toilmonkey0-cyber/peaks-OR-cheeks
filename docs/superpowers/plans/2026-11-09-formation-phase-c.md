# FORMATION — Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The friends board — a Cloudflare Worker + D1 over group codes and daily scores — plus Worker-published self-contained daily payloads (the spec's sealed-envelope design that kills the data-refresh landmine).

**Architecture:** `worker/` is a standalone package (own package.json + wrangler.toml, TypeScript, no build step via wrangler) exporting a `fetch` handler. The client (`rollout/src/formation/`) talks to it with plain fetch, **feature-degrades to phase-B behavior when unreachable** (local-seed daily, no board) — the app must stay perfect without the Worker. The Worker's roster snapshot (`worker/data.json`) is generated from `data/madden27.json` by `worker/build-data.mjs` (run in the Friday refresh ritual too).

**Tech Stack:** Cloudflare Workers + D1 (free tier), wrangler (dev dependency of worker/, not the app), vitest for worker unit tests via a plain `Request`/`Response` harness against the exported handler with an in-memory D1 stub — no live deploy needed to test.

**Spec:** `docs/superpowers/specs/2026-11-07-formation-design.md` §8 (endpoints, tables, spoiler rule, trust posture, offline queue). Phase-B ledger rulings carry (B4 wall semantics etc.).

## Global Constraints

- App unchanged in behavior when the Worker is unreachable: daily falls back to the phase-B local seed; the board shows a clean "can't reach the house" state.
- No accounts: nickname + device id (uuid in localStorage). Group codes: 6 chars from a no-confusion alphabet (no 0/O/1/I), e.g. `BLITZ7`.
- One score row per (group, date, player). Only the daily posts. Scores held back until you've played today (spoiler) — client-side gate, trust posture accepted in the spec.
- Offline: today's daily payload cached in localStorage when fetched; a finished-but-unposted score queues and posts on next successful contact.
- Worker tests never touch the network; they drive the exported `fetch` handler with `Request` objects and an injected D1 shim.
- Everything on this branch until Aaron returns (deploy needs his Cloudflare login; merging before deploy would ship dead UI).

## Review Focus

1. **Same group code never collides across days** (codes are random; a create collision on an existing code must retry, not 500) — test in T2.
2. **A finished daily posted twice** (offline queue + retry race): exactly one row, latest write wins on detail — test in T2.
3. **Spoiler gate**: rows exist for today but the client holds them back before you've played — test in T5.
4. **Worker down at finish time**: the queue survives reloads and posts later; the player never loses the result — test in T5.
5. **Payload integrity**: a published daily renders without ANY local dataset dependency (numbers/initials/colleges/stamps inline) — test in T3.

---

### Task 1: Worker skeleton + the daily publisher (pure)

**Files:** Create `worker/package.json`, `worker/wrangler.toml`, `worker/src/daily.ts`, `worker/src/daily.test.ts`, `worker/build-data.mjs`, `worker/data.json` (generated).

**Interfaces (produces):**
- `worker/src/daily.ts`: `DAILY_STARTER` types + `publishDaily(day: string, dataVersion: string, data: WorkerData): DailyPayload` where `DailyPayload = { day, dataVersion, seed, quarters: { offense: string; defense: string; lineups: { off: PubPlayer[]; def: PubPlayer[] } }[] }` and `PubPlayer = { key; label; pos; jersey; ini; college; stamp: "P"|"M"|"C"; cls: "common"|"skill"|"jack"; rating; team }` (team on every player so the client needs nothing else).
- `build-data.mjs`: reads `../data/madden27.json`, emits `worker/data.json` (`{ dataVersion, teams: [{abbr, name, city, primary, secondary}], players: [...] }` — the 704 starters by reusing the app's derivation logic, copied minimal).
- Determinism: same (day, dataVersion, data) → byte-identical payload (hash test).

- [ ] TDD: hash-stability test, two-different-teams-per-quarter test, all-88-players-carry-team test → implement → green → commit.

### Task 2: The Worker — groups + scores + daily endpoints

**Files:** Create `worker/src/index.ts` (fetch handler + router), `worker/src/db.ts` (D1 queries over an injected interface), `worker/src/index.test.ts`; `worker/schema.sql`.

**Interfaces:**
- `D1Like { prepare(sql): { bind(...): { first/all/run } } }` — the handler takes `(request, d1)` so tests inject an in-memory shim and wrangler passes `env.FORMATION_DB`.
- Routes: `GET /daily?day=&dataVersion=` (generates + persists per-day lock, returns payload) · `POST /groups {name}` → `{code}` (retry on collision ≤5) · `POST /groups/:code/join {playerId, nick}` · `GET /groups/:code/board?day=&playerId=` → `{members, rows, youPlayed}` (rows always returned; the client gates spoilers) · `POST /groups/:code/score {day, playerId, nick, score, detailJson}` (PK upsert, latest wins) · `GET /health`.
- CORS: allow the Pages origin + localhost previews (config list in wrangler.toml vars).
- schema.sql: `groups(code TEXT PRIMARY KEY, name TEXT, createdAt INTEGER)` · `scores(groupCode TEXT, day TEXT, playerId TEXT, nick TEXT, score INTEGER, detailJson TEXT, submittedAt INTEGER, PRIMARY KEY(groupCode, day, playerId))` · `dailies(day TEXT PRIMARY KEY, payloadJson TEXT, dataVersion TEXT)`.

- [ ] TDD: create→join→post→board round trip; double-post upsert; code-collision retry (shim forces an existing code once); missing-body 400s; wrong-method 405s; health 200 → implement → green → commit.

### Task 3: The client plays a published daily

**Files:** Modify `rollout/src/formation/` — `dailyapi.ts` (new), `engine/daily.ts` (`gameFromPayload(payload): GameState` new), store (`published?: DailyPayload` cache + `pendingScores: {groupCode, day, playerId, nick, score, detailJson}[]`), `FormationScreen.tsx` (fetch on TODAY, fallback to local), tests.

**Interfaces:** `fetchDaily(day, dataVersion): Promise<DailyPayload | null>` (null = unreachable/bad); `gameFromPayload` builds a GameState whose sides carry the PUBLISHED lineups (players already carry team abbr; no local lookup). Fallback order: published → cached-today → phase-B local seed.

- [ ] TDD: payload→gamestate renders with an EMPTY lineups prop (proves self-containment — RF5); unreachable → local-seed game still starts; payload cached on fetch → replay from cache offline → wire → green → commit.

### Task 4: Groups UI + the board

**Files:** `rollout/src/formation/board.ts` (api + queue), `GroupSheet.tsx`, `BoardSheet.tsx`, screen wiring (BOARD entry on the chooser + final sheet), tests.

**Interfaces:** `createGroup(name)`, `joinGroup(code, nick)`, `leaveGroup()`; save gains `groups: { code: string; name: string }[]`, `playerId`, `nick`; `BoardSheet` shows members' rows for today (hidden behind a blur + "play today first" until youPlayed), your row highlighted; posting happens on daily DONE (fire-and-forget, queue on failure).

- [ ] TDD: create/join persist; board spoiler gate (rows hidden pre-play — RF3); offline finish queues and posts on next flush (RF4, flush on mount + on visibility change) → wire → green → commit.

### Task 5: Bench + docs + readiness

**Files:** `formation-probe.mjs` (group leg against a local worker harness OR skipped when no worker — decided at implementation: unit-integration tests cover it; probe stays app-only), `worker/README.md` (the 10-minute deploy: wrangler login, d1 create, schema apply, secret-less deploy, Pages env var `VITE_FORMATION_API`), app env plumbing for the API base (`vite.config` env or a const with localhost default).

- [ ] Full app suite + build + probe + audit green → README written → commit. NO deploy, NO merge (waits for Aaron).

## Self-Review

- Spec §8 coverage: endpoints ✓ T2, tables ✓ T2, codes/nicknames ✓ T4, only-daily-posts ✓ T4, spoilers ✓ T4 (client gate per spec), offline ✓ T3/T4, trust posture ✓ (no anti-cheat), published self-contained dailies ✓ T1/T3, free tier ✓ (bounded by design; README notes limits). Gaps: none for C.
- Review Focus: T2 (collision, double-post), T5→T3 (payload integrity), T4 (spoiler, offline queue).
- Types: `DailyPayload`/`PubPlayer` (T1) flow into T3/T4 verbatim; `D1Like` keeps the handler testable without wrangler.
