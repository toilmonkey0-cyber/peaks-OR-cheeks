# HANDOFF: Peaks or Cheeks → CardForge

**READ THIS FIRST.** You are the engineer picking up a live, shipped product and
forking it into its next life. This document is self-contained on purpose: it
assumes you have nothing but this repo and this file. It contains the full
product context, every architectural decision and why it was made, every
landmine we already stepped on (with symptoms, so you can recognize them), and
the agreed plan for the fork. Read it top to bottom before writing any code.
Your first deliverable is **your own spec** (see §9) — not a build.

---

## 1. The two projects

**Peaks or Cheeks (this repo)** — a shipped, deployed, fully working toy: a
slot-machine-disguised random pro-football player generator with verdict
celebrations, an honest luck gauge, a vault, duels, a stat-guessing game, an
easter-egg secret collection, and NO MIDS mode. It uses real EA Madden rating
data. It lives at its final scope; we are NOT abandoning it — it stays live.

**CardForge (your project)** — the fork: the same engine, decoupled from all
real-world data, reborn as a **universal card-randomization engine with a local
modding system**. Users bring their own decks (any domain — sports, wrestling,
anime, vocab), their own art, their own names. Ships with a procedurally
generated fictional league as the only bundled content. Eventually a native
Android app (Capacitor), iOS after that. The owner's phrase for the goal:
"users can use whatever art and player names and team names they want," and it
must be "seamless, easy, maybe even fun — it won't work if it's clunky."

Owner: Aaron. He is non-technical-ish, opinionated about UX and fun, tests
everything on real devices (phone + eventually tablet), reports bugs like a
user ("it looks broken when…"), and approves designs before builds. Show him
working software early and often.

## 2. Asset map

| What | Where |
|---|---|
| Source repo (fork FROM this) | `C:\Users\aaron\ZCodeProject\nfl-card-app` (Windows), GitHub: `github.com/toilmonkey0-cyber/peaks-OR-cheeks`, branch `main` |
| Live deployed app | https://toilmonkey0-cyber.github.io/peaks-OR-cheeks/ (GitHub Pages, auto-deploys on push to main, ~40s) |
| The app you're forking | `rollout/` inside the repo — **NOT `app/`** (`app/` is RipPack v1, the older pack-opening game; leave it alone) |
| Design history / decision docs | `docs/superpowers/specs/*.md` — read the Rollout spec + toy-pack spec at minimum |
| Data being removed in the fork | `data/madden.json`, `data/madden27.json`, `pipeline/fetch_madden.py` (see §7 for the EA API knowledge worth keeping) |
| Verification toolbench | `rollout/*.mjs` scripts (see §6) — copy these to the fork |
| The original app's README | repo root — good orientation for tone and commands |

New repo: create `CardForge` as a fresh GitHub repo under the same account.
Copy `rollout/` (minus the NFL data) as the seed. Do not modify the original
repo beyond this handoff doc.

## 3. Current architecture tour (what you're inheriting)

Stack: React 19 + Vite + TypeScript (strict) + Zod validation, custom CSS (no
UI framework), zero runtime deps beyond react/react-dom/zod, Web Audio (all
sound synthesized — zero audio assets), canvas animations, PWA via
vite-plugin-pwa. 72 tests across 14 files (vitest, jsdom). No backend, no
accounts, no network calls — everything on-device, localStorage-persisted.

The engine inventory (all of this is content-agnostic in spirit and moves to
CardForge):

- **`src/engine/`** — the pure, fully-tested heart:
  - `rng.ts` seeded RNG (mulberry32 + FNV hash) — determinism everywhere
  - `draw.ts` + `config.ts` — the slot: tier-weighted draw, staggered lock
    delays, near-miss scheduling, `tierMassOf` concentration cap (no single
    player >8% of draws — voids the tier's mass to an any-bucket),
    `verdictViable`/`MIN_VERDICT_POOL` thin-pool gate, pool filter combinations
  - `luck.ts` — the honest luck math: per-pull expected fractions + variance
    accumulated at pull time (filter-switch-proof), z-combination → gauge
  - `duel.ts`, `highlow.ts`, `weather.ts`, `void.ts` — pass-and-play duel,
    stat-guessing game, ambient stage weather (derived from stats), the secret
    collection dealer (ghosts + 32 mascots)
- **`src/audio/synth.ts`** — every sound: tick engine, lock-note ladder, sad
  trombone (`celebrate("cheeks")`), charge riser, stingers, crowd hum. All
  synthesized on the audio clock; AudioContext created lazily in a user
  gesture (iOS unlock)
- **`src/screens/Scanner.tsx`** — the one-screen state machine: idle →
  charging (convergence animation) → scanning (name stream + staggered locks)
  → verdict celebration → result. Also hosts duel/H-L/void modes as phase
  branches. It's large; in CardForge, consider splitting mode hosts
- **`src/components/`** — CardView (the chrome-framed card with the giant
  jersey number), LuckGauge, LuckStrip (session-as-waveform + vault button),
  Vault, VoidCard + CreatureCanvas (procedural 12×12 pixel creatures)
- **`src/storage/storage.ts`** — localStorage save shape with migrations
  (three generations of shape changes, all handled — study this pattern)
- **One-screen, no-scroll philosophy** — see §5; it is the product's spine

The content layer to strip/replace: `data/madden*.json` (inlined at build),
`src/data/snapshot.ts` + `schema.ts` (football-specific fields), `GROUPS`
position map, hardcoded tier thresholds (90/80/70) and verdict thresholds
(peak ≥80, cheeks ≤62, atomic ≤58), football stat labels (SPD/ACC/…), and the
NFL-flavored copy. In CardForge all of that becomes **deck-defined**.

## 4. The CardForge plan (as agreed with Aaron, 2026-10-10)

Decisions, each with its why:

1. **Fork, don't rewrite.** The engine is the crown jewel and it's tested.
   Copy `rollout/`, strip content, keep the tests passing throughout.
2. **Ships clean: synthetic-only.** Zero real names/teams/logos/ratings in the
   public app and repo. Default content = procedurally generated fictional
   league (funny generated names, fake teams with palettes, procedural mascot
   creatures — the systems already exist). Why: legal posture + it demos the
   generator's personality.
3. **Real NFL data = community tool, not shipped content.** The EA pipeline
   (§7) becomes a documented repo script: run it → get `nfl-deck.json` →
   import. Power users get the real league in two commands.
4. **Fully generic deck schema.** Thresholds, stat labels, position/group
   map, verdict rules, drop rates — ALL live in the deck, not the engine.
   Any domain works. This was Aaron's explicit pick over sports-only.
5. **Three-layer architecture:** Engine (mechanics, untouched) / Deck
   (portable data pack: teams, cards, thresholds, labels, art refs) /
   Session (user save — engine-side forever, never in a deck).
6. **Storage in IndexedDB** (decks + art blobs). localStorage is already at
   its comfort limit; art doesn't fit in it at all.
7. **Ingestion v1 = FULL editor.** Aaron explicitly chose the complete scope:
   drag-drop JSON/CSV import with live validation and human-readable errors,
   the in-app editor ("The Mint" — edit a card, immediately test-pull it from
   a real wheel), deck export. Also planned: spreadsheet template as the
   power-user path, Android share-target ("Open with CardForge"), QR deck
   trading (decks are a few KB), the Deck X-Ray (import shows tier histogram,
   verdict rates, luck fairness — the "data clerk" as a user feature).
8. **UX law:** the modder's journey is GET → INGEST → BEAUTIFY → PLAY →
   TRADE, and every step is a gesture, never a menu crawl. The Loading Dock
   (drop a file anywhere on the wheel, the House eats it), art auto-processing
   (trim/resize/quantize in-browser — the mascot pipeline, automated), no
   crest → procedural creature fallback so artless decks still look intentional.
9. **Native via Capacitor, Android first.** The modding pivot makes native
   the right call NOW because file ingestion and iOS haptics only exist
   natively (iOS Safari PWAs: no share-target, no vibration API). Wrap the
   web app; keep the web build working. Android immediately (sideload/
   emulator testing). **iOS requires a Mac + Xcode + $99/yr Apple Developer
   account — Aaron confirmed "eventually iOS"; Mac access is an OPEN
   QUESTION** (see §8).
10. **Monetization direction (do not implement yet):** Supporter Pass
    (one-time, Stripe/Gumroad link — no ads ever, Aaron hates them), content
    expansions on the House's Collection shelf. The 32-slot secret vault was
    designed as that shelf.
11. **Keep Peaks or Cheeks live and untouched.** No changes to the original
    beyond this doc.

## 5. The soul of the thing (non-negotiables)

- **Toy, not app.** One screen, zero scrolling (measured, enforced — see the
  audit tool), everything responds to touch, identity-as-scenery (the hero is
  big type in the stage, the topbar is slim chrome).
- **Honest math, always.** Expected odds derive from the live pool; the luck
  gauge's "fate owed" accumulates per-pull reality. When a mode can't keep a
  promise (thin pools), the app says so (THIN POOL badge) instead of lying.
- **The house has a voice.** Deadpan, PG-13 with rare "He is ass.", Norris-
  fact peaks, museum-grade atomics. Copy pools live in config, tuned like
  game constants.
- **Every moment is choreographed:** charge (inhale/convergence) → kick
  (release slap) → scan (exhale/stream) → judgment beat (400ms silence) →
  celebration. Timing constants are game-feel tunables in one config file.
- **Sound is synthesized, haptics are a first-class language** (visual pulse
  fallback where the Vibration API doesn't exist — until native fixes iOS).
- **Verification is not optional.** Every feature ships with: unit tests,
  a scripted bot when it has a UI flow, and the responsive audit for layout
  work. See §6.

## 6. Landmines we already hit (symptoms + fixes + where)

1. **rAF timestamps can predate effect-mount `performance.now()`** → first
   frame computes negative elapsed → array index −1 → TypeError kills the
   animation loop → blank canvas while timers keep firing ("sound works but
   the window is blank"). FIX: clamp `t = Math.max(0, now - start)` and clamp
   array indices; keep rAF loops' non-terminal branches scheduling
   unconditionally (a branch that stopped scheduling froze the idle sweep for
   weeks unnoticed).
2. **Cancellable-timer state machines race rapid input.** Duel turn-advance
   lived on setTimeout chains; firing again mid-celebration cancelled a
   pending advance → double-pull for one player. FIX: pending-flag flushed at
   next interaction + flow the flushed state through a local (React state
   updates don't change this closure's captured value).
3. **Pointer handlers can read a stale pre-"charging" render** when a heavy
   mount (celebration + backdrop-filter sheet) stalls commit >160ms → taps
   silently swallowed. FIX: gesture state in sync refs, not state closures.
4. **CSS grid blowout:** grid items default `min-width:auto`; a fixed-width
   child (the 360px card) can force its track past the viewport — clipped by
   `overflow:hidden`, INVISIBLE to scrollWidth checks. FIX: `min-width:0` on
   grid children + `max-width:100%` on the child.
5. **NO MIDS on thin pools floods peaks** (WR: 54 peaks + 1 cheeks → the
   concentration cap voided the common mass to a pool-uniform bucket ≈ 98%
   peaks → "25 peaks in a row"). FIX: `verdictViable` gate (both verdict
   classes ≥4 players or the filter declines). In CardForge this whole class
   of problem becomes deck-defined thresholds — keep the viability gate
   concept, generalized.
6. **vite-plugin-pwa errors CI builds when any precached asset exceeds
   Workbox's 2MB default** (symptom: `error during build: Assets exceeding
   the limit… 2.11MB`). FIX in place: `maximumFileSizeToCacheInBytes: 3MB`
   in vite.config. CardForge bundles will grow with art — remember this.
7. **PWA serves stale once** after every rebuild (SW updates on second
   reload). Handled UX-wise with prompt-mode updates (`registerType:
   'prompt'` + FRESH CARDS READY toast + foreground/hourly checks). Any test
   bot that reloads after a rebuild must reload twice.
8. **`virtual:pwa-register` doesn't resolve under vitest** → App.test
   silently failed to load for days (totals looked fine). FIX: test-only
   alias to `src/test-pwa-stub.ts`. LESSON: grep for "Test Files N" AND
   "Tests M" — if files < expected, something failed to LOAD.
9. **CI needs Node 22** (vitest 5 fork pool: `webidl.util.markAsUncloneable
   is not a function` on Node 20).
10. **GitHub Pages builds need the subpath base** — `base:
    process.env.GITHUB_PAGES ? "/<repo>/" : "/"` pattern; art paths relative
    (no leading slash) so they survive subpaths.
11. **The in-app browser's viewport emulation lies** (stale layout geometry
    at some sizes). Never trust it for layout verdicts — the Playwright
    scripts are ground truth. Trust what you see; verify what's true.

**The toolbench (copy it to the fork, keep it growing):** run from `app/`
(they borrow its node_modules): `node ../rollout/<script>.mjs`
- `audit.mjs` — six viewport stations, spins + page-fit assertions + screenshots
- `probe.mjs` — spin blankness (pixel-samples the canvas) + pageerror capture
- `verify.mjs` — tablet-station card placement
- `duel.mjs` / `highlow.mjs` / `void.mjs` — full-journey bots with PASS contracts
- `repeat.mjs` — repeat-player distribution probe
- `lines.mjs` — tagline sampler
These encode every regression we ever hit. When CardForge changes decks, the
bots need deck-aware seeding — port the intent, not just the files.

## 7. EA data pipeline reference (for the community tool)

Only if you build the NFL deck tool: `drop-api.ea.com/rating/madden-nfl`
serves the PREVIOUS game's completed season; iteration ids are STRINGS
(`1-base`…`23-super-bowl`, ints return 0 items); current-game data flows via
ea.com's Next.js data route (`/_next/data/<buildId>/…?page=N`, buildId
scraped from the ratings page HTML) — items there carry team+position
objects; Madden 26 positions: LEDG/REDG/SAM/MIKE/WILL replace classic
LE/RE/LOLB/MLB/ROLB. Full working code: `pipeline/fetch_madden.py` +
`pipeline/config.py` in this repo. The data itself (names+numbers) is
factual; the legal posture is: app ships none of it, users fetch their own.

## 8. Open questions (ask Aaron, don't assume)

- **Mac access for iOS builds?** (Capacitor iOS needs Xcode. Determines iOS
  timing; Android is unaffected.)
- CardForge's public name/branding (working title only).
- Does the House's Collection + void secret carry over as-is into CardForge?
  (Assumed yes — it's engine-side original content. The mascot art pipeline
  definitely ports.)
- Single deck active at a time vs. deck switching mid-session? (Assumed:
  switching with per-deck sessions, like the current per-source stats.)
- Where do community decks live (gists? a repo dir? nowhere — pure
  peer-to-peer)? Assumed nowhere for v1: import/export/QR only.

## 9. Your first week (recommended process)

1. Read this doc + the two specs in `docs/superpowers/specs/`. Run the
   original app (commands below); play it on a phone. Feel the toy before
   you dissect it.
2. Fork the repo, get the copy building green with tests passing BEFORE
   changing anything.
3. Write **your own spec** for CardForge v1 from §4 + §5 — your
   understanding, your structure, your open questions — and get Aaron to
   approve it before implementation. (This document deliberately does NOT
   do that step for you.)
4. Build in the established rhythm: tunables in one config file per system,
   tests with every module, a bot for every flow, the audit for every
   layout change, small commits in the existing voice ("feat: …", "fix:
   …"), push = deploy.
5. When you hit a weird bug: reproduce with a script FIRST, instrument
   SECOND, fix THIRD. Every landmine in §6 was found that way.

Quickstart (original repo):
```
cd rollout && npm ci && npm test        # 72 tests
npm run dev                             # :5174
npm run build && npx vite preview --host --port 4174   # :4174 (what bots target)
```

— Written by the ZCode agent that built Peaks or Cheeks alongside Aaron,
October 2026. The engine is good. Be careful with it, be weird with it,
and keep the house's voice.
