# Real player art — the two lanes (personal use)

Peaks or Cheeks is published on public GitHub Pages, so **no copyrighted
image files live in the repo or the deployed site.** Real art reaches the
cards at runtime instead:

## Lane A — automatic (EA + ESPN CDNs, on by default)

The weekly pipeline (`pipeline/fetch_madden.py`) captures two fields per
player straight from EA's own ratings feeds:

- `portrait` — `"26/1370"` style ref into
  `https://ratings-images-prod.pulse.ea.com/madden-nfl-<game>/portraits/<file>.png`
  (official EA portrait, 329×329 transparent PNG; the file id is **not** the
  EA player id, so it must be captured per player — it is).
- `abilityArt` — real X-Factor / Superstar ability icon urls from
  `drop-assets.ea.com`.

Team logos come from `https://a.espncdn.com/i/teamlogos/nfl/500/<ABBR>.png`
(all 32 verified). Nothing is downloaded into the repo; the app hotlinks and
the service worker caches what's seen (`card-art` cache, so art works offline
after first view). Toggle any time in Settings → **Real player art**.

## Lane B — hand-saved true MUT renders (`rollout/public/mutart/`)

mut.gg card renders can't be fetched by tooling (Cloudflare), but a human
with a browser can save them one by one. That's this lane — **for your
personal build only, never committed** (the folder is gitignored).

1. Open a card page on mut.gg, right-click the card image → Save image as…
2. Drop it into `rollout/public/mutart/` named either
   - `<playerId>.png` — e.g. `ea-112.png` (the dataset id), or
   - `<full-name-slug>.png` — e.g. `geno-smith.png`
   (`.jpg` / `.webp` also probed; lowercase names, spaces → hyphens)
3. Rebuild (`cd rollout && npm run build`) so the file lands in `dist/`,
   reload the app, scan. That player's card now uses YOUR saved render.

Precedence per player: **mutart drop → EA portrait → procedural card.**
The mutart probe runs first on every pull; a miss costs one fast 404 and
falls through. Probing happens at `fire()` — the scan cycle stretches up to
~0.9s while art decodes (deliberate: anticipation is half the fun), then the
card lands with whatever is resident. Art never hot-swaps mid-celebration.

## Repo hygiene rules

- `rollout/public/mutart/` is **gitignored** — check `git status` before any
  push; a real card image must never be committed or deployed.
- Lane A dataset fields are just urls/ids (facts) — those are fine to commit.
- If EA/ESPN CDN patterns ever die, Settings → Real player art off restores
  the fully procedural card instantly.
