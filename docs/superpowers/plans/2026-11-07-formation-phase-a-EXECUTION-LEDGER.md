# SDD ledger — plan: docs/superpowers/plans/2026-11-07-formation-phase-a.md

Spec: docs/superpowers/specs/2026-11-07-formation-design.md (reachable — rulings below are binding against it).
Branch: formation-phase-a (cut from main a60510d).

## Pre-flight (interfaces + test self-consistency)

| Tasks | Produces vs consumes | Finding |
|---|---|---|
| T1→T2 | SlotPlayer/SideLineup/TeamLineups | names match |
| T2→T3 | GameState + game.ts helpers | same file; consistent |
| T2/T3→T4 | GameState JSON | consistent (rng never stored) |
| T5→T2/T3 | feel constants replace local consts | values match spec §13 |
| T6→T8 | FormationScreen props | T8 test needs a test-only teams hook T6 lacks → Ruling R6 |
| T1 self | stamp ranking pool | impl ranks ALL players, spec says the 32 STARTERS → Ruling R1 |
| T1 self | jersey assertion | `> 0` fails: real starters wear #0 → Ruling R2 |
| T2 self | fresh-first test | counts layer>0 = 11, but face-down PEAKs keep layer 0 → Ruling R3 |
| T2 self | dig test | defense side stays eligible, so the pull may target defense → Ruling R4 |
| T3 self | turnover-vs-slow test | `70 > slow + 20` false when slow ≈ 60 → Ruling R5 |
| T3 self | halftime window | test buys at quarter 2 mid-quarter; spec = between Q2 and Q3 → Ruling R7 |

Pre-flight: Ruling R1: stamps rank among STARTERS only (pick starters first, then rank per position) — spec §2.3/§3 "judged against the 32 starters at that slot"; impl as written would leave starters with ~0 CHEEKS — cost if wrong: one ranking pool.
Pre-flight: Ruling R2: T1 asserts `Number.isInteger(jersey) && jersey >= 0` — #0 is legal and common in the data — cost if wrong: none.
Pre-flight: Ruling R3: T2 fresh-first test asserts the real invariant: whenever a plan digs (target layer ≥ 1), no fresh slot (layer 0, not fd/sealed/pending) remains on that side; and after the pool drains, every slot is lit or face-down — cost if wrong: one test.
Pre-flight: Ruling R4: T2 dig test marks the defense side solved so only offense is eligible — cost if wrong: one line.
Pre-flight: Ruling R5: T3 asserts `TURNOVER_PENALTY > 22 * 3` (max possible pulls in a quarter = 66) — the spec invariant "always worse than a slow solve" means worse than ANY solve — cost if wrong: one test.
Pre-flight: Ruling R6: FormationScreen props = `{ lineups, onExit, initialTeams?: [string,string], seed?: string }` (optional, for deterministic tests) — cost if wrong: two optional props.
Pre-flight: Ruling R7: halftime shop window = `quarter === 2 && over !== null` (Q2's final whistle, before NEXT QUARTER); T3 test sets `over` accordingly — spec §2.5 "at halftime" — cost if wrong: one condition.
Pre-flight: Ruling R8: commits stay on branch `formation-phase-a`; the plan's Task 10 "push" (to main = auto-deploy) is deferred to finishing-a-development-branch with Aaron's consent — pushing a shared branch is a stop condition — cost if wrong: one push later.

## Tasks
Task 1: complete (commits a60510d..26816b0, tests: bash -c 'cd rollout && npx vitest run src/formation/engine/lineups.test.ts' → [2m   Duration [22m 2.54s[2m (environment 52%, transform 23%, import 15%, setup 9%, tests 1%)[22m)
Task 2: Ruling R9: each SideState carries its 11 SlotPlayers (`lineup`) so `planPull(state, rng)` works as specified and saved games are self-contained (survive roster refreshes; the daily payload later IS this shape) — brief's GameState had no player data — cost if wrong: ~5KB larger save.
Task 2: Ruling R10: "empty pool" test sets every slot to layer 3 (fully dug) — layer-1 slots stay diggable by design (spec §2.2), so the brief's layer-1 setup can never empty the pool — cost if wrong: none.
Task 2: Ruling R11: pull counting (`pulls++`, NO-HUDDLE consumption) is NOT planPull's job — it belongs to a `startPull(state)` added in Task 3 with its own test (one spin = one pull even when it deals two cards) — cost if wrong: one helper moves.
Task 2: Ruling R12: Task-1 type bug found by tsc during T2 — Card.jersey is nullable; starters now skip jersey-less players for the next-best (a slot needs a number to be a clue), pinned by test "skips a starter with no jersey number…" RED→GREEN — cost if wrong: none (behavior only differs on future null data).
Task 2: complete (commits 26816b0..3684d1b, tests: bash -c 'cd rollout && npx vitest run src/formation/' → [2m   Duration [22m 2.60s[2m (environment 53%, transform 23%, import 13%, setup 10%, tests 1%)[22m)
Task 3: Ruling R13: SCOUTING DEPT picks 3 teams that are neither side's answer and crosses them on BOTH pickers ("not in this game") — brief's test summed out-lists to 3; per-both-sides is the accurate model of the clue — cost if wrong: one distribution line.
Task 3: Ruling R14: engine gains explicit verbs the spec's rule 4/5 imply but the brief only named: `playPeak` (flip fd → number+initials), `spendPeak` (seal slot + apply play, no chip), `filmSlot` (FILM STUDY dig), `weightOf` (STAR POWER doubles jackpot weight), `flags` counter on GameState (one CHALLENGE FLAG per wrong call) — cost if wrong: API surface names only.
Task 3: complete (commits 3684d1b..f3ca3e0, tests: bash -c 'cd rollout && npx vitest run src/formation/' → [2m   Duration [22m 2.60s[2m (environment 52%, transform 23%, import 14%, setup 10%, tests 1%)[22m)
Task 4: complete (commits f3ca3e0..68eb9ca, tests: bash -c 'cd rollout && npx vitest run src/formation/' → [2m   Duration [22m 2.79s[2m (environment 52%, transform 22%, import 15%, setup 10%, tests 1%)[22m)
Task 5: complete (commits 68eb9ca..80a4cde, tests: bash -c 'cd rollout && npx vitest run src/formation/ src/haptics/' → [2m   Duration [22m 3.09s[2m (environment 63%, transform 14%, setup 11%, import 10%, tests 1%, worker 1%)[22m)
Task 6: Ruling R15: FormationScreen also takes `teams: Team[]` (city/name/colors for bars, picker, finals) — the brief's props (lineups, onExit) carry no team display data — cost if wrong: one prop.
Task 6: Ruling R16: FORMATION always plays the current game's rosters (M27), independent of the scanner's M26/M27 toggle — spec §3 names data/madden27.json — cost if wrong: a source prop later.
Task 6: Ruling R17: the door is a centered "FORMATION" chip in the scanner's top chrome row (empty center since the brand moved into the stage) — least invasive placement; scanner layout untouched — cost if wrong: one CSS position.
Task 6: Ruling R18: engine mutates in place; the screen holds GameState in a ref + a render tick (`useReducer` bump) instead of immutable copies — matches the engine's mutating API from T2/T3 — cost if wrong: a re-render pattern swap.
Task 6: complete (commits 80a4cde..9a1975e, tests: bash -c 'cd rollout && npx vitest run' → [2m            [22m [2mlearn more: https://vitest.dev/guide/improving-performance#test-environments[22m)
Task 7: Ruling R19: FormationScreen gains an optional `initialGame?: GameState` hook (tests inject exhausted/edge states; T9's resume reuses it) — brief had only teams/seed hooks — cost if wrong: one optional prop.
Task 7: Ruling R20: PEAK/CHEEKS reveal sounds reuse the app's `synth.celebrate("peak"|"cheeks")` (the house's established chord + sad trombone) instead of new chord/droop voices — brand-consistent with the scanner's verdicts; the mock's sketch voices were placeholders — cost if wrong: two new voices later.
Task 7: Ruling R21: charge haptic steps use the app's existing `chargeLevel()` thresholds (300/600/900ms) rather than the mock's 350/700/1050 — one charge vocabulary across the app — cost if wrong: three numbers in feel.ts.
Task 7: Ruling R22: contract run caught a real bug — the async pull sequence outlived an unmount (Back mid-pull / mid-charge → TypeError on dead refs); fix = screen alive-guard after every await + stage cleanup stops the charge + FX on unmount; pinned by two tests RED→GREEN — cost if wrong: none.
Task 7: Ruling R23 (carried to T9): saves happen ONLY at stable points (after commit / call / play / quarter change) — never between startPull and commit — so a tab killed mid-flight resumes as if the release never happened (no spin lost, no clue stranded) — cost if wrong: a lost spin on a mid-flight kill.
Task 7: complete (commits 9a1975e..28b1201, tests: bash -c 'cd rollout && npx vitest run' → [2m            [22m [2mlearn more: https://vitest.dev/guide/improving-performance#test-environments[22m)
Task 8: Ruling R24: three of six T8 tests passed before T8 code (quarter-final sheet, turnover sheet, halftime shop were built in T6 per its plan) — kept as regression pins: the ceremony must delay the over sheet without breaking it — cost if wrong: none.
Task 8: Ruling R25: quarter-ending moments get the house celebration on top of the call: a turnover (4th wrong call) skips the flat "no." and plays TURNOVER + the CHEEKS trombone + flutter (spec §6: endings deserve theater); a PEAK QUARTER solve adds the PEAK chord after the CONFIRMED wave (spec §2.7) — cost if wrong: two sound cues.
Task 8: Ruling R26: T6 shell test "a wrong pick burns a down…" now waits for CALL to re-enable before reopening — spec §6 locks CALL during every ceremony, so the instant reopen it relied on is no longer valid behavior — cost if wrong: none.
Task 8: complete (commits 28b1201..f55aa9f, tests: bash -c 'cd rollout && npx vitest run' → [2m            [22m [2mlearn more: https://vitest.dev/guide/improving-performance#test-environments[22m)
Task 9: Ruling R27: answer data-attributes (data-offense/data-defense) render ONLY when import.meta.env.MODE === "test" — tests need each quarter's answers, production DOM must never hand them to "inspect element" — cost if wrong: none (prod renders nothing).
Task 9: Ruling R28: TAPE test passed before T9 code (TapeSheet shipped in T6) — kept as a regression pin — cost if wrong: none.
Task 9: complete (commits f55aa9f..798719d, tests: bash -c 'cd rollout && npx vitest run' → [2m            [22m [2mlearn more: https://vitest.dev/guide/improving-performance#test-environments[22m)
Task 10: Ruling R29: `#formation` deep link opens straight into FORMATION (bench script + future share links); `#formation-daily` stays reserved for phase B — spec §9 names the hash entry; base hash needed by the phone bench — cost if wrong: one line.
Task 10: complete (commits 798719d..5a45bd1, tests: bash -c 'cd rollout && npx vitest run' → [2m            [22m [2mlearn more: https://vitest.dev/guide/improving-performance#test-environments[22m)
Final: findings re-graded — Important 1-3 (fix pass below), Minor 4-12 deferred to ledger; Declined list ruled at the end of the ledger.

## Final review (code-reviewer subagent, whole branch a60510d..5a45bd1)
Verdict: "With fixes" — 0 Critical, 3 Important, 9 Minor, 12 declined-to-judge.
Final: fixed Important 1 (mid-flight persistence hole) — test "while a pull is in flight, the field and the chip bank are inert and nothing is saved" RED→GREEN (intermediate over-guards found by probe+tests and removed: block ONLY on pending slots, not the whole sequence; ceremonies save normally) — suite 169/169, probe PASS.
Final: fixed Important 2 (spec §10 statistical tests) — weight distribution 3:2:1 Monte-Carlo (±15%) + same-seed full-game replay; both passed immediately against existing behavior (the finding was the missing pin, not a bug) — tests added, no code change.
Final: fixed Important 3 (feel constants) — CONFIRMED_PRE_WAVE/LINGER, TURNOVER_HOLD, LANDING_BEAT, REEL_TAIL/TICK/TICK_RM now in feel.ts + asserted (feel.test RED→GREEN); one import edit was lost to an earlier mid-patch failure and restored (tsc caught it).

Final: minor (deferred): a release can burn a spin when the pool emptied mid-charge (emptyPool path) — bounded, no-huddle-free case rare.
Final: minor (deferred): keyboard keyUp binds the button only — Space held while the button disables leaves the charge running until unmount.
Final: minor (deferred): stage.reset() not called on dropped-release/quarter-change paths — card can sit charged-looking until the next hold.
Final: minor (deferred): reduced-motion charge has no level bar (glow + CHARGING/LET GO label carry level).
Final: minor (deferred): quake animates .fm-top only, not the whole screen (deliberate: card mid-reel must not shake) — see ruling.
Final: minor (deferred): formationTick haptic defined+tested but never fired.
Final: minor (deferred): game seed not persisted with the save — phase B daily MUST persist it (resume across tab-kills needs the same pull stream).
Final: minor (deferred): store isGame() validates shape shallowly.
Final: minor (deferred): "no-huddle with exactly one eligible slot" pinned only structurally (planPull null), no explicit test.

Final: Ruling: reduced-motion meter = glow + CHARGING/LET GO label — spec's "simple meter" intent is met without new chrome; revisit if bench says otherwise.
Final: Ruling: quake targets the top chrome, not the whole screen — the card is mid-reel at that moment; shaking it would blur the reveal. Deliberate feel call.
Final: Ruling: TAPE on the defense bar / solved-team disabled in picker / turnover reveals answers / reel shows random numbers — all verbatim ports of the approved mock, the plan's designated source.
Final: Ruling: bench scripts use the repo's standing preview port 4174 (plan text said 4181, the mock's ad-hoc port); one port for the whole repo's tooling.
Final: Ruling: CHALLENGE FLAG restores the DOWN but keeps the team crossed out — the wrong knowledge is already public; "overturn" buys back the down, not the memory.
Final: Ruling: House Voice is NOT in phase A verdicts — spec §5 says "as in the PoC," but the PoC's voice rides the celebration line on the scanner's beat; FORMATION's verdict beat is 430-780ms (no time for a spoken line). Wire it in phase B with the daily's quarter-final sheet (2s stage). Cost if wrong: one flavor layer, added later.
Final: Ruling: browser Back / hash clearing deferred to phase B deep-link hardening; the in-app back button is the phase A exit.
Final: Ruling: focus trap in sheets matches the existing app sheet idiom (none) — consistent, not new debt.
