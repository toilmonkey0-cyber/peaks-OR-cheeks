# SDD ledger — plan: docs/superpowers/plans/2026-11-09-formation-phase-c.md

Branch: formation-phase-c (from main 4f9859f). Executor: native, autonomous (his ask: "work on phase C while im away"). HARD BOUND: no deploy (needs his CF login), no merge/push to main until he returns.

## Pre-flight
| Tasks | Interface | Finding |
|---|---|---|
| T1→T3 | DailyPayload/PubPlayer | match |
| T2 | D1Like shim vs wrangler env | handler takes (request, d1) — Ruling C1 |
| T3→T4 | fetchDaily/queue/save fields | match |
| T5 | probe coverage | board flows covered by unit-integration (worker handler + client); probe stays app-only — Ruling C2 |
| spec §8 | worker URL plumbing | VITE_FORMATION_API env with localhost default — Ruling C3 (no secret; wrong URL = clean degradation) |

## Tasks
Task C1: complete — worker/data.json (704 starters w/ side+stamp+cls), publishDaily (4 quarters, no team reuse, byte-deterministic, seed = phase-B formula), 5/5 zero-dep tests; wrangler.toml + schema.sql staged for his deploy. Gotchas hit: stamp computation ran before team picks (order), node 24 strips types but `as const` is illegal in .mjs, initials can be 3 groups.
Task C3: complete — api.ts (setApiBase/apiBase for tests+env, 3s timeout, shape check, no-base = no fetch), gameFromPayload + nextPublishedQuarter (chips/schemes/counters carry; payload quarter pairing), save.published cache w/ corrupt guard. 106 tests.
Task C4: complete — GroupSheet (create/join, nickname, disabled without API base), BoardSheet (sorted rows, you-row gold, spoiler gate via youPlayed), submitDailyResult posts to all groups on DONE w/ queue fallback, flushQueued on board open; store gained playerId/nick/groups/pendingScores (ensurePlayer never re-rolls). 205 tests.
Task C5: complete — worker README (10-min deploy), build green (precache 2.33MB), audit PASS, worker 12/12.
Ruling C5: probe stays app-only (board flows covered by client unit tests against stubbed fetch + worker endpoint tests against the D1 shim; a live end-to-end needs the deployed worker, verified at deploy time).

## Final review (fresh subagent, 4f9859f..cd8c2bb)
Verdict: NOT ready — 2 Critical, 5 Important, 8 Minor. The reviewer reproduced all suites.
Final: Ruling C6 (fold-in): the fetch-window flash game (minor 12) is graded Important by effect — taps during the ≤3s payload fetch play a random local game and can light the wall; fixed WITH I3 as resolve-then-play.
Final: Ruling C7: the daily's generation ignores the requester's dataVersion — the worker always seeds from ITS snapshot (the payload carries the snapshot's version); the param remains only as a hint. Kills the cold-race divergence (minor 8) and simplifies the lock.
Final: Ruling C8 (recorded deviations from the plan's asks): board `members` list dropped (join stores nothing; members appear once they post — v1 posture, spec-silent); flush triggers = mount + board-open (visibilitychange skipped; queue is small); both accepted for v1.
Final: minor (deferred): unknown-path 405→404; input size clamps + day-format validation on the worker; board "you" row by playerId not nick; create-failure error copy lumps 400s; payload shapeOk depth; screen-level tests for fallback/spoiler/queue wiring (the glue tests the plan asked for).
Final: fixed Critical 1 (scores upsert via ON CONFLICT; shim enforces PKs on scores+dailies so tests prove real-D1 semantics — the mock had been fabricating the upsert) and Critical 2 (default export fetch handler + env-carried CORS_ORIGINS; dead globalThis plumbing deleted; default-export delegation checked in tests).
Final: fixed Important 3+minor12 (resolve-then-play: payload resolves before view=play — no flash game; resume beats re-deal; quarter gate now the daily's own day so midnight resumes keep published quarters), 4 (SCOUTING crosses in published quarters, deterministic seed:scout:q, crossing from the payload's own 8 teams — envelope semantics, ledgered), 5 (join verifies then persists; LEAVE per group drops group+its queue), 6 (board group tabs), 7 (write-ahead queue, per-item flush, mount flush).
Final: fixed deferred-fold: none beyond the above (remaining minors stand deferred).
Final: Ruling C9: published SCOUTING crosses come from the envelope's 8 teams (a sealed payload cannot know the other 24) — deterministic and honest; local games keep the full-league rule.
