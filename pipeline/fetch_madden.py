"""Fetch final-iteration published player ratings from EA drop-api → data/madden.json.

One-shot (the iteration is a completed game season; data is immutable):
  uv run fetch_madden.py            # full fetch + write
  uv run fetch_madden.py --probe    # stat-key + position inventory only, no write

Position sweep gives every player + position; team sweep (numeric ids) gives team
attribution by exact EA id join. Numeric-id→abbr mapping is derived by majority
name+position match against data/snapshot.json (rosters drift, majorities don't).
"""
import argparse
import json
import os
import time
import urllib.request
from collections import Counter, defaultdict

import pandas as pd

from config import (HTTP_TIMEOUT_S, MADDEN_ITERATION, MADDEN_NAMESPACE,
                    MADDEN_POSITION_CANDIDATES, MADDEN_TEAMS, TIER_THRESHOLDS)

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
SNAPSHOT_PATH = os.path.join(DATA_DIR, "snapshot.json")
OUT_PATH = os.path.join(DATA_DIR, "madden.json")
PAGE = 100
SLEEP_S = 0.4

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


def get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "rippack-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
        return json.load(resp)


def fetch_all(params: str) -> list[dict]:
    """Paginate a filtered query until totalItems is covered."""
    items, offset = [], 0
    while True:
        data = get(f"https://drop-api.ea.com/rating/{MADDEN_NAMESPACE}?limit={PAGE}&offset={offset}&iteration={MADDEN_ITERATION}&{params}")
        batch = data.get("items") or []
        items.extend(batch)
        total = data.get("totalItems") or 0
        offset += len(batch)
        if not batch or offset >= total:
            return items
        time.sleep(SLEEP_S)


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--probe", action="store_true", help="inventory only, no write")
    args = ap.parse_args()

    # --- position sweep ---
    by_id: dict[int, dict] = {}
    positions = []
    stat_keys: dict[str, Counter] = defaultdict(Counter)
    for pos in MADDEN_POSITION_CANDIDATES:
        items = fetch_all(f"position={pos}")
        if not items:
            continue
        positions.append((pos, len(items)))
        print(f"position {pos:<5} {len(items):>4} players")
        for it in items:
            it["__position"] = pos
            if it["id"] not in by_id:  # specific filters come first; don't let DB/OLB/etc. overwrite
                by_id[it["id"]] = it
            for k in (it.get("stats") or {}):
                stat_keys[pos][k] += 1
        time.sleep(SLEEP_S)
    print(f"position sweep total: {len(by_id)} unique players")
    expected = get(f"https://drop-api.ea.com/rating/{MADDEN_NAMESPACE}?limit=1&iteration={MADDEN_ITERATION}").get("totalItems")
    if expected and expected != len(by_id):
        print(f"WARNING: unfiltered totalItems={expected} != swept {len(by_id)} (missing positions or API drift)")

    if args.probe:
        print("\n--- stat key inventory (per position, keys with >=1 hit) ---")
        for pos, c in stat_keys.items():
            print(f"{pos:<5}: {sorted(k for k, n in c.items() if n > 0)}")
        return

    # --- team sweep (numeric ids) → exact team attribution by EA id ---
    id_to_team_id: dict[int, int] = {}
    for tid in sorted(set(MADDEN_TEAMS) | set(range(1, 33))):
        for it in fetch_all(f"team={tid}"):
            id_to_team_id[it["id"]] = tid
        time.sleep(SLEEP_S)
    team_map = derive_team_map(id_to_team_id, by_id) or MADDEN_TEAMS
    abbr_of = {ea_id: team_map.get(tid, "FA") for ea_id, tid in id_to_team_id.items()}

    teams_src = json.load(open(SNAPSHOT_PATH, encoding="utf-8"))["teams"]
    teams_by_abbr = {t["abbr"]: t for t in teams_src}
    fa_team = {"abbr": "FA", "name": "Free Agent", "city": "Free Agent",
               "primary": "#4b5563", "secondary": "#111827"}

    # --- assemble cards ---
    players, xfactor_ids = [], []
    for ea_id, it in sorted(by_id.items()):
        abilities = it.get("playerAbilities") or []
        xf = [a["label"] for a in abilities if (a.get("type") or {}).get("id") == "xFactor"]
        labels = xf + [a["label"] for a in abilities if (a.get("type") or {}).get("id") != "xFactor"]
        team = abbr_of.get(ea_id, "FA")
        first, last = it.get("firstName") or "", it.get("lastName") or ""
        rating = int(it.get("overallRating") or 0)
        card = {
            "playerId": f"ea-{ea_id}",
            "name": f"{first[:1]}. {last}" if last else first,
            "fullName": f"{first} {last}".strip(),
            "position": it.get("__position") or "",
            "team": team or "FA",
            "jersey": it.get("jerseyNum"),
            "age": int(it.get("age") or 0),
            "heightIn": it.get("height"),
            "weightLb": it.get("weight"),
            "college": it.get("college") or "",
            "yearsPro": it.get("yearsPro"),
            "rating": rating,
            "tier": tier_of(rating),
            "attributes": top_attributes(it.get("stats") or {}),
            "xfactor": bool(xf),
            "abilities": labels[:2],
            "avatarSeed": f"ea-{ea_id}",
        }
        players.append(card)
        if xf:
            xfactor_ids.append(card["playerId"])

    out_teams = teams_src + [fa_team]
    snapshot = {"builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "sourceIteration": MADDEN_ITERATION,
                "players": players,
                "teams": out_teams,
                "xfactorIds": xfactor_ids}
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, separators=(",", ":"))

    dist = Counter(p["tier"] for p in players)
    pos_dist = Counter(p["position"] for p in players)
    print(f"\nwrote {OUT_PATH}: {len(players)} players, "
          f"tiers={dict(dist)}, xfactor={len(xfactor_ids)}")
    print(f"positions: {dict(pos_dist)}")
    print(f"rating range: {min(p['rating'] for p in players)}–{max(p['rating'] for p in players)}")


if __name__ == "__main__":
    main()
