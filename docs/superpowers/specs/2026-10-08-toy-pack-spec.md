# Toy Pack — Stage Weather, Scan Kick, Luck Duel (spec)

Date: 2026-10-08 · Status: awaiting Aaron's go · Theme: expand the one-screen
toy mindset. No scrolling anywhere; everything is on-stage or overlay.

## 1. Stage Weather (ambient consequence)

The idle stage remembers the session. No UI, no numbers — derived from stats,
so Reset Everything clears the sky automatically.

- **Gold dust** (peaks pulled): ambient motes drift across the stage,
  twinkling. Density: 6 motes + 3 per peak, cap 18. Persists for session.
- **The sad leaf** (atomics pulled): a single brown leaf flutters top-to-bottom
  over ~6s on a sway sine with rotation. Cadence: 1 atomic → every ~40s,
  2+ → every ~20s; max 2 concurrent.
- **Gloom** (cheek streak ≥5): grid lines and ticker text tint progressively
  brown via a root class ladder (`weather-gloom-1/2`), implemented as a low
  alpha brown overlay on the stage — no canvas color plumbing.
- **Engine:** pure derivation `weatherOf(stats) → { motes, leafEveryMs, gloom }`
  (engine/weather.ts, unit-tested incl. caps); rendering = a low-intensity
  particle loop on the existing `.burst` canvas (z5, pointer-events none),
  rAF runs only while particles exist. Reduced motion: particles off, tint on.

## 2. Scan Kick (release physics)

The charge ramp has a breathe; the release gets a slap. On fire, same-frame:

- `.scan-btn` squash: scaleY .86 / scaleX 1.06 → spring settle (180ms class).
- `.stage` quake: ±2px jitter, 3 steps, 140ms class.
- `.hero` drop-bounce: translateY 2px, 300ms.
- Haptics: new `kick: [14, 18, 22]` pattern at release (pairs with chargeStop).
- Sound: `synth.kick()` — 70Hz sine drop + tick noise, gain ~0.2, layered
  under the stream tick engine.
- Reduced motion: no movement classes; sound + haptic remain.

## 3. Luck Duel (pass-and-play)

Two players, one phone, alternating pulls; the gauge's fate math judges each
side. Built entirely from existing machinery.

**Entry:** Settings gains a styled "LUCK DUEL — pass and play" row (like the
NO MIDS row). Tapping deals a duel-intro overlay (celebration-overlay
language): rules line ("5 pulls each, alternating. Fate keeps score."),
tip ("NO MIDS duels are savage" — duel inherits current toggles at start),
and a big "PLAYER 1 — READY" button (gold). P2 is brown. No names, no typing.

**During:**
- Compact turn chip under the scoreline: "P1 · PULL 3/5" (gold) or
  "P2 · PULL 4/5" (brown); SCAN subtext mirrors it.
- 5 pulls each, P1 first, strict alternation; turn advances after the
  celebration clears (celebrations unchanged — they're the show).
- Source toggle, filter chips, NO MIDS, and settings toggles lock during a
  duel (fate math stays clean). Settings offers "Abandon duel".
- Duel pulls accumulate duel-local stats only (engine/duel.ts), never the
  saved session stats — exhibition rules. Duel state is in-memory; refresh
  abandons.
- Sounds: duel-start sting (gold blip, brown blip), soft turn tick on pass.

**Finale (full-screen overlay):**
- Headline: "FATE FAVORS PLAYER 1" (or P2) in the winner's color wash.
- The math, shown: `P1 L +1.8 · best 94` vs `P2 L −0.4 · best 71`, with both
  best pulls as a two-card mini shelf.
- Side award line: "DUKE OF CHEEKS: P2 — 7 served" (most cheeks eaten,
  shown whenever it isn't the winner, or always if spicy).
- Buttons: REMATCH (same toggles, scores reset) / DONE.
- Winner = higher duel-local L (same z-combination as the gauge, per player).
  Tiebreaks: best rating → more peaks → "FATE IS COWARDLY — DRAW."

**New code:** engine/duel.ts (pure: turn order, accumulators incl. per-pull
expected rates for honest L, winner + tiebreak + duke — fully unit-tested),
DuelBanner chip, finale overlay + CSS in Scanner, synth stings, haptic
patterns. One-screen guarantee verified via audit with a duel mid-flight.

## Non-goals

No scrolling surfaces, no typing, no backend, no persistence for duels,
no odds changes (weather/kick are cosmetic; duels reuse the honest math).
