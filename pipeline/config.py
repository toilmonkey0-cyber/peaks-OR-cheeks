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

# Loader constants (Task 4 fix round).
ROSTER_STATUSES = ("ACT", "RES")  # spec §4 card pool: active + reserve/IR only;
                                  # CUT/DEV/RET/INA/EXE/NAV/NFI/PS are all excluded
DRAFT_PICKS_PER_ROUND = 32  # seasonal rosters ships overall pick, not round
DRAFT_MAX_ROUND = 7
HTTP_TIMEOUT_S = 30         # published-ratings endpoint fetch timeout

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

# --- Rollout app data (fetch_madden.py) -------------------------------------
# Final completed-season ratings: immutable once the game's season ends, so this
# is a one-shot fetch, not a weekly refresh. Iteration ids are strings
# ("1-base" .. "23-super-bowl"), NOT ints (probed live 2026-10-06: ints return 0).
MADDEN_NAMESPACE = "madden-nfl"
MADDEN_ITERATION = "23-super-bowl"
# Official position filter ids, extracted from the ratings site payload
# (Madden 26 renamed edge/LB slots: LEDG/REDG/SAM/MIKE/WILL — classic
# LE/RE/LOLB/MLB/ROLB return 0 items).
MADDEN_POSITION_CANDIDATES = [
    "QB", "HB", "FB", "WR", "TE", "LT", "LG", "C", "RG", "RT",
    "LEDG", "REDG", "DT", "SAM", "MIKE", "WILL", "CB", "FS", "SS",
    "K", "P", "LS",
]
# Numeric drop-api team id → abbr. Verified 2026-10-06 against each id's top
# players (weak-vote rows 12/14/16/18 manually confirmed: MIA/ATL/NYG/NYJ).
MADDEN_TEAMS: dict[int, str] = {
    1: "CHI", 2: "CIN", 3: "BUF", 4: "DEN", 5: "CLE", 6: "TB", 7: "ARI", 8: "LAC",
    9: "KC", 10: "IND", 11: "DAL", 12: "MIA", 13: "PHI", 14: "ATL", 15: "SF", 16: "NYG",
    17: "JAX", 18: "NYJ", 19: "DET", 20: "GB", 21: "CAR", 22: "NE", 23: "LV", 24: "LA",
    25: "BAL", 26: "WAS", 27: "NO", 28: "SEA", 29: "PIT", 30: "TEN", 31: "MIN", 32: "HOU",
}
