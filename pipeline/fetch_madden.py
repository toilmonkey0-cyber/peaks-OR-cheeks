"""Fetch published player ratings from EA → data/madden{,27}.json.

  uv run fetch_madden.py --game 26   # M26 final roster (immutable, one-shot)
  uv run fetch_madden.py --game 27   # M27 latest week (re-run weekly)

Two very different EA surfaces, one card assembly:

- Game 26: drop-api REST (namespace serves the PREVIOUS game's completed
  season). List items carry no team/position → per-position + per-team-numeric
  sweeps joined by EA id; team numeric ids → abbr via MADDEN_TEAMS.
- Game 27: the current game lives on the ratings site's Next.js data route
  (drop-api returns 0 items for its week ids from any client, browser included).
  GET the ratings page for the buildId, then /_next/data/<id>/.../ratings.json
  ?page=N[&iteration=madden-ratings-week-M] — items include team/position.
"""
import argparse
import json
import os
import re
import time
import urllib.request
from collections import Counter, defaultdict

import pandas as pd

from config import (HTTP_TIMEOUT_S, MADDEN_ITERATION, MADDEN_NAMESPACE,
                    MADDEN_POSITION_CANDIDATES, MADDEN_TEAMS, TIER_THRESHOLDS)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
# universal athletic core — every player has these; powers HIGHER/LOWER
CORE_STATS = {"SPD", "ACC", "AGI", "STR", "JMP", "AWR"}
SNAPSHOT_PATH = os.path.join(DATA_DIR, "snapshot.json")
PAGE = 100
SLEEP_S = 0.4
RATINGS_PAGE = "https://www.ea.com/en/games/madden-nfl/ratings"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"

# Boring/meta attributes never shown on cards.
SKIP_STATS = {"stamina", "injury", "toughness", "overall", "runningStyle",
              "height", "weight", "yearsPro"}
# camelCase → Madden shorthand. Unmapped keys are still eligible via prettifier.
STAT_LABELS = {
    "speed": "SPD", "acceleration": "ACC", "agility": "AGI", "strength": "STR",
    "awareness": "AWR", "jumping": "JMP", "bCVision": "BCV", "carrying": "CAR",
    "breakTackle": "BTK", "trucking": "TRK", "elusiveness": "ELU", "spinMove": "SPM",
    "jukeMove": "JKM", "stiffArm": "SFA", "catching": "CAT", "catchInTraffic": "CIT",
    "spectacularCatch": "SPC", "shortRouteRunning": "SRR", "mediumRouteRunning": "MRR",
    "deepRouteRunning": "DRR", "release": "REL", "throwPower": "THP",
    "throwAccuracyShort": "TAS", "throwAccuracyMid": "TAM", "throwAccuracyDeep": "TAD",
    "throwOnTheRun": "TOR", "playAction": "PAC", "breakSack": "BRK",
    "tackle": "TAK", "hitPower": "POW", "powerMoves": "PMV", "finesseMoves": "FMV",
    "blockShedding": "BSH", "pursuit": "PUR", "manCoverage": "MAN", "zoneCoverage": "ZCV",
    "press": "PRS", "playRecognition": "PRA", "interceptions": "INT",
    "kickPower": "KPW", "kickAccuracy": "KAC", "runBlock": "RBK", "passBlock": "PBK",
    "impactBlocking": "IBL", "leadBlock": "LDB", "kickReturn": "KRT", "puntReturn": "PRT",
    "runBlockPower": "RBP", "runBlockFinesse": "RBF", "passBlockPower": "PBP",
    "passBlockFinesse": "PBF", "slidingScramble": "SLD", "qbStyle": "STY",
    "changeOfDirection": "COD", "throwUnderPressure": "TUP",
}


def get(url: str, headers: dict | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
        return resp.read()


def get_json(url: str):
    return json.loads(get(url))


# ── game 26: drop-api sweeps ────────────────────────────────────────────────

def fetch_dropapi_all(params: str) -> list[dict]:
    """Paginate a filtered drop-api query until totalItems is covered."""
    items, offset = [], 0
    while True:
        data = get_json(f"https://drop-api.ea.com/rating/{MADDEN_NAMESPACE}"
                        f"?limit={PAGE}&offset={offset}&iteration={MADDEN_ITERATION}&{params}")
        batch = data.get("items") or []
        items.extend(batch)
        total = data.get("totalItems") or 0
        offset += len(batch)
        if not batch or offset >= total:
            return items
        time.sleep(SLEEP_S)


def collect_game26() -> tuple[dict[int, dict], str]:
    """Position sweep (position attribution) + team sweep (team attribution)."""
    by_id: dict[int, dict] = {}
    for pos in MADDEN_POSITION_CANDIDATES:
        items = fetch_dropapi_all(f"position={pos}")
        if not items:
            continue
        print(f"position {pos:<5} {len(items):>4} players")
        for it in items:
            it["__position"] = pos
            if it["id"] not in by_id:  # specific filters first; DB/OLB-style generics never overwrite
                by_id[it["id"]] = it
        time.sleep(SLEEP_S)
    print(f"position sweep total: {len(by_id)} unique players")
    expected = get_json(f"https://drop-api.ea.com/rating/{MADDEN_NAMESPACE}"
                        f"?limit=1&iteration={MADDEN_ITERATION}").get("totalItems")
    if expected and expected != len(by_id):
        print(f"WARNING: unfiltered totalItems={expected} != swept {len(by_id)} (missing positions or API drift)")

    id_to_team_id: dict[int, int] = {}
    for tid in sorted(set(MADDEN_TEAMS) | set(range(1, 33))):
        for it in fetch_dropapi_all(f"team={tid}"):
            id_to_team_id[it["id"]] = tid
        time.sleep(SLEEP_S)
    team_map = derive_team_map(id_to_team_id, by_id) or MADDEN_TEAMS
    for ea_id, it in by_id.items():
        it["__team_abbr"] = team_map.get(id_to_team_id.get(ea_id), "FA")
    return by_id, MADDEN_ITERATION


def derive_team_map(id_to_team_id: dict[int, int], by_id: dict[int, dict]) -> dict[int, str]:
    """Majority name+position match vs current snapshot → numeric id → abbr."""
    cur = pd.DataFrame(json.load(open(SNAPSHOT_PATH, encoding="utf-8"))["players"])
    cur["key"] = (cur["fullName"].str.lower().str.replace(r"[^a-z ]", "", regex=True).str.strip()
                  + "|" + cur["position"].str.lower())
    known = dict(zip(cur["key"], cur["team"]))

    votes_by_tid: dict[int, Counter] = defaultdict(Counter)
    for ea_id, tid in id_to_team_id.items():
        it = by_id.get(ea_id)
        if not it:
            continue
        full = f"{it['firstName']} {it['lastName']}".lower()
        key = "".join(c for c in full if c.isalpha() or c == " ").strip() + "|" + (it.get("__position") or "").lower()
        if key in known:
            votes_by_tid[tid][known[key]] += 1

    mapping = {}
    for tid in sorted(votes_by_tid):
        votes = votes_by_tid[tid]
        abbr, n = votes.most_common(1)[0]
        mapping[tid] = abbr
        print(f"  team {tid:>2} → {abbr} ({n}/{sum(votes.values())} name votes)")
    return mapping


# ── game 27: Next.js data route ─────────────────────────────────────────────

def discover_build_id() -> str:
    html = get(RATINGS_PAGE, headers={"Accept": "text/html"}).decode("utf-8", "replace")
    m = re.search(r'"buildId":"([A-Za-z0-9_-]+)"', html) or re.search(r"/_next/data/([A-Za-z0-9_-]+)/", html)
    if not m:
        raise RuntimeError("could not discover ea.com buildId from ratings page")
    bid = m.group(1)
    print(f"buildId: {bid}")
    return bid


def week_label(items: list[dict]) -> str:
    for it in items:
        it_iter = it.get("iteration") or {}
        if isinstance(it_iter, dict) and it_iter.get("id"):
            return str(it_iter["id"])
    return "latest"


def collect_game27() -> tuple[dict[int, dict], str]:
    """Page through the ratings _next/data route; items carry team + position."""
    bid = discover_build_id()
    base = f"https://www.ea.com/_next/data/{bid}/en/games/madden-nfl/ratings.json?franchiseSlug=madden-nfl"
    first = get_json(base)["pageProps"]["ratingDetails"]
    total = first.get("totalItems") or 0
    items: list[dict] = list(first.get("items") or [])
    print(f"game 27 page 1: {len(items)}/{total}")
    page = 2
    while len(items) < total:
        batch = get_json(f"{base}&page={page}")["pageProps"]["ratingDetails"]
        got = batch.get("items") or []
        if not got:
            break
        items.extend(got)
        print(f"game 27 page {page}: +{len(got)} ({len(items)}/{total})")
        page += 1
        time.sleep(SLEEP_S)

    unmapped = Counter()
    by_id: dict[int, dict] = {}
    for it in items:
        pos = (it.get("position") or {}).get("id")
        team_id = (it.get("team") or {}).get("id")
        if not pos:
            continue
        it["__position"] = pos
        it["__team_abbr"] = MADDEN_TEAMS.get(team_id, "FA")
        if team_id not in MADDEN_TEAMS:
            unmapped[team_id] += 1
        by_id[it["id"]] = it
    if unmapped:
        print(f"WARNING: unmapped team ids {dict(unmapped)} → FA")
    return by_id, week_label(items)


# ── shared assembly ─────────────────────────────────────────────────────────

def prettify(key: str) -> str:
    if key in STAT_LABELS:
        return STAT_LABELS[key]
    humps = [h for h in key.replace("_", " ").split() if h]
    initials = "".join(h[0] for h in humps).upper()
    return (initials or key[:3].upper())[:4]


def top_attributes(stats: dict, n: int = 6) -> list[dict]:
    usable = [(k, v["value"]) for k, v in (stats or {}).items()
              if isinstance(v, dict) and isinstance(v.get("value"), (int, float))
              and k not in SKIP_STATS]
    usable.sort(key=lambda kv: -kv[1])
    return [{"label": prettify(k), "value": v} for k, v in usable[:n]]


def tier_of(rating: int) -> str:
    if rating >= TIER_THRESHOLDS["legend"]:
        return "legend"
    if rating >= TIER_THRESHOLDS["elite"]:
        return "elite"
    if rating >= TIER_THRESHOLDS["rare"]:
        return "rare"
    return "common"


def assemble(by_id: dict[int, dict], source_iteration: str, out_path: str) -> None:
    teams_src = json.load(open(SNAPSHOT_PATH, encoding="utf-8"))["teams"]
    fa_team = {"abbr": "FA", "name": "Free Agent", "city": "Free Agent",
               "primary": "#4b5563", "secondary": "#111827"}

    players, xfactor_ids = [], []
    for ea_id, it in sorted(by_id.items()):
        abilities = it.get("playerAbilities") or []
        xf = [a["label"] for a in abilities if (a.get("type") or {}).get("id") == "xFactor"]
        labels = xf + [a["label"] for a in abilities if (a.get("type") or {}).get("id") != "xFactor"]
        first, last = it.get("firstName") or "", it.get("lastName") or ""
        rating = int(it.get("overallRating") or 0)
        core = {}
        for key, label in STAT_LABELS.items():
            if label in CORE_STATS:
                v = (it.get("stats") or {}).get(key)
                if isinstance(v, dict) and isinstance(v.get("value"), (int, float)):
                    core[label] = int(v["value"])
        card = {
            "playerId": f"ea-{ea_id}",
            "name": f"{first[:1]}. {last}" if last else first,
            "fullName": f"{first} {last}".strip(),
            "position": it.get("__position") or "",
            "team": it.get("__team_abbr") or "FA",
            "jersey": it.get("jerseyNum"),
            "age": int(it.get("age") or 0),
            "heightIn": it.get("height"),
            "weightLb": it.get("weight"),
            "college": it.get("college") or "",
            "yearsPro": it.get("yearsPro"),
            "rating": rating,
            "tier": tier_of(rating),
            "attributes": top_attributes(it.get("stats") or {}),
            "coreStats": core,
            "xfactor": bool(xf),
            "abilities": labels[:2],
            "avatarSeed": f"ea-{ea_id}",
        }
        players.append(card)
        if xf:
            xfactor_ids.append(card["playerId"])

    snapshot = {"builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "sourceIteration": source_iteration,
                "players": players,
                "teams": teams_src + [fa_team],
                "xfactorIds": xfactor_ids}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, separators=(",", ":"))

    dist = Counter(p["tier"] for p in players)
    pos_dist = Counter(p["position"] for p in players)
    print(f"\nwrote {out_path}: {len(players)} players, iteration={source_iteration}, "
          f"tiers={dict(dist)}, xfactor={len(xfactor_ids)}")
    print(f"positions: {dict(pos_dist)}")
    print(f"rating range: {min(p['rating'] for p in players)}–{max(p['rating'] for p in players)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", type=int, choices=[26, 27], default=26,
                    help="26 = previous game final roster (immutable); 27 = current game latest week")
    args = ap.parse_args()

    if args.game == 26:
        by_id, iteration = collect_game26()
        out = os.path.join(DATA_DIR, "madden.json")
    else:
        by_id, iteration = collect_game27()
        out = os.path.join(DATA_DIR, "madden27.json")
    assemble(by_id, iteration, out)


if __name__ == "__main__":
    main()
