# RipPack

RipPack is a phone-first installable web app (PWA) for opening free pro-football
card packs. Packs contain real, current professional players whose ratings and
rarity tiers (common / rare / elite / legend, plus weekly X-Factor risers) are
driven by real published stats. Pack openings have drama — escalating tells and
capped fake-outs before the reveal. Ripped cards land in a collection book, and
a squad builder rates your best lineup and exports it as text/CSV/PNG for
building rosters in your video game of choice. No accounts, no payments, no
server: everything runs on-device and works offline after first load.

## Dev setup

Prerequisites: Node >= 20, [`uv`](https://docs.astral.sh/uv/), Python 3.12.

```bash
cd pipeline && uv sync      # Python env (pipeline deps)
cd app && npm install       # JS deps
```

## Weekly data refresh

One command pulls live nflverse data, computes ratings, and atomically writes
the snapshot (it prints the realized tier distribution when it finishes; X-Factor
risers appear from the second refresh onward, once a previous week exists to
compare against):

```bash
cd pipeline && uv run build.py
```

Then rebuild the app so the new snapshot is bundled:

```bash
cd app && npm run build
```

`uv run build.py --source=fixtures` runs the same pipeline offline against
`pipeline/fixtures/` (what CI/tests use).

## Deploy

Static hosting only — publish `app/dist/` to any static host (GitHub Pages,
Cloudflare Pages, etc.). The app is an installable PWA and works offline after
first load. No backend, no environment variables.

## Tests

```bash
cd pipeline && uv run pytest -v   # pipeline unit + fixture smoke tests
cd app && npm test                # app unit tests (vitest)
cd app && npm run e2e             # UI smoke (Playwright): pack + squad journeys
```

## Data attribution & legal posture

- **Data: [nflverse](https://github.com/nflverse)** — rosters, stats, and team
  colors. Attribution is shown in the app's Settings screen.
- Overalls are publicly published game ratings, used verbatim; attribution
  ("Overalls: publicly published game ratings") appears only in Settings.
- The app name, UI, and copy contain no league or video-game trademarks and
  imply no affiliation.
- No player likenesses, photos, or team logos — avatars are procedural pixel
  art, colors are data-driven.

## Project layout

- `pipeline/` — Python data pipeline: nflverse pull, ratings, tiers, snapshot writer (`uv run build.py`)
- `app/` — React + TypeScript + Vite PWA (packs, collection, squad, settings)
- `data/` — committed output snapshot consumed by the app build
- `docs/` — spec and plan documents

## Spec & plan

- Spec: [docs/superpowers/specs/2026-10-03-rippack-card-pack-app-design.md](docs/superpowers/specs/2026-10-03-rippack-card-pack-app-design.md)
- Plan: [docs/superpowers/plans/2026-10-03-rippack-v1.md](docs/superpowers/plans/2026-10-03-rippack-v1.md)
