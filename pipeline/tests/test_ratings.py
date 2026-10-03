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
