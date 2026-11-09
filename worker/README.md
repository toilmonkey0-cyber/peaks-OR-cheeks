# formation-board — FORMATION's little server

A Cloudflare Worker + D1 that serves the friends board and the published daily. The app works
perfectly without it (the daily falls back to a locally-seeded game); this is the upgrade.

## One-time deploy (~10 minutes, needs Aaron's Cloudflare login)

```bash
cd worker

# 1. log in (browser opens once)
npx wrangler login

# 2. create the database — copy the printed database_id
npx wrangler d1 create formation-board

# 3. paste that id into wrangler.toml (database_id = "..."), then apply the schema
npx wrangler d1 execute formation-board --file schema.sql --remote

# 4. deploy
npx wrangler deploy
#    → prints https://formation-board.<your-subdomain>.workers.dev
```

Then wire the app to it: in the Pages repo settings (or `.env` locally) set

```
VITE_FORMATION_API=https://formation-board.<your-subdomain>.workers.dev
```

rebuild + push (`npm run build` in `rollout/`, commit `dist` via the normal deploy flow), and the
GROUPS / THE BOARD entries come alive on the deployed site. Without the variable the app never
calls the worker at all.

## Refreshing the roster snapshot (Friday ritual, after `fetch_madden.py --game 27`)

```bash
cd worker && node build-data.mjs && cd .. && git add worker/data.json && git commit -m "data: formation worker snapshot W<N>"
npx wrangler deploy   # from worker/
```

The published daily for a given local day locks on first request; a snapshot refresh mid-day
therefore only affects the NEXT day's game (this is the phase-C fix for the mid-day landmine).

## Tests (zero dependencies)

```bash
cd worker && npm test        # daily publisher (5) + endpoints over a D1 shim (7)
```

## What it costs

Free tier: 100k requests/day, D1 5M reads + 100k writes/day. A friends board at realistic scale
uses a rounding error of that. `wrangler tail` shows live traffic when curious.

## Notes

- Codes use a no-confusion alphabet (no 0/O/1/I), 6 chars.
- One score row per (group, day, player); re-posts upsert, latest detail wins.
- Spoiler gating is client-side by design (trust posture, spec §8): the API returns rows; the app
  holds them back until you've played today.
- No accounts, no secrets: identity is a uuid in the player's localStorage.
