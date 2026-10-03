import math

from config import POOL_FLOOR_RATING
from ratings import (blend_score, fantasy_ppg, rate_defenses, rate_players,
                     tier_of)


def test_fantasy_ppg_half_ppr_qb():
    # 3000 pass yds, 20 pass td, 10 int, 10 games -> per game then half-ppr score
    stats = {"games": 10, "pass_yds": 3000, "pass_td": 20, "int": 10,
             "rush_yds": 0, "rush_td": 0, "rec": 0, "rec_yds": 0, "rec_td": 0}
    expected = (3000 / 25 + 20 * 4 - 10 * 2) / 10  # (120+80-20)/10 = 18.0
    assert math.isclose(fantasy_ppg(stats), expected)


def test_fantasy_ppg_receiver_and_zero_games():
    stats = {"games": 0, "pass_yds": 0, "pass_td": 0, "int": 0,
             "rush_yds": 100, "rush_td": 2, "rec": 8, "rec_yds": 120, "rec_td": 1}
    assert fantasy_ppg(stats) == 0.0  # never divide by zero


def test_blend_score_uses_prior_and_draft_prior():
    assert math.isclose(blend_score(20.0, 10.0, None), 0.7 * 20 + 0.3 * 10)
    assert math.isclose(blend_score(20.0, None, 1), 0.7 * 20 + 0.3 * 12.0)
    assert blend_score(20.0, None, None) == 20.0  # no info: current only


def _player(pid, ppg, pos="WR"):
    return {"player_id": pid, "name": "T. Est", "full_name": "Test Est",
            "position": pos, "team": "ARI", "jersey": 11, "age": 25,
            "cur_ppg": ppg, "prior_ppg": None, "draft_round": None,
            "key_stats": [{"label": "REC", "value": "50"}]}


def test_rate_players_curve_and_tiers():
    # 11 WRs, ppg 30..20 (step -1). Best p=1 -> 99 (legend); worst p=0 -> 40 (common).
    players = [_player(f"P{i}", 30 - i) for i in range(11)]
    rated = rate_players(players)
    by_id = {p["player_id"]: p for p in rated}
    assert by_id["P0"]["rating"] == 99 and by_id["P0"]["tier"] == "legend"
    assert by_id["P10"]["rating"] == 40 and by_id["P10"]["tier"] == "common"
    # p=0.9 -> round(40 + 59 * 0.9**4) = round(78.71) = 79 -> rare
    assert by_id["P1"]["rating"] == 79 and by_id["P1"]["tier"] == "rare"


def test_rate_players_tiny_pool_floor():
    players = [_player(f"Q{i}", 20 - i, pos="P") for i in range(3)]
    rated = rate_players(players)
    assert all(p["rating"] == POOL_FLOOR_RATING for p in rated)


def test_positions_curve_independently():
    # One QB at 5 ppg and one P at 5 ppg: both top of their group -> both 99.
    players = [_player("QB1", 5.0, pos="QB"), _player("PT1", 5.0, pos="P")]
    rated = rate_players(players)
    assert all(p["rating"] == 99 for p in rated)


def test_rate_defenses_best_and_worst():
    defs = [{"team": f"T{i:02d}", "sacks": 10 + i, "takeaways": 5 + i,
             "points_allowed_per_game": 30 - i} for i in range(32)]
    rated = rate_defenses(defs)
    by_team = {d["team"]: d for d in rated}
    assert by_team["T31"]["rating"] == 99 and by_team["T31"]["tier"] == "legend"
    assert by_team["T00"]["rating"] == 40 and by_team["T00"]["tier"] == "common"
    assert all(40 <= d["rating"] <= 99 for d in rated)


# --- Fix round 1: average-rank ties (order-independent ratings) + tier boundaries ---


def test_rate_players_ties_are_order_independent():
    # Five WRs; the middle three have identical blended scores -> identical ratings.
    base = [
        _player("W0", 30.0), _player("W1", 20.0), _player("W2", 20.0),
        _player("W3", 20.0), _player("W4", 10.0),
    ]
    forwards = rate_players([dict(p) for p in base])
    backwards = rate_players([dict(p) for p in reversed(base)])
    f = {p["player_id"]: p["rating"] for p in forwards}
    b = {p["player_id"]: p["rating"] for p in backwards}
    assert f == b  # permuting input order changes nobody's rating
    # Tied trio shares the average of rank positions 1,2,3 -> pct 0.5 -> 44.
    assert f["W1"] == f["W2"] == f["W3"] == 44
    assert f["W0"] == 99 and f["W4"] == 40


def test_tier_boundaries():
    assert tier_of(69) == "common"
    assert tier_of(70) == "rare"
    assert tier_of(79) == "rare"
    assert tier_of(80) == "elite"
    assert tier_of(89) == "elite"
    assert tier_of(90) == "legend"
    assert tier_of(99) == "legend"


def test_tiny_pool_floor_tier_is_common():
    players = [_player(f"F{i}", 20 - i, pos="P") for i in range(3)]
    rated = rate_players(players)
    assert all(p["tier"] == "common" for p in rated)
