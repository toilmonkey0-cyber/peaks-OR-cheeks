"""Pure rating math. Takes plain dicts; pandas stays in build.py."""
import math


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
