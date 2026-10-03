"""Pure rating math. Takes plain dicts; pandas stays in build.py."""
import math

from config import (CURVE_EXPONENT, DRAFT_PRIOR, MIN_POSITION_POOL, POOL_FLOOR_RATING,
                    PRIOR_WEIGHT, RATING_MAX, RATING_MIN, TIER_THRESHOLDS)


def fantasy_ppg(s: dict) -> float:
    """Half-PPR fantasy points per game from a season-stats dict."""
    games = s.get("games") or 0
    if games <= 0:
        return 0.0
    pts = (
        s.get("pass_yds", 0) / 25 + s.get("pass_td", 0) * 4 - s.get("int", 0) * 2
        + s.get("rush_yds", 0) / 10 + s.get("rush_td", 0) * 6
        + s.get("rec", 0) * 0.5 + s.get("rec_yds", 0) / 10 + s.get("rec_td", 0) * 6
    )
    return pts / games


def blend_score(cur_ppg: float, prior_ppg: float | None, draft_round: int | None) -> float:
    # Controller-approved deviation from the brief: draft_round=None means NO prior
    # signal at all (DRAFT_PRIOR's None entry is deliberately not consulted) —
    # current production only.
    prior = prior_ppg if prior_ppg is not None else (
        DRAFT_PRIOR.get(draft_round) if draft_round is not None else None)
    if prior is None:
        return cur_ppg
    return (1 - PRIOR_WEIGHT) * cur_ppg + PRIOR_WEIGHT * prior


def tier_of(rating: int) -> str:
    if rating >= TIER_THRESHOLDS["legend"]:
        return "legend"
    if rating >= TIER_THRESHOLDS["elite"]:
        return "elite"
    if rating >= TIER_THRESHOLDS["rare"]:
        return "rare"
    return "common"


def _curve(pct: float) -> int:
    """Percentile (0..1) -> rating on the RATING_MIN..RATING_MAX curve."""
    return round(RATING_MIN + (RATING_MAX - RATING_MIN) * pct ** CURVE_EXPONENT)


def _pct_rank(values: list[float], higher_better: bool) -> list[float]:
    """Percentile per value, with average-rank ties: tied values share the
    average of their rank positions, so ratings never depend on input order."""
    n = len(values)
    order = sorted(range(n), key=lambda i: values[i], reverse=higher_better)
    ranks = [0.0] * n
    start = 0
    while start < n:
        end = start
        while end + 1 < n and values[order[end + 1]] == values[order[start]]:
            end += 1
        avg_pos = (start + end) / 2
        for k in range(start, end + 1):
            ranks[order[k]] = (n - 1 - avg_pos) / (n - 1) if n > 1 else 1.0
        start = end + 1
    return ranks


def rate_players(players: list[dict]) -> list[dict]:
    """Per-position percentile curve: best of each position -> 99, worst -> 40."""
    by_pos: dict[str, list[dict]] = {}
    for p in players:
        by_pos.setdefault(p["position"], []).append(p)
    for group in by_pos.values():
        # Controller-approved deviation from the brief: a lone player is the top
        # of their group and takes the curve (n=1 -> percentile 1.0 -> 99);
        # the flat floor applies only to small-but-not-singleton pools (2..4).
        if 1 < len(group) < MIN_POSITION_POOL:
            for p in group:
                p["rating"], p["tier"] = POOL_FLOOR_RATING, tier_of(POOL_FLOOR_RATING)
            continue
        blends = [blend_score(p["cur_ppg"], p["prior_ppg"], p["draft_round"]) for p in group]
        for p, pct in zip(group, _pct_rank(blends, True)):
            p["rating"] = _curve(pct)
            p["tier"] = tier_of(p["rating"])
    return players


def rate_defenses(defs: list[dict]) -> list[dict]:
    sacks = _pct_rank([d["sacks"] for d in defs], True)
    tk = _pct_rank([d["takeaways"] for d in defs], True)
    pa = _pct_rank([d["points_allowed_per_game"] for d in defs], False)
    for i, d in enumerate(defs):
        composite = (sacks[i] + tk[i] + pa[i]) / 3
        d["rating"] = _curve(composite)
        d["tier"] = tier_of(d["rating"])
    return defs
