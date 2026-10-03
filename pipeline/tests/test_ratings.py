import math
from ratings import fantasy_ppg


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


from ratings import blend_score, rate_players, tier_of


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
    assert all(p["rating"] == config_rated_floor(p) for p in rated)


def config_rated_floor(p):
    from config import POOL_FLOOR_RATING
    return POOL_FLOOR_RATING


def test_positions_curve_independently():
    # One QB at 5 ppg and one P at 5 ppg: both top of their group -> both 99.
    players = [_player("QB1", 5.0, pos="QB"), _player("PT1", 5.0, pos="P")]
    rated = rate_players(players)
    assert all(p["rating"] == 99 for p in rated)
