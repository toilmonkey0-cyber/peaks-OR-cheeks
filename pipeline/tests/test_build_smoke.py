import pandas as pd
from build import build_snapshot, FIXTURES

EXPECTED_FIRST_CARD = {
    "playerId": "00-001", "position": "QB", "team": "ARI", "avatarSeed": "00-001",
}


def _load(name):
    return pd.read_csv(f"{FIXTURES}/{name}.csv")


EMPTY_EA = _load("ea_ratings").iloc[0:0]


def test_build_snapshot_fixtures():
    snap = build_snapshot(_load("rosters"), _load("weekly"), _load("teams"),
                          _load("schedules"), _load("weekly_prior"), _load("ea_ratings"),
                          prev_meta=None)
    assert set(snap) == {"builtAt", "players", "teams", "xfactorIds"}
    assert len(snap["teams"]) == 2 and snap["teams"][0]["abbr"] == "ARI"
    # every roster player + 2 DEF cards
    assert len(snap["players"]) == 11 + 2
    first = next(p for p in snap["players"] if p["playerId"] == "00-001")
    for k, v in EXPECTED_FIRST_CARD.items():
        assert first[k] == v
    # EA override: published overall 88 wins over the computed rating (the fixture's
    # 2-QB group takes the small-pool floor of 55), and tier is re-derived from it
    assert first["rating"] == 88 and first["tier"] == "elite"
    assert len(first["keyStats"]) == 3 and first["fantasyPpg"] >= 0
    ari_def = next(p for p in snap["players"] if p["playerId"] == "TEAM-ARI")
    assert ari_def["position"] == "DEF" and ari_def["fantasyPpg"] is None
    assert ari_def["keyStats"][0]["label"] == "SACKS"
    assert snap["teams"][0]["primary"].startswith("#")


def test_ea_override_differential():
    args = (_load("rosters"), _load("weekly"), _load("teams"),
            _load("schedules"), _load("weekly_prior"))
    base = {p["playerId"]: p for p in build_snapshot(*args, EMPTY_EA, prev_meta=None)["players"]}
    with_ea = {p["playerId"]: p for p in build_snapshot(*args, _load("ea_ratings"), prev_meta=None)["players"]}
    # matched player: overridden (small-pool floor says 55, published says 88)
    assert base["00-001"]["rating"] == 55
    assert with_ea["00-001"]["rating"] == 88
    # unmatched player: curve value survives untouched
    assert with_ea["00-003"]["rating"] == base["00-003"]["rating"]


def test_build_snapshot_xfactor_risers():
    base = build_snapshot(_load("rosters"), _load("weekly"), _load("teams"),
                          _load("schedules"), _load("weekly_prior"), _load("ea_ratings"),
                          prev_meta=None)
    prev = {"prevRatings": {p["playerId"]: 40 for p in base["players"]}}
    bumped = build_snapshot(_load("rosters"), _load("weekly"), _load("teams"),
                            _load("schedules"), _load("weekly_prior"), _load("ea_ratings"),
                            prev_meta=prev)
    assert len(bumped["xfactorIds"]) == 5
    tagged = [p for p in bumped["players"] if p["tier"] == "xfactor"]
    assert {p["playerId"] for p in tagged} == set(bumped["xfactorIds"])
