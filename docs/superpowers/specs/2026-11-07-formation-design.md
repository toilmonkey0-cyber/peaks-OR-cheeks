# FORMATION — design spec

Date: 2026-11-07 · Status: approved design, pre-implementation · Lives inside: PEAKS OR CHEEKS (`rollout/`)

## 1. What this is

FORMATION is a guessing game about NFL rosters, built on the PEAKS OR CHEEKS engine and shipped as a screen inside the existing app. Each quarter, the app secretly picks two teams — one's starting offense against another's starting defense — shown as an empty 22-slot formation. Players pull clues (jersey numbers first, then initials, college) by spinning the generator, then **call** the teams.

The design north star, in Aaron's words: **"design this as if the spin is the most important part of this app. The game is just fun... the Toy is addicting."** Every feel decision serves the pull. The guessing game is the frame that gives the toy a reason.

Name: **FORMATION** (his pick, 2026-11-07).

## 2. The rules (approved 2026-11-07)

1. A game is **4 quarters**. Each quarter = two hidden teams: a starting offense (QB, HB, WR×3, TE, LT, LG, C, RG, RT) vs a starting defense (LEDG, REDG, DT×2, MIKE, WILL, CB×3, FS, SS) — 22 slots. The two teams are always different, paired at random (never the real schedule, or naming one gives away the other).
2. **Pulls light fresh slots first** — until every number on a side is out — then dig deeper on lit slots: initials, then college. A face-down PEAK or a spent slot is neither fresh nor diggable (until played). Offense rarity: OL common, skill players rarer, QB rarest. Defense: everyone common except the defense's best (top-rated) player, who is rarest. Starting weights **3 : 2 : 1** (common : skill : jackpot). A solved side drops out of pulls.
3. Every reveal is **judged against the 32 starters at that slot**: MID lands plain; **CHEEKS** (bottom 3 at the spot) lands with a roast — never a penalty; **PEAK** (top 3 at the spot) lands **face-down and gold**: you see where, not who.
4. A face-down PEAK can be **PLAYED** (flips with number + initials at once), **SPENT** on a play right now (its slot stays sealed for the quarter), or **LEFT** (banks as a chip when the quarter ends).
5. **Plays** cost 1 chip, usable anytime: NO-HUDDLE (next pull lights two slots, counts as one), FILM STUDY (initials on any lit slot), CHALLENGE FLAG (undo one wrong call, restore the down). **Schemes** cost 2–3 chips, buyable **at halftime only**, run through Q3–Q4: STAR POWER (jackpot slots weigh double), SCOUTING DEPT (each remaining quarter starts with 3 wrong teams already crossed out). Play/scheme names are placeholders — Aaron renames at will.
6. **Call anytime**: pick a side, pick a team. A wrong call burns one of the quarter's **4 downs** (shared across both calls) and crosses that team out on that side. A solved side's team drops off the other side's list.
7. **Scoring**: quarter score = pulls used; a turnover (downs exhausted) scores a penalty always worse than a slow solve (initial: 70). Game score = sum of quarters **minus unspent chips** (each knocks a spin off). Fast quarter (≤8 pulls initial) = PEAK QUARTER celebration; turnover = CHEEKS celebration.
8. **The daily** is today's game: same 4 matchups, same seeded decks for everyone. Boosts change how you draw, never what's in the deck.

Deliberately OFF: "three CHEEKS make a PEAK," whiff/double pulls, team-level hints (a division alone cuts 32→4), cross-day chip carry (would break the board). Each is one spin-table row away if wanted later.

Economy rationale (simulated, 2026-11-07): chips flow to whoever knows less — fans bank ~2.6 chips/game, die-hards ~0 — a built-in catch-up. Unspent-chip redemption gives every PEAK a floor value so experts can trust a read, leave the card, and pocket the chip. Farming never pays (~11 pulls of stalling per PEAK vs uses worth a few).

## 3. Data & derivation

From `data/madden27.json` (weekly refresh ritual unchanged): **starter = top-OVR at each Madden position** (EA has no depth chart; documented caveat: not always the Sunday starter). Jersey numbers 100% covered; all 32 teams fill 11-personnel vs nickel (a 4-3 does not — only 16 SAM league-wide).

**Stamps** are computed per team-slot against the 32 starters at that position (multi-slot positions: top/bottom 9 of 96 WR/CB, 6 of 64 DT). House OVR thresholds do NOT transfer to starters (52% would be PEAKs) — rank-within-slot is the law.

Sim findings that shaped the rules: a perfect-memory oracle needs ~2 reveals/team (memory is the scarce resource, information is not); fresh-slots-first is essential (fan median 33 → 18 pulls/quarter); fan median ~17/quarter (~65/game), die-hard ~6 (~25/game).

## 4. The screen

Upper half = **field of play** (one field, defense top / offense bottom, LOS across the middle). Lower half = **the action area** (the spin stage — the toy's home). HUD: quarter, down pips, SPINS, GAME, chip bank (◆ n). Side bars: DEFENSE / OFFENSE, `?` until solved, then team name in team color; CALL button per side; TAPE button (scout log as a bottom sheet — demoted from a panel so the bottom belongs to the toy).

Slot chips read: position label → number → initials (dug) → college (dug, shown with a `·`); ▲/▾ marks for PEAK/CHEEKS verdicts on lit slots; face-down PEAK = gold striped chip pulsing; solved side = team-color tint flood + ghost numbers on still-hidden slots; spent slot = dimmed `–`.

Field geometry uses container units (chips ~10cqw) — verified overlap-free at 320–390px. **Design width is 320 CSS px** (Aaron's Chrome runs 320×624 at DPR 3.375); use `dvh` + clamped field height, zero page scroll.

## 5. The pull (the most important part)

Sequence: **hold → charge → release → detonation → reel → verdict → flight → landing.**

- **Charge** (hold the card itself, the HOLD button, or Space; 1400ms to full): the card breathes in energy from the universe — grows to ~1.5×, lifts, breathing accelerates 0.9→3.0 breaths/s; ice-blue streaks spawn across the whole screen and spiral into the card (pull strongest on each inhale; gold motes past 70% charge); grid + sweep bar dim behind a vignette centered on the card; lightning crackle past 55%; shiver + echo rings at full charge. Haptics step charge0→3 ([10] / [15,30,15] / [20,30,20,30,20] / [30,30,30,30,30,60]) — the PoC ladder. Riser: sawtooth→lowpass, freq/gain follow level AND breath.
- **Release**: kick (70Hz + noise) + stage quake + haptic kick [14,18,22] + shockwave ring sized by charge level.
- **Reel**: card spins ~4 turns, numbers flick (ticks), first pull of a spin is longer (950ms vs 620ms).
- **Verdict**: face flash — gold PEAK stamp + chord + burst + [20,40,20,40,90]; brown CHEEKS stamp + droop + flutter-confetti + [160]; plain click otherwise. Tagline pools (and House Voice on capable devices) apply as in the PoC.
- **Flight**: card shrinks along a 560ms arc (3-keyframe, slight rise, −8° tilt) into its field slot.
- **Landing**: thud + ring flash + [35] pulse; slot pops.
- **PERFECT release**: let go at the top of a breath at full charge → white flash + gold second shockwave + PERFECT stamp + shimmer + [10,30,10,30,80]. **Cosmetic only — never touches odds or outcomes** (daily stays fair). Counted per game on the quarter sheet.
- Reduced-motion: no growth, no flight, no particles; charge level shown as a simple meter; all sounds/haptics (minus shake) retained.

All feel numbers live in one **`feel.ts`** so the phone bench tunes a single file. Initial values are first guesses validated by hand-feel on the bench (2026-11-07, OnePlus 8T).

## 6. Call theatricals (the contrast is the design)

- **Correct call — the house reviews it and the call stands:** `CONFIRMED.` gold stamp + fanfare + peak haptic → team-color tint floods the solved side → **the wave**: all 11 slots pop solid in sequence, ascending tick tones, tiny buzz every 3rd chip, offense's wave ordered to **end on the QB** → gold confetti from that side's field center. ~2s total; input locked (buttons visibly disabled) while it plays. If both sides are now solved, the quarter-final sheet follows.
- **Wrong call — unceremonious:** dead air (~380ms) → small gray lowercase `no.` stamp + one dull thunk + [28] → nothing else (~1.1s). No color, no fanfare. Exception: a wrong call that burns the last down still gets the full CHEEKS turnover — endings deserve theater, mid-game misses don't.

## 7. Modes

**Free play** — unlimited random games, always available; fills the trophy wall; best game (fewest spins) tracked locally.

**The daily** — today's game for everyone; one attempt (first pull commits; run resumes across tab kills from local save); streak = consecutive dailies played. Share line in the house voice, e.g. `FORMATION 11/07 · 41 pulls · 3 PERFECT · 1 turnover · 🔥5`. Spoiler rule: the group board shows "N played" and holds scores back until you've finished today.

**Trophy wall** — Aaron's 32 city-nickname mascots (existing `public/mascots/` art, zero new drawing). Solve a team's side (any mode) → that mascot lights up; **gold frame** when that side was called with zero wrong calls on it that quarter. 32-tile grid like the Void collection; persistent locally.

## 8. The friends board (Cloudflare Workers + D1)

No accounts. Create group → 6-char code (`BLITZ-7K`-style) → text it; friends join with a nickname (phone remembers; multiple groups fine). **Only the daily posts** (the only fair comparison). One row per player/day/group: score, quarters solved, perfects, turnovers.

**The daily is published, self-contained** — the Worker generates at first request each day (locked per date in D1) and serves a payload containing all four matchups' full lineups (numbers, initials, colleges, stamps; ~15KB). Clients render the daily straight from the payload → **client data versions can never disagree with the puzzle** (kills the weekly-refresh landmine). Worker's roster snapshot is built by the pipeline (`worker-data.json`, 704 starters) and deployed with the Worker. Free play uses local data. Offline: today's payload cached locally; score queued and posted when back online.

API: `POST /groups` · `POST /groups/:code/join` · `GET /groups/:code/daily/:date` · `POST /groups/:code/daily/:date/score` · `GET /daily`. D1: `groups(code, name, createdAt)` · `scores(groupCode, date, playerId, nick, score, detailJson, submittedAt, PK(groupCode,date,playerId))` · `dailies(date, payloadJson, dataVersion, generatedAt)`. Free tier: 100k req/day, 5M reads/day — ~1000× headroom. His existing Cloudflare account.

Cheat posture, stated honestly: the game runs on the phone; a friend could post a fake score. Trust-based in v1 (it's bragging rights, not money). Cheap upgrade later: submit the run's clue log for verification.

## 9. Architecture

All in `rollout/src/formation/` (own screen, own folder — never bloating Scanner):

- `engine.ts` — pure logic: lineup derivation + stamps, pull selection (fresh-first, weighted, no double-picking), layers, calls/downs, quarters, chips/plays/schemes, scoring, daily seed → game. Reuses the app's seeded-RNG pattern (daily determinism).
- `daily.ts` — worker payload parse + local fallbacks.
- `store.ts` — save under `rollout.formation.v1`: game-in-progress, wall, streaks, daily cache, pending score posts.
- `feel.ts` — every ms / size / haptic / volume constant (the bench-tuning file).
- `FormationScreen.tsx` + components (`Field`, `SlotChip`, `ActionStage` incl. charge canvas, `CallSheet`, `TapeSheet`, `WallSheet`) + css. Reuses synth/haptics/audio-schedule patterns (new formation-themed methods, same architecture).
- `worker/` — Cloudflare Worker (own package.json + wrangler; separate deploy from Pages).

Entry: door on the main screen; daily deep-link via `#formation-daily` hash for share lines. PWA/deploy ride the existing pipeline (precache grows only by formation code; mascots already cached).

## 10. Testing & tooling

- **vitest, engine invariants**: fresh-slots-first until all numbers out; weights honored (Monte-Carlo with the loopprobe-style tolerance lesson); stamps exactly top/bottom-3 per slot; downs/banking/scoring math incl. unspent-chip deduction; no-huddle never double-picks; turnover always worse than slow solve; same seed → identical game.
- **Sim harness as a committed dev tool** (`formation/sim.mjs`, ported from the session's sim2/sim3): fan/die-hard models re-run before ship to re-tune odds + economy.
- Bench scripts (the `.mjs` pattern): layout audit at 320/390, ceremony probe (pageerror sweep), **phone one-liner** (serve → `adb reverse tcp:4181 tcp:4181` → reload via CDP 9333 — 9222 is taken on this PC).
- Worker: determinism unit tests on daily generation; manual deploy to workers.dev before wiring the app to it.

## 11. Build order

**A.** Screen + engine + solo free play, with the pull at full feel (charge, ceremonies, haptics, sound) → bench-tune on Aaron's phone.
**B.** Daily + trophy wall (worker not yet required: daily derives locally from seed f(date, dataVersion) until the Worker lands — acceptable pre-board because there's no board to mismatch).
**C.** Worker + friends board + published dailies + share lines.

## 12. Non-goals / deferred

Board-game mode (pass-and-play buzz race — its own brainstorm after solo proves fun; spinner perk + wrong-buzz cost open). Team-level hints, whiffs/doubles, pity-PEAK (one spin-table row each if wanted). Accounts, global boards, anti-cheat beyond v1 posture. iOS. CardForge (FORMATION is football-only; CardForge stays generic).

## 13. Tunables (initial values, all in `feel.ts` / engine config)

pull weights 3:2:1 · PEAK/CHEEKS cutoff top/bottom 3 per slot · charge 1400ms · breath 0.9→3.0/s · PERFECT window sin>0.75 at full charge · reel 950/620ms · flight 560ms · verdict beat ~430/780ms · PEAK_QUARTER ≤8 pulls · turnover penalty 70 · chip redemption −1 spin each · scheme prices 2–3 · celebration linger per PoC (+500) values.

## 14. Artifacts from the design sessions

Playable mocks (session viz dir): `formation-screen-layouts.html` (3 layouts), `formation-action-area.html` (flight v1), `formation-spin-charge.html` (the pull + ceremonies — canonical feel reference). Throwaway sims: `Temp/huddle-sim/sim2.cjs` (rules), `sim3.cjs` (economy), `smoke5/6.cjs` (mock verification patterns). Phone bench: OnePlus 8T via adb reverse (secure-context trick — haptics verified live).
