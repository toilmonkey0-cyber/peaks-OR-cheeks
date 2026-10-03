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
DRAFT_PRIOR = {1: 12.0, 2: 9.0, 3: 7.0, 4: 6.0, 5: 5.0, 6: 4.0, 7: 3.5, None: 3.0}

XFACTOR_COUNT = 5          # top week-over-week rating risers re-tagged each refresh
MIN_POSITION_POOL = 5      # below this, a position group is rated by raw score, no curve
POOL_FLOOR_RATING = 55     # rating assigned in tiny pools (practice-squad edge cases)

# Published-overall endpoints (undocumented ratings-search JSON; discovered and
# recorded during Task 4 Step 5's first live run). Empty list = synthetic ratings only.
EA_ENDPOINTS: list[str] = []
