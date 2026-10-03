"""All pipeline tunables. Spec §5–§6. Nothing else in this repo hardcodes these."""

SEASON = 2026

# Rating curve: rating = RATING_MIN + (RATING_MAX - RATING_MIN) * p ** CURVE_EXPONENT
RATING_MIN = 40
RATING_MAX = 99
CURVE_EXPONENT = 4
TIER_THRESHOLDS = {"legend": 90, "elite": 80, "rare": 70}  # else common

# Score blending: current season vs prior season fantasy PPG.
PRIOR_WEIGHT = 0.3
# Draft-round prior for players with no prior-season PPG (approx prospect PPR PPG).
# No None key: an unknown draft round means no prior signal at all (current season only).
DRAFT_PRIOR = {1: 12.0, 2: 9.0, 3: 7.0, 4: 6.0, 5: 5.0, 6: 4.0, 7: 3.5}

XFACTOR_COUNT = 5          # top week-over-week rating risers re-tagged each refresh
MIN_POSITION_POOL = 5      # below this, a position group is rated by raw score, no curve
POOL_FLOOR_RATING = 55     # rating assigned in tiny pools (practice-squad edge cases)

# Published-overall endpoints (undocumented ratings-search JSON; discovered and
# recorded during Task 4 Step 5's first live run). Empty list = synthetic ratings only.
#
# DISCOVERY STATUS (2026-10-03): the ratings search on ea.com is a Next.js app that
# calls drop-api REST at:
#   https://drop-api.ea.com/rating/madden-nfl?limit=100&iteration=<iter>&team=<numeric id>
# (list responses are {"items": [...]} with firstName/lastName/overallRating; item-level
# team/position are null, so per-team and per-position queries + a name join are needed;
# numeric team ids 1..32 map to the current 32 franchises). HOWEVER that namespace only
# serves the PREVIOUS game's completed season (iterations 1-base .. 23-super-bowl); the
# current Madden 27 weekly ids (madden-ratings-week-N) return 0 items via REST - only
# the site's server-side GraphQL carries them, and that surface is not bulk-exportable.
# Revisit: if EA starts serving the current game under this namespace (or a sibling like
# madden-nfl-28), paste the URL here and _load_ea normalizes the row shape automatically.
EA_ENDPOINTS: list[str] = []
