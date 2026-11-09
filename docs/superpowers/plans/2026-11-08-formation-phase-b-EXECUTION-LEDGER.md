# SDD ledger — plan: docs/superpowers/plans/2026-11-08-formation-phase-b.md

Branch: formation-phase-b (from main 37695a1). Executor: native (carried from phase A; his "lets go phase b"). Design authority delegated per his 2026-11-08 directive.

## Pre-flight
| Tasks | Interface | Finding |
|---|---|---|
| T1→T3/T5 | DailyState/DailyResult | names match |
| T2→T5 | pullRng + per-pull determinism | daily resume needs no seed persistence (dissolves phase-A minor 10) — Ruling B1 |
| T3→T4 | recordWallSolve | match |
| T6 | houseVoice.chooseLine signature | verify at implementation; pool-first with detectVoice upgrade, cut to pool-only if the PoC API does not fit formation context — Ruling B2 (pre-authorized cut) |
| T5 self | mode ownership | save gains `mode: "daily"|"free"|null` so one in-progress slot serves both modes — Ruling B3 |

## Tasks
Task B1: complete (tests 8/8 after fixing my own test bug — result.day must match the day being finished).
Task B2: complete — GameState gained `seed` (rides the save); pulls index from game.pulls-1 after startPull; quarters derive from :q{n} of the same seed. Determinism tests: identical sequence, resume-continues-exactly, different-seed-differs (12/3/3 pulls).
Task B3: complete — save shape grew (wall + daily, v1 migration via isWall/isDaily guards); recordFinishedGame now spreads. Process note: a grep-piped && chain committed on red — amended after fixing; watch exit codes.
Task B4: complete — WallSheet (MASCOTS names + MASCOT_ART imgs, ? silhouettes, gold frames), wall writes on correct calls (gold = wrongCalls===0 that side), WALL chip beside TAPE. Tests: 32 tiles, unlit ?, KC BBQ NATION lit-not-gold after a wrong call, BUF gold first-try w/ img.
Task B5: complete after a chain of honest test iterations (chooser visible only on real entry; mode syncs with entry; accessible names include captions; share carries FINAL score = total − chips). PROCESS FIX: commits now gated on vitest exit code 0 explicitly — no more grep-pipe masking (burned twice).
Task B6: complete — voice.ts pool quips wired into the over sheet per outcome; voiceCapable() stubs the on-device upgrade path (PoC law).
Task B7: complete — suite 192/192, probe PASS (both legs), audit PASS, build green.
Ruling B4: probe's turnover-finish daily asserts wallLit === 0 (turnovers reveal answers but are not SOLVES — the wall stays honest); locked as the ground truth for "solve" semantics.

## Final review (fresh subagent, whole branch 37695a1..fab81b6)
Verdict: With fixes — 1 Critical, 3 Important, 5 Minor, 8 declined.
Final: fixed Critical 1 (chooser not modal) — test "the chooser is modal: blind taps behind it never touch the save or the wall" RED→GREEN (scrim + view gates on canCharge/onSlot/callSide + persist refuses when no mode owns the game).
Final: fixed Important 2 (free-resume clobber) — startMode("free") resumes save.inProgress; test asserts SPINS2 continues.
Final: fixed Important 3 (quip re-rolls on re-render) — quip picked once per over-instance (useMemo); test pins stability across rerender with a varying rand.
Final: fixed Important 4 (seed migration) — settle() defaults legacy seeds; test: seed-less save loads with a stable non-empty seed.
Final: minor (deferred): TODAY button can advertise an unearned +1 streak on skipped days; chooser's share line has no copy button; wall tile footnote is title-only (no gold, no touch); COPIED ✗ state missing; RF1-screen + RF4-clobber tests still thin.
Final: Ruling: CHALLENGE FLAG does not restore gold eligibility — wrongCalls is history, the flag buys back the down only (matches the phase-A ruling).
Final: Ruling: stale-daily finishes count toward their original day's streak; results history beyond today is out of scope for v1.
