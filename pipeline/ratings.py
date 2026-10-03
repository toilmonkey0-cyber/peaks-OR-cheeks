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
        scored = sorted(group, key=lambda p: blend_score(p["cur_ppg"], p["prior_ppg"], p["draft_round"]),
                        reverse=True)
        n = len(scored)
        for rank, p in enumerate(scored):
            pct = (n - 1 - rank) / (n - 1) if n > 1 else 1.0
            p["rating"] = round(RATING_MIN + (RATING_MAX - RATING_MIN) * pct ** CURVE_EXPONENT)
            p["tier"] = tier_of(p["rating"])
    return players


def _pct_rank(values: list[float], higher_better: bool) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i], reverse=higher_better)
    ranks = [0.0] * len(values)
    n = len(values)
    for pos, i in enumerate(order):
        ranks[i] = (n - 1 - pos) / (n - 1) if n > 1 else 1.0
    return ranks


def rate_defenses(defs: list[dict]) -> list[dict]:
    sacks = _pct_rank([d["sacks"] for d in defs], True)
    tk = _pct_rank([d["takeaways"] for d in defs], True)
    pa = _pct_rank([d["points_allowed_per_game"] for d in defs], False)
    for i, d in enumerate(defs):
        composite = (sacks[i] + tk[i] + pa[i]) / 3
        d["rating"] = round(RATING_MIN + (RATING_MAX - RATING_MIN) * composite ** CURVE_EXPONENT)
        d["tier"] = tier_of(d["rating"])
    return defs
