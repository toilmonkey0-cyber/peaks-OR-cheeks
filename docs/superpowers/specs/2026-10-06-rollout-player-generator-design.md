# Rollout — Madden-companion random player generator (lean spec)

Date: 2026-10-06 · Status: approved direction (Aaron, in-chat 2026-10-06) · Sibling of RipPack v1

## 1. What this is

Tablet-first, mobile-first **random NFL-player generator** built on RipPack's bones (React 19 +
Vite + TS + Zod, custom CSS, seeded RNG, procedural pixel helmets, haptics module — copied, not
shared, so v1 stays untouched mid-testing). It is a **companion tool for the video game people
actually play** (Madden 26, final roster): ratings, attributes, and X-Factor abilities shown are
the game's real published values. Slot-machine psychology, zero slot-machine costume:

- **Skin (Aaron's pick #4):** Combine Scanner core + ambient Draft-ticker background.
- **No logos, no likenesses** (Aaron's hard requirement): procedural helmet avatars only, EA
  `avatarUrl` headshots are fetched-and-discarded, team colors + city/abbr only, source game and
  league never named in UI (v1 decision #9 posture carried over).

## 2. Data — `data/madden.json` (new, EA drop-api)

Source: `https://drop-api.ea.com/rating/madden-nfl?limit=100&iteration=23-super-bowl` —
the **final completed-season ratings** (Madden 26, immutable; fetch once, no refresh cadence).

- **Position sweep** (`&position=QB|HB|FB|WR|TE|LT|LG|C|RG|RT|LE|RE|DT|LOLB|MLB|ROLB|CB|FS|SS|K|P`,
  drop empties) + **team sweep** (`&team=<numeric 1..32>`), joined by EA `id` → exact team +
  position attribution, no fuzzy name joins. Numeric-id→abbr mapping derived once (majority name
  match against existing `data/snapshot.json`) and baked into `pipeline/config.py`.
- Free agents (in position sweep, no team) → `team: "FA"`, neutral gray colors.
- Card fields: `eaId, name (First L.), fullName, position, team, jersey, age, heightIn, weightLb,
  college, yearsPro, rating (EA OVR), tier, attributes (5–6 curated by position from EA stats),
  xfactor (has xFactor-type ability), abilities (≤2 labels), avatarSeed (= eaId)`.
- Snapshot: `{ builtAt, sourceIteration, players[], teams[] (reuse v1 32-team colors), xfactorIds[] }`
  — validated by a new Zod schema in the app (`src/data/schema.ts`, local to rollout/).
- **Tiers from real OVRs:** legend ≥90, elite ≥80, rare ≥70, else common (v1 thresholds).
  Generator odds are decoupled from pool share (§4) — real distribution is far flatter than v1's
  exp-4 synthetic curve; odds tuned so legend pulls feel like events, not inventory.

## 3. Core loop — the disguised slot

1. **Idle:** ambient ticker (canvas, low-opacity name stream drifting behind), big **SCAN**
   control, position-group filter chips (the "weighted reels"), history rail (last 12), session
   best pinned. Optional crowd hum.
2. **Charge & fire:** press-and-hold builds charge (haptic pulse ramp + rising tone); release
   fires the scan. Quick tap = minimum charge (still a full, fair spin — charge is theatre, not odds).
3. **Scan (predetermined at release by seeded RNG; animation sells it):** names blur through the
   central focus window (motion-blurred stream, decelerating), then **staggered locks**:
   POSITION (thunk) → TEAM (colors flood UI) → NAME (slam, blur-to-sharp) → OVR rollup +
   attribute cascade. NAME is the last "reel": it stretches when the locked tier is elite+.
4. **Near-miss:** on a common/rare result, ~1/7 chance a 97+ OVR name flashes through the window
   in final deceleration, never lands. Sharp haptic cut + audio sweep cutoff.
5. **Result:** full card materializes (helmet avatar, OVR, attributes, ability chips; X-Factor
   shimmer if xfactor). Tier stinger + haptic; legend gets a team-color particle burst.
   Buttons: **Scout again**, copy-as-text.
6. History rail + session best update; pulls counter increments.

**Odds (per spin, tunable in `src/engine/config.ts`):** legend 1.5% · elite 8% · rare 30% ·
common 60.5%, drawn within tier uniformly (X-Factor rides on the card, not the roll). Position
filter chips constrain the pool before the roll. Dupe handling: none — generators don't punish.

## 4. Haptics (`src/haptics/haptics.ts`, extended vocabulary)

Android (Vibration API): `chargeRamp` pulses accelerating with hold time; lock ladder
`lock1 < lock2 < lock3 < lockFinal`; `nearMiss` double-cut; tier patterns (legend = crescendo
rumble); `tickTexture` optional spin texture. iOS (no Vibration API): every haptic event pairs
with a visual micro-pulse + audio accent so moments still land. Global toggle.

## 5. Sound (`src/audio/`, Web Audio, fully synthesized — zero assets, offline-safe)

- `tickEngine`: stream ticks whose rate tracks deceleration (scheduled ahead on the audio clock).
- Locks: pitched thunks climbing a musical ladder (E2→A2→D3→G3); OVR rollup = arpeggio.
- `chargeRiser` while holding; `nearMissSweep` (rising, hard cutoff); tier stingers: common soft
  pop · rare two-note · elite chord · legend chord + sub-drop · X-Factor shimmer overlay.
- Ambient crowd hum (looped filtered noise), default on at low level, toggleable.
- iOS unlock on first gesture; master sound toggle; everything respects `prefers-reduced-motion`
  (audio stays, visuals calm).

## 6. Visuals & layout

Dark broadcast aesthetic (near-black navy); team primary/secondary gradient floods on TEAM lock;
canvas focus window with scanline + streaks; CSS slams for locks; legend particle burst. Tablet-
first: portrait = vertical stack (focus window dominant), landscape = focus window left / result
card right. Safe-area insets, no-zoom viewport, touch targets ≥ 56px, `100dvh`. Reduced-motion:
stream becomes a crossfade, slams become fades, particle burst skipped.

## 7. Architecture & tests

- `nfl-card-app/rollout/` — standalone Vite app (own package.json/tsconfig/tests), imports
  `../../data/madden.json` via `server.fs.allow` + `resolveJsonModule` (v1's pattern).
- Modules: `data/` (schema+load), `engine/` (config, rng, draw, near-miss scheduler),
  `audio/` (synth engine, pure `schedule` calculables separated for tests), `haptics/`,
  `avatar/` + `components/` (CardView), `screens/Scanner.tsx`, `storage/` (localStorage
  `rollout.save.v1`, corrupt→fresh).
- Tests: draw math + odds distribution, near-miss scheduler bounds, charge state machine, audio
  schedule pure functions, storage round-trip + corruption, render smoke of Scanner. `npm test`
  green, `npm run build` clean. E2E deferred (v1's playwright stays v1's).

## 8. Non-goals (this round)

Coins/economy (pure generator — Aaron skipped the question, recommendation stands), collection
book, squad builder, PWA offline polish beyond installability, current-game (Madden 27) data,
deploy. Ports: dev 5174 / preview **4174** — v1's 4173 preview stays alive untouched.
