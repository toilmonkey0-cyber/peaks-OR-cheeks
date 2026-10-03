"""One-command refresh: uv run build.py [--source=fixtures]"""
import argparse
import json
import os
import sys
from datetime import date

import pandas as pd

from config import SEASON, XFACTOR_COUNT, EA_ENDPOINTS
from ratings import fantasy_ppg, rate_defenses, rate_players, tier_of

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))


def col(df: pd.DataFrame, *names: str) -> pd.Series | None:
    """nflverse column names drift by season; return first match or None."""
    for n in names:
        if n in df.columns:
            return df[n]
    return None


EA_COLUMNS = ["full_name", "team", "position", "overall"]


def _load_ea() -> pd.DataFrame:
    """Try each configured published-ratings endpoint; degrade to empty on any
    failure so the snapshot still builds with synthetic ratings."""
    import json as _json
    import urllib.request

    for url in EA_ENDPOINTS:
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                rows = _json.load(resp)
            if isinstance(rows, dict):  # drop-api wraps lists: {"items": [...]}
                rows = rows.get("items") or []
            norm_rows = []
            for r in rows:
                first, last = str(r.get("firstName") or "").strip(), str(r.get("lastName") or "").strip()
                full = r.get("full_name") or r.get("name") or " ".join(filter(None, (first, last)))
                overall = r.get("overall") or r.get("overallRating") or r.get("rating")
                norm_rows.append({"full_name": full, "team": r.get("team_abbr") or r.get("team") or "",
                                  "position": r.get("position") or "", "overall": overall})
            df = pd.DataFrame(norm_rows, columns=EA_COLUMNS)
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
            key = (_norm_name(str(r.get("full_name") or r.get("name") or "")),
                   str(r.get("team_abbr") or r.get("team") or ""), str(r.get("position") or ""))
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


def _load_rosters() -> pd.DataFrame:
    """nfl-data-py 0.3.3 removed import_rosters/import_teams; the seasonal
    rosters release also renamed columns, so normalize to the classic names
    build_snapshot expects."""
    import nfl_data_py as nfl
    r = nfl.import_seasonal_rosters(years=[SEASON])
    fallback = (r["first_name"].fillna("") + " " + r["last_name"].fillna("")).str.strip()
    return pd.DataFrame({
        "gsis_id": r["player_id"],
        "full_name": r["player_name"].fillna(fallback),
        "position": r["position"],
        "team_abbr": r["team"],
        "jersey_number": r["jersey_number"],
        "age": r["age"],
        # seasonal rosters exposes overall pick, not round; approximate rounds
        # as 32-pick blocks (comp picks blur edges - close enough for DRAFT_PRIOR)
        "draft_round": ((r["draft_number"] - 1) // 32 + 1).clip(upper=7),
    })


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
            "team": str(r.get("team_abbr") or r.get("abbr") or r.get("team") or "FA"),
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
        nick = str(nick_col.iat[i] if nick_col is not None else t)
        city = str(name_col.iat[i] if name_col is not None else t)
        if nick and city.endswith(nick):  # team_desc ships "Arizona Cardinals" as name
            city = city[:-len(nick)].strip()
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
    prev = (prev_meta or {}).get("prevRatings") or {}
    risers = sorted(
        ({"id": p["playerId"], "delta": p["rating"] - int(prev.get(p["playerId"], p["rating"]))}
         for p in players if prev.get(p["playerId"]) is not None),
        key=lambda x: (-x["delta"], x["id"]))[:XFACTOR_COUNT]
    xfactor_ids = [r["id"] for r in risers]
    for p in players:
        if p["playerId"] in xfactor_ids:
            p["tier"] = "xfactor"

    return {"builtAt": date.today().isoformat(),
            "players": players, "teams": teams_out, "xfactorIds": xfactor_ids}


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


if __name__ == "__main__":
    main()
