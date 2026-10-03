"""One-command refresh: uv run build.py [--source=fixtures]"""
import argparse
import json
import os
from datetime import date

import pandas as pd

from config import (DRAFT_MAX_ROUND, DRAFT_PICKS_PER_ROUND, EA_ENDPOINTS, HTTP_TIMEOUT_S,
                    ROSTER_STATUSES, SEASON, XFACTOR_COUNT)
from ratings import fantasy_ppg, rate_defenses, rate_players, tier_of

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))


def col(df: pd.DataFrame, *names: str) -> pd.Series | None:
    """nflverse column names drift by season; return first match or None."""
    for n in names:
        if n in df.columns:
            return df[n]
    return None


def _clean_str(v) -> str:
    """str(nan) == 'nan' (NaN is truthy); coalesce None/NaN to '' so no card
    ever ships a 'nan' team/position/name."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v)


EA_COLUMNS = ["full_name", "team", "position", "overall"]


def _normalize_ea_payload(data) -> pd.DataFrame:
    """EA drop-api payloads wrap the row list in {"items": [...]} and split
    names into firstName/lastName with overallRating; classic exporter rows
    (full_name/team/position/overall) pass through unchanged."""
    rows = data.get("items") if isinstance(data, dict) else data
    norm_rows = []
    for r in rows or []:
        first, last = _clean_str(r.get("firstName")), _clean_str(r.get("lastName"))
        full = r.get("full_name") or r.get("name") or " ".join(filter(None, (first, last)))
        norm_rows.append({"full_name": full,
                          "team": _clean_str(r.get("team_abbr") or r.get("team")),
                          "position": _clean_str(r.get("position")),
                          "overall": r.get("overall") or r.get("overallRating") or r.get("rating")})
    return pd.DataFrame(norm_rows, columns=EA_COLUMNS)


def _load_ea() -> pd.DataFrame:
    """Try each configured published-ratings endpoint; degrade to empty on any
    failure so the snapshot still builds with synthetic ratings."""
    import urllib.request

    for url in EA_ENDPOINTS:
        try:
            with urllib.request.urlopen(url, timeout=HTTP_TIMEOUT_S) as resp:
                df = _normalize_ea_payload(json.load(resp))
            if len(df) and df["overall"].notna().any():
                return df
        except Exception as e:  # noqa: BLE001 - any endpoint failure falls through
            print(f"ea endpoint failed ({url}): {e}")
    return pd.DataFrame(columns=EA_COLUMNS)


def _norm_name(name: str) -> str:
    drop = {"jr", "ii", "iii", "iv", "v"}
    toks = [t.strip(".").lower() for t in name.split()]
    return " ".join(t for t in toks if t and t not in drop)


def _ea_index(ea: pd.DataFrame) -> dict[tuple[str, str, str], int]:
    """{(normalized name, team, position): overall} from an EA-shaped frame."""
    idx: dict[tuple[str, str, str], int] = {}
    for _, r in ea.iterrows():
        try:
            key = (_norm_name(_clean_str(r.get("full_name") or r.get("name"))),
                   _clean_str(r.get("team_abbr") or r.get("team")),
                   _clean_str(r.get("position")))
            idx[key] = int(r.get("overall") or r.get("rating"))
        except (TypeError, ValueError):
            continue
    return idx


WEEKLY_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
              "stats_player/stats_player_week_{season}.parquet")


def _load_weekly(season: int) -> pd.DataFrame:
    """nfl-data-py 0.3.3's import_weekly_data still points at the pre-2025
    per-season asset names (404 for 2025+); fall back to the current release."""
    import nfl_data_py as nfl
    try:
        return nfl.import_weekly_data(years=[season])
    except Exception:
        return pd.read_parquet(WEEKLY_URL.format(season=season))


def _draft_round(pick) -> int | None:
    """Seasonal rosters exposes overall pick, not round; approximate rounds as
    DRAFT_PICKS_PER_ROUND-pick blocks (comp picks blur round boundaries — close
    enough for DRAFT_PRIOR). Unknown/undrafted pick (NaN) -> None."""
    if pick is None or (isinstance(pick, float) and pd.isna(pick)):
        return None
    return min((int(pick) - 1) // DRAFT_PICKS_PER_ROUND + 1, DRAFT_MAX_ROUND)


def _normalize_rosters(r: pd.DataFrame) -> pd.DataFrame:
    """2025+ seasonal-rosters schema -> the classic roster columns
    build_snapshot expects, filtered to the spec §4 card pool: status
    ACT or RES only (CUT/DEV/RET/INA/EXE/NAV/NFI/PS are all excluded)."""
    r = r[r["status"].isin(ROSTER_STATUSES)].reset_index(drop=True)
    fallback = (r["first_name"].fillna("") + " " + r["last_name"].fillna("")).str.strip()
    # object dtype so pandas' type inference doesn't coerce None back to NaN
    draft_rounds = pd.Series([_draft_round(p) for p in r["draft_number"]],
                             index=r.index, dtype="object")
    return pd.DataFrame({
        "gsis_id": r["player_id"],
        "full_name": r["player_name"].fillna(fallback),
        "position": r["position"],
        "team_abbr": r["team"],
        "jersey_number": r["jersey_number"],
        "age": r["age"],
        "draft_round": draft_rounds,
    })


def _load_rosters() -> pd.DataFrame:
    """nfl-data-py 0.3.3 removed import_rosters/import_teams; import the
    seasonal rosters release and normalize its renamed columns."""
    import nfl_data_py as nfl
    return _normalize_rosters(nfl.import_seasonal_rosters(years=[SEASON]))


def _load(source: str):
    if source == "fixtures":
        return (pd.read_csv(f"{FIXTURES}/rosters.csv"), pd.read_csv(f"{FIXTURES}/weekly.csv"),
                pd.read_csv(f"{FIXTURES}/teams.csv"), pd.read_csv(f"{FIXTURES}/schedules.csv"),
                pd.read_csv(f"{FIXTURES}/weekly_prior.csv"), pd.read_csv(f"{FIXTURES}/ea_ratings.csv"))
    import nfl_data_py as nfl
    rosters = _load_rosters()
    weekly = _load_weekly(SEASON)
    schedules = nfl.import_schedules(years=[SEASON])
    teams = nfl.import_team_desc()  # 36 franchises incl. defunct (OAK/SD/STL/...)
    teams = teams[teams["team_abbr"].isin(set(schedules["home_team"]) | set(schedules["away_team"]))].reset_index(drop=True)
    prior_weekly = _load_weekly(SEASON - 1)
    ea = _load_ea()
    return rosters, weekly, teams, schedules, prior_weekly, ea


STAT_COLS = {"pass_yds": ("passing_yards", "pass_yds"), "pass_td": ("passing_tds", "pass_td"),
             "int": ("interceptions", "int", "passing_interceptions"),
             "rush_yds": ("rushing_yards", "rush_yds"),
             "rush_td": ("rushing_tds", "rush_td"), "rec": ("receptions", "rec"),
             "rec_yds": ("receiving_yards", "rec_yds"), "rec_td": ("receiving_tds", "rec_td")}


def _agg(weekly: pd.DataFrame) -> dict[str, dict]:
    """Aggregate a weekly-stats frame to {player_id: raw season stat dict}."""
    agg: dict[str, dict] = {}
    for _, w in weekly.iterrows():
        pid = w.get("player_id") or w.get("gsis_id")
        if pid is None or pd.isna(pid):
            continue
        a = agg.setdefault(str(pid), {"games": 0, **{k: 0 for k in STAT_COLS}})
        a["games"] += 1
        for k, names in STAT_COLS.items():
            v = col(weekly, *names)
            if v is not None and not pd.isna(w[v.name]):
                a[k] += float(w[v.name])
    return agg


def _ppg_map(weekly: pd.DataFrame) -> dict[str, float]:
    """{player_id: fantasy PPG} (players with no rows are absent, not 0)."""
    return {pid: fantasy_ppg(a) for pid, a in _agg(weekly).items()}


def _dedup_city(city: str, nick: str) -> str:
    """team_desc ships the full 'Arizona Cardinals' as team_name; strip a
    trailing nick so DEF fullName doesn't read 'Cardinals Cardinals Defense'.
    A city already equal to the nick (or missing either part) is untouched."""
    if nick and city.endswith(nick) and len(city) > len(nick):
        return city[: -len(nick)].strip()
    return city


def build_snapshot(rosters: pd.DataFrame, weekly: pd.DataFrame, teams: pd.DataFrame,
                   schedules: pd.DataFrame, prior_weekly: pd.DataFrame,
                   ea: pd.DataFrame, prev_meta: dict | None) -> dict:
    cur_ppg = _ppg_map(weekly)
    prior_ppg_map = _ppg_map(prior_weekly)
    raw_stats = _agg(weekly)  # for keyStats shaping
    # --- rosters -> player dicts ---
    players = []
    for _, r in rosters.iterrows():
        pid = str(r.get("gsis_id") or r.get("player_id"))
        if not pid or pid == "nan":
            continue
        pos = str(r.get("position") or "")
        if pos in ("LS",):  # no meaningful stats; keep card pool clean
            continue
        stats = raw_stats.get(pid)
        ppg = cur_ppg.get(pid, 0.0)
        full = str(r.get("full_name") or r.get("name") or r.get("player_name") or "?")
        parts = full.split()
        short = (parts[0][0] + ". " + parts[-1]) if len(parts) > 1 else full
        age = r.get("age")
        players.append({
            "playerId": pid, "name": short, "fullName": full, "position": pos,
            # NaN team_abbr is truthy and would str() to "nan"; _clean_str -> "" -> "FA"
            "team": _clean_str(r.get("team_abbr") or r.get("abbr") or r.get("team")) or "FA",
            "jersey": int(r["jersey_number"]) if not pd.isna(r.get("jersey_number", float("nan"))) else None,
            # NaN age is truthy, so `or 25` alone would crash int(); guard like jersey.
            "age": int(age) if age is not None and not pd.isna(age) and age != 0 else 25,
            "cur_ppg": ppg, "prior_ppg": prior_ppg_map.get(pid),
            "draft_round": int(r["draft_round"]) if not pd.isna(r.get("draft_round", float("nan"))) else None,
            "key_stats_src": stats or {},
        })

    # --- keyStats display shaping (3 entries per position) ---
    KEY = {"QB": [("pass_yds", "PASS YDS"), ("pass_td", "PASS TD"), ("int", "INT")],
           "RB": [("rush_yds", "RUSH YDS"), ("rush_td", "RUSH TD"), ("rec", "REC")],
           "WR": [("rec", "REC"), ("rec_yds", "REC YDS"), ("rec_td", "REC TD")],
           "TE": [("rec", "REC"), ("rec_yds", "REC YDS"), ("rec_td", "REC TD")],
           "K": [], "P": []}
    DEFAULT_KEY = [("games", "G"), ("rush_yds", "YDS"), ("rec", "REC")]

    def shape_keys(p: dict) -> list[dict]:
        src = p.pop("key_stats_src")
        pairs = KEY.get(p["position"], DEFAULT_KEY) or DEFAULT_KEY
        return [{"label": lbl, "value": f"{src.get(k, 0):,.0f}" if k != "int" else f"{src.get(k, 0):.0f}"}
                for k, lbl in pairs]

    rated = rate_players(players)

    # --- published-overall override (spec §5 primary path) ---
    ea_idx = _ea_index(ea)
    for p in rated:
        hit = ea_idx.get((_norm_name(p["fullName"]), p["team"], p["position"]))
        if hit is not None:
            p["rating"] = hit
            p["tier"] = tier_of(hit)

    for p in rated:
        p["keyStats"] = shape_keys(p)
        p["fantasyPpg"] = round(p.pop("cur_ppg"), 1)
        p["avatarSeed"] = p["playerId"]
        for k in ("prior_ppg", "draft_round"):
            p.pop(k)

    # --- team DEF cards from weekly defensive players + schedules points ---
    def_stats: dict[str, dict] = {}
    pos_col, team_col = col(weekly, "position"), col(weekly, "recent_team", "team")
    # 2025+ weekly schema renamed defensive stats (def_sacks / def_interceptions /
    # fumble_recovery_opp); classic names kept as fallbacks for older fixtures.
    sack_col, int_col = col(weekly, "def_sacks", "sacks"), col(weekly, "def_interceptions", "interceptions")
    fum_col = col(weekly, "fumble_recovery_opp", "fumbles_recovered", "recovered_fumbles")
    DEF_POS = ("DL", "DE", "DT", "LB", "OLB", "ILB", "CB", "S", "DB", "SAF")
    for _, w in weekly.iterrows():
        pos = str(w[pos_col.name]) if pos_col is not None else ""
        if pos not in DEF_POS:
            continue
        t = str(w[team_col.name]) if team_col is not None else "FA"
        d = def_stats.setdefault(t, {"sacks": 0.0, "takeaways": 0.0})
        if sack_col is not None and not pd.isna(w[sack_col.name]):
            d["sacks"] += float(w[sack_col.name])
        if int_col is not None and not pd.isna(w[int_col.name]):
            d["takeaways"] += float(w[int_col.name])
        if fum_col is not None and not pd.isna(w[fum_col.name]):
            d["takeaways"] += float(w[fum_col.name])
    pa: dict[str, list[float]] = {}
    for _, g in schedules.iterrows():
        if g.get("game_type") == "POST":
            continue
        home, away = g.get("home_team"), g.get("away_team")
        hs, as_ = g.get("home_score"), g.get("away_score")
        if pd.isna(hs) or pd.isna(as_):
            continue
        pa.setdefault(str(home), []).append(float(as_))   # points allowed at home = away score
        pa.setdefault(str(away), []).append(float(hs))
    team_abbrs = [str(t) for t in teams[col(teams, "team_abbr", "abbr").name]]
    defs = [{"team": t,
             "sacks": def_stats.get(t, {}).get("sacks", 0.0),
             "takeaways": def_stats.get(t, {}).get("takeaways", 0.0),
             "points_allowed_per_game": (sum(pa[t]) / len(pa[t])) if pa.get(t) else 30.0}
            for t in team_abbrs]
    rated_defs = rate_defenses(defs)

    teams_out = []
    name_col = col(teams, "team_name", "name"); nick_col = col(teams, "team_nick", "nick")
    prim_col = col(teams, "team_color", "primary"); sec_col = col(teams, "team_color2", "secondary")
    for i, t in enumerate(team_abbrs):
        nick = _clean_str(nick_col.iat[i] if nick_col is not None else t)
        city = _dedup_city(_clean_str(name_col.iat[i] if name_col is not None else t), nick)
        teams_out.append({"abbr": t, "name": nick,
                          "city": city,
                          "primary": "#" + str(prim_col.iat[i]).lstrip("#") if prim_col is not None else "#1f2937",
                          "secondary": "#" + str(sec_col.iat[i]).lstrip("#") if sec_col is not None else "#9ca3af"})
        d = rated_defs[i]
        players.append({"playerId": f"TEAM-{t}", "name": f"{teams_out[-1]['name']} DEF",
                        "fullName": f"{teams_out[-1]['city']} {teams_out[-1]['name']} Defense",
                        "position": "DEF", "team": t, "jersey": None, "age": 0,
                        "rating": d["rating"], "tier": d["tier"],
                        "keyStats": [{"label": "SACKS", "value": f"{d['sacks']:.0f}"},
                                     {"label": "TAKEAWAYS", "value": f"{d['takeaways']:.0f}"},
                                     {"label": "PA/G", "value": f"{d['points_allowed_per_game']:.1f}"}],
                        "fantasyPpg": None, "avatarSeed": f"TEAM-{t}"})

    # --- X-Factor: top risers vs prevRatings in meta ---
    # A riser must actually improve (delta > 0): a no-change rebuild keeps
    # xfactorIds empty instead of tagging alphabetical-id filler. First launch
    # (no prior meta) ships [] by design — risers appear from the second
    # weekly refresh onward.
    prev = (prev_meta or {}).get("prevRatings") or {}
    risers = sorted(
        ({"id": p["playerId"], "delta": p["rating"] - int(prev[p["playerId"]])}
         for p in players if prev.get(p["playerId"]) is not None
         and p["rating"] - int(prev[p["playerId"]]) > 0),
        key=lambda x: (-x["delta"], x["id"]))[:XFACTOR_COUNT]
    xfactor_ids = [r["id"] for r in risers]
    for p in players:
        if p["playerId"] in xfactor_ids:
            p["tier"] = "xfactor"

    return {"builtAt": date.today().isoformat(),
            "players": players, "teams": teams_out, "xfactorIds": xfactor_ids}


def _tier_distribution(players: list[dict]) -> dict[str, tuple[int, float]]:
    """Realized tier counts + percentage shares of the card pool (xfactor
    replaces the underlying tier in the snapshot, so it counts as its own)."""
    counts: dict[str, int] = {}
    for p in players:
        counts[p["tier"]] = counts.get(p["tier"], 0) + 1
    n = len(players) or 1
    return {t: (c, 100.0 * c / n) for t, c in counts.items()}


TIER_PRINT_ORDER = ("legend", "elite", "rare", "common", "xfactor")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["live", "fixtures"], default="live")
    args = ap.parse_args()
    rosters, weekly, teams, schedules, prior_weekly, ea = _load(args.source)
    meta_path = os.path.join(DATA_DIR, "meta.json")
    prev_meta = None
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            prev_meta = json.load(f)
    # brief's listing omitted prior_weekly/ea here; build_snapshot takes all six frames.
    snap = build_snapshot(rosters, weekly, teams, schedules, prior_weekly, ea, prev_meta)

    os.makedirs(DATA_DIR, exist_ok=True)
    meta = {"builtAt": snap["builtAt"], "playerCount": len(snap["players"]),
            "sourceVersions": {"rosters": len(rosters), "weekly": len(weekly), "ea": len(ea)},
            "prevRatings": {p["playerId"]: p["rating"] for p in snap["players"]}}
    # atomic: never clobber a good snapshot on failure
    for name, payload in (("snapshot.json.tmp", snap), ("meta.json.tmp", meta)):
        with open(os.path.join(DATA_DIR, name), "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(",", ":"))
    os.replace(os.path.join(DATA_DIR, "snapshot.json.tmp"), os.path.join(DATA_DIR, "snapshot.json"))
    os.replace(os.path.join(DATA_DIR, "meta.json.tmp"), os.path.join(DATA_DIR, "meta.json"))
    print(f"snapshot: {len(snap['players'])} players, {len(snap['teams'])} teams, "
          f"xfactor={snap['xfactorIds']}")
    # realized tier distribution — printed on every run (live or fixtures) so
    # pool drift is visible against the ~80/9/5/5 curve-derived target shares
    dist = _tier_distribution(snap["players"])
    order = TIER_PRINT_ORDER + tuple(sorted(t for t in dist if t not in TIER_PRINT_ORDER))
    print("tier distribution: " + ", ".join(
        f"{t} {dist[t][0]} ({dist[t][1]:.1f}%)" for t in order if t in dist))


if __name__ == "__main__":
    main()
