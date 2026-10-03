"""Unit tests for build.py's pure loader/shaping helpers — inline pandas frames
only, no network, no fixture-file I/O. Covers the live-loader deviations
documented in the Task 4 report: the 2025+ seasonal-rosters column renames +
ACT/RES pool filter, draft-pick -> round math, the team_desc city/nick dedup,
and the EA drop-api payload normalizer."""
import pandas as pd
import pytest

from build import (_dedup_city, _draft_round, _ea_index, _normalize_ea_payload,
                   _normalize_rosters, _tier_distribution)


def _raw_rosters() -> pd.DataFrame:
    """seasonal-rosters-shaped inline frame with every edge in 6 rows."""
    return pd.DataFrame({
        "player_id": ["00-001", "00-002", "00-003", "00-004", "00-005", "00-006"],
        "player_name": ["Alpha One", None, "Charlie Three", "Delta Four",
                        "Echo Five", "Foxtrot Six"],
        "first_name": ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"],
        "last_name": ["One", "Two", "Three", "Four", "Five", "Six"],
        "position": ["QB", "RB", "WR", "TE", "K", "QB"],
        "team": ["ARI", "BUF", None, "CHI", "ARI", "ARI"],
        "jersey_number": [1, 28, 11, 85, 3, 7],
        "age": [26, 24, None, 27, 31, 25],
        "draft_number": [1.0, 33.0, None, 262.0, 96.0, 1.0],
        "status": ["ACT", "RES", "ACT", "ACT", "CUT", "DEV"],
    })


def test_normalize_rosters_filters_to_act_res():
    out = _normalize_rosters(_raw_rosters())
    # spec §4 pool: ACT + RES survive; CUT/DEV (and RET/INA/EXE/...) are out
    assert out["gsis_id"].tolist() == ["00-001", "00-002", "00-003", "00-004"]


def test_normalize_rosters_column_renames():
    out = _normalize_rosters(_raw_rosters())
    assert set(out.columns) == {"gsis_id", "full_name", "position", "team_abbr",
                                "jersey_number", "age", "draft_round"}
    row = out[out["gsis_id"] == "00-002"].iloc[0]
    assert row["full_name"] == "Bravo Two"  # missing player_name -> first/last fallback
    assert row["team_abbr"] == "BUF"
    # missing team stays NaN at the loader boundary; the "FA" fallback lives
    # in build_snapshot's roster loop (_clean_str guard)
    assert pd.isna(out[out["gsis_id"] == "00-003"].iloc[0]["team_abbr"])


def test_draft_round_math():
    # (pick - 1) // 32 + 1, clipped at round 7; NaN/None -> None
    assert _draft_round(1) == 1
    assert _draft_round(32) == 1
    assert _draft_round(33) == 2
    assert _draft_round(96) == 3
    assert _draft_round(224) == 7
    assert _draft_round(262) == 7  # round 9 unclipped -> 7
    assert _draft_round(None) is None
    assert _draft_round(float("nan")) is None
    rounds = dict(zip(_normalize_rosters(_raw_rosters())["gsis_id"],
                      _normalize_rosters(_raw_rosters())["draft_round"]))
    assert rounds == {"00-001": 1, "00-002": 2, "00-003": None, "00-004": 7}


def test_dedup_city_strips_trailing_nick():
    assert _dedup_city("Arizona Cardinals", "Cardinals") == "Arizona"
    assert _dedup_city("Washington Commanders", "Commanders") == "Washington"
    assert _dedup_city("Los Angeles Rams", "Rams") == "Los Angeles"
    # fixture-style already-clean city is untouched
    assert _dedup_city("Arizona", "Cardinals") == "Arizona"
    # degenerate: city == nick must not yield an empty city
    assert _dedup_city("Cardinals", "Cardinals") == "Cardinals"
    assert _dedup_city("", "") == ""


def _drop_api_payload() -> dict:
    return {"items": [
        {"firstName": "Patrick", "lastName": "Mahomes II", "overallRating": 99,
         "team": None, "position": None},
        {"firstName": "Travis", "lastName": "Kelce", "overallRating": 96,
         "team": "KC", "position": "TE"},
    ]}


def test_normalize_ea_payload_drop_api_shape():
    df = _normalize_ea_payload(_drop_api_payload())
    assert list(df.columns) == ["full_name", "team", "position", "overall"]
    assert df["full_name"].tolist() == ["Patrick Mahomes II", "Travis Kelce"]
    assert df["overall"].tolist() == [99, 96]
    assert df["team"].tolist() == ["", "KC"]  # null team -> "", never "nan"
    assert df["position"].tolist() == ["", "TE"]


def test_normalize_ea_payload_classic_list_passthrough():
    df = _normalize_ea_payload([{"full_name": "Alpha One", "team": "ARI",
                                 "position": "QB", "overall": 88}])
    assert df["full_name"].tolist() == ["Alpha One"]
    assert df["overall"].tolist() == [88] and df["team"].tolist() == ["ARI"]


def test_ea_index_from_drop_api_payload():
    idx = _ea_index(_normalize_ea_payload(_drop_api_payload()))
    assert idx[("patrick mahomes", "", "")] == 99  # "II" suffix dropped by _norm_name
    assert idx[("travis kelce", "KC", "TE")] == 96


def test_ea_index_nan_fields_never_become_nan_strings():
    df = pd.DataFrame([{"full_name": "Null Teamer", "team": float("nan"),
                        "position": "QB", "overall": 75}])
    assert list(_ea_index(df)) == [("null teamer", "", "QB")]


def test_tier_distribution_counts_and_shares():
    players = [{"tier": t} for t in
               ["common", "common", "common", "elite", "legend", "xfactor"]]
    dist = _tier_distribution(players)
    assert dist["common"] == (3, 50.0)
    for t in ("elite", "legend", "xfactor"):
        assert dist[t][0] == 1
        assert dist[t][1] == pytest.approx(100.0 / 6)
