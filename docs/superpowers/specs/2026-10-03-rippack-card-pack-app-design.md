# RipPack — Gamified NFL Player Card Pack Opener

**Spec date:** 2026-10-03
**Status:** Approved design, pending user spec review
**Working title:** RipPack (changeable; must avoid "NFL" in the app name/logo — see Trademark section)

## 1. Purpose

A free, phone-first web app that replaces the real-money NFL card pack hobby for
kids and content creators. Users open digital card packs containing **real,
current NFL players** with **real stats-driven ratings**, experience
YouTube-style dramatic card reveals, collect into albums, and build/export
squads for use as a companion tool when constructing rosters in football video
games (e.g., Madden on console, with this app running on a phone/tablet as a
side device).

Success criteria:
- A kid can open the link, rip a pack, and understand everything within 30
  seconds — no account, no tutorial, no payment, ever.
- A creator can build a squad from pulled cards and copy/export it in a format
  they can build a console roster from.
- Data refresh (rosters + stats) is **one command** and produces a fully
  validated, shippable snapshot.
- Everything deterministic (pack contents, odds, reveal scripts) is unit-tested.

## 2. Non-goals (v1)

- No real-money transactions, ads, or accounts of any kind.
- No player likenesses, photos, or official team logos (see Trademark).
- No backend server, no database, no auth. Static site + bundled JSON only.
- No live in-game scores or play-by-play. Data freshness = last pipeline run.
- No AI/ML components. (Cactus Needle was evaluated and explicitly deferred —
  see §12 Roadmap.)
- No multiplayer or trading in v1.

## 3. Architecture

```
nfl-card-app/                  (own git repo, sibling of elevator-intel files)
├── pipeline/                  Python 3.12+ via uv
│   ├── build.py               one-command refresh: fetch → rate → emit JSON
│   ├── ratings.py             stats → card rating + tier (pure functions)
│   └── fixtures/              frozen source samples for smoke tests
├── app/                       React 18 + Vite 5 + TypeScript SPA (PWA)
│   └── src/
│       ├── data/schema.ts     Zod schema = single source of truth for types
│       ├── engine/            pack.ts, economy.ts, reveal.ts  (pure, tested)
│       ├── avatar/            procedural pixel-art generator (deterministic)
│       ├── components/        Card, PackOpener, CollectionBook, SquadBuilder…
│       └── screens/           Home, Packs, Collection, Squad, Settings
├── data/
│   ├── snapshot.json          pipeline output (committed; ~≤2 MB raw)
│   └── meta.json              build date, source versions, player count
└── docs/superpowers/specs/    this document
```

**Data flow:** `uv run pipeline/build.py` → downloads nflverse weekly rosters +
season stats → computes ratings/tiers → validates → writes `data/snapshot.json`
(+ atomically: never overwrite a good snapshot on a failed build) → committed →
static deploy. The app loads the snapshot at build time via Vite; Zod schema in
`app/src/data/schema.ts` is the type contract; a unit test validates the
committed snapshot against it, so a malformed refresh fails CI, not kids.

**Hosting:** static (GitHub Pages or Cloudflare Pages). PWA manifest + service
worker: installable to home screen, fullscreen, offline-capable after first
visit.

## 4. Data sources

| What | Source | Why |
|---|---|---|
| Weekly rosters, positions, ages, jersey numbers, status | nflverse `weekly_rosters` (NFL Shield v2 derived, updated weekly) | Free, current, canonical |
| Season + weekly player stats | nflverse (via `nfl_data_py` or direct release parquet/CSV) | Real production drives ratings |
| Team names, colors (primary/secondary) | nflverse `teams` dataset | Real colors, no logos needed |

- Sleeper API (`api.sleeper.app/v1/players/nfl`, no auth) is the designated
  fallback if a roster field is missing, and a documented future supplement.
- Roster pool = all active/injured-reserve players on 32 active rosters
  (~1,700 players). Practice squad excluded in v1.
- **All roster positions are included** (QB, RB, WR, TE, QB-adjacent OL/DL/LB/CB/S
  positions, K, P), plus **team DEF cards** (one per team, `playerId` of the
  form `TEAM-ARI`). Rationale: console rosters need defense too, and team DEF
  cards require no player-level data — they rate from team defensive stats
  (sacks, takeaways, points allowed). Kickers and punters are in (they're the
  beloved troll pulls of the genre).

## 5. Card model & ratings

Every card:

```ts
Card = {
  playerId: string            // nflverse gsisit id (or "TEAM-ARI" for DEF)
  name: string                // "J. Jefferson"
  fullName: string            // "Justin Jefferson"
  position: "QB"|"RB"|"WR"|"TE"|"K"|"P"|"DEF"|...   // full roster positions
  team: string                // "ARI"… "FA" if free agent
  jersey: number | null
  age: number
  rating: number              // 40–99, computed by pipeline
  tier: "common"|"rare"|"elite"|"legend"|"xfactor"
  keyStats: {label: string; value: string}[]   // 3–5 display-ready stats
  fantasyPpg: number | null
  avatarSeed: string          // = playerId; avatar is a pure function of it
}
```

**Rating methodology (pipeline, pure + tested):** positional composite from
real production — current season weighted 70%, prior season 30% (rookies: 100%
current + prospect prior from draft position). Normalized per position to a
40–99 scale so each position has a full curve (i.e., the #1 QB and #1 P both
approach 99; replacement level ≈ 45). Exact formula lives in `ratings.py` with
fixtures; thresholds:

| Tier | Threshold | Expected pool share |
|---|---|---|
| Common | < 70 | ~65% |
| Rare | 70–79 | ~25% |
| Elite | 80–89 | ~8% |
| Legend | ≥ 90 | ~2% |
| X-Factor | top 5 biggest week-over-week rating risers, re-tagged each refresh | 5 cards |

Numbers above are **tunable constants** in one config file, not scattered magic.

Because ratings are real, a breakout rookie's card genuinely *becomes* Elite at
the next refresh — the chase is real, not manufactured.

## 6. Pack engine & economy

Pure, seeded, reproducible. `openPack(type, seed, ownedSet, snapshot)` →
`{cards: Card[], scripts: RevealScript[], coinDelta}` — same inputs, same
outputs, unit-tested.

**Pack types** (cost in coins — earned only; starting balance 500):

| Pack | Cards | Cost | Odds (C/R/E/L) |
|---|---|---|---|
| Standard | 5 | 100 | 75 / 20 / 4.5 / 0.5 |
| Premium | 3 | 250 | 45 / 40 / 12 / 3 |
| Position/theme (e.g. "RB Rush") | 5 | 150 | 65 / 27 / 6.5 / 1.5 (position-filtered) |

- Odds must sum to exactly 100 — asserted in tests.
- Guaranteed rare-or-better in every Premium pack (test-enforced).
- Duplicates auto-convert to coins: Common 10, Rare 25, Elite 75, Legend 200.
- Daily free Standard pack; consecutive-day streak bonus +50/day, caps at +250.
- No duplicate Legends — if you own it, the engine rerolls that slot once,
  then converts.

## 7. Reveal Drama system

Each card slot gets a **reveal script** assigned at open time (seeded, part of
the pack result, testable): `standard | escalated | troll | gem`.

Choreography by tier:
- **Common/Rare:** tap-to-flip, quick (≤ 0.7 s), light shimmer (rare = glow).
- **Elite:** hold-to-reveal — press and hold; aura escalates white → blue →
  purple while sound builds; flips on release.
- **Legend / X-Factor:** screen dims, spotlight, card trembles (CSS transform +
  `navigator.vibrate` where supported), aura escalates to gold, hold-to-reveal,
  then fireworks/confetti burst.
- **Troll (fake-out):** common card dressed in full Legend effects; deflates on
  flip with "TROLLED" stamp + sad-trombone + **+25 coin consolation**.
- **Hidden Gem (fake-out):** dull card catches fire at flip, upgrades to a
  Legend/X-Factor reveal.

Fake-out rules (test-enforced): ~1/8 chance per pack *that contains at least
one card of eligible rarity*, max **one** fake-out per pack; Troll only targets
common slots; Gem only targets the pack's rarest slot and only when that slot
is Legend/X-Factor. Packs are revealed **worst card → best card** (the "saved
the hit for last" rule). Long-press anywhere = skip choreography.

## 8. Collection, squads, persistence

- **Collection book:** albums by team (32) and by tier; per-album completion
  %, "new card" shine on fresh pulls. Filter + search (exact/prefix + simple
  fuzzy trigram match — no embeddings).
- **Squad builder:** slots QB / RB / RB / WR / WR / WR / TE / FLEX / K / DEF.
  Fill from owned cards; position rules enforced. Export as:
  1. Copyable text list ("QB — J. Jefferson-like lines…"),
  2. CSV,
  3. Share image (canvas composite of the 10 cards + record of rating total).
- **Persistence:** localStorage under a single versioned key
  (`rippack.save.v1`): coins, owned card ids + counts, squad, streak/daily
  state, settings. Corrupt store → back up the blob to a sibling key, start
  fresh (never silently discard). No PII collected — there's nothing to enter.

## 9. Visual language

- Procedural **pixel-art player tokens**: team-colored helmet + jersey-number
  blocks, deterministic pure function of `avatarSeed` (same player = same art
  forever). No faces, no logos.
- Card frames per tier: Common gray, Rare blue-foil, Elite purple-foil,
  Legend gold-holo, X-Factor animated red/gold. Foil/holo via CSS gradients +
  transform (GPU-only properties; 60 fps on mid phones).
- Portrait-phone-first layout, thumb-reachable pack button, ≥ 44 px targets;
  tablet/desktop = same screens, wider card grids.

## 10. Performance, errors, freshness

- Budget: first load ≤ 1.5 MB gzipped incl. data snapshot; snapshot ~≤ 2 MB raw.
- All reveal animations use transform/opacity only; no layout thrash.
- Offline after first visit (service worker, cache-first).
- `meta.json` build date drives a banner if data is > 14 days old ("Cards as of
  Sep 26 — ask the owner to refresh").
- Pipeline failure = keep last good snapshot (atomic write via temp+rename).

## 11. Testing

- **Unit (vitest):** odds sum to 100 & match config; seeded pack
  reproducibility; Premium rare-or-better guarantee; dup conversion math;
  fake-out cap and targeting rules; worst-to-best ordering; ratings from stat
  fixtures land on expected rating/tier; avatar determinism (same seed →
  identical pixel output); Zod validation of committed snapshot; localStorage
  corruption recovery.
- **Pipeline smoke:** build against `pipeline/fixtures/` offline → snapshot
  passes schema + sanity counts (32 teams, ≥ 1,500 players, every team ≥ 30
  cards).
- **UI (Playwright smoke):** open pack → all cards revealed → coins/collection
  counters update; build a squad → export text matches squad.

## 12. Trademark & legal posture

- App name, logo, and domain must not contain "NFL" or imply affiliation.
  Tagline style: "pro football card packs".
- Factual use of team names, city names, and *team colors* in a free fan tool:
  standard and low-risk. **No logos, no photos, no player headshots**, no
  video game trademarks (never say Madden in-app).
- Player names + stats are facts; we display them with attribution
  ("Data: nflverse") in Settings.

## 13. Roadmap (explicitly out of v1)

1. Natural-language collection search via an on-device model (Cactus Needle
   class) — deferred; structured filters cover v1.
2. Voice pack opening (Whistle-class speech).
3. Historical/Legends packs (past seasons via same nflverse sources).
4. Weekly X-Factor "drop" notifications (PWA push).
5. Native wrapper (Tauri/Android) if distribution demands it — architecture
   intentionally keeps this possible.

## 14. Key decisions log

| # | Decision | Date |
|---|---|---|
| 1 | Phone-first PWA over native Android/desktop | 2026-10-03 |
| 2 | Static site + Python pipeline; no backend | 2026-10-03 |
| 3 | Procedural pixel tokens; no likenesses/logos | 2026-10-03 |
| 4 | Real-stats-driven ratings & tiers | 2026-10-03 |
| 5 | Reveal Drama: holds, escalating tells, capped fake-outs | 2026-10-03 |
| 6 | No AI model in v1 (Needle evaluated, deferred) | 2026-10-03 |
| 7 | Zod schema as pipeline↔app type contract | 2026-10-03 |
