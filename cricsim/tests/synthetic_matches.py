"""Synthetic Cricsheet-format T20 matches with planted effects, for testing the Pattern Lab."""
from __future__ import annotations

import json
import random
import zipfile
from pathlib import Path

# Bowler for each over: 5 bowlers, nobody bowls consecutive overs, spells break and resume.
OVER_PLAN = [0, 1, 0, 1, 2, 3, 2, 3, 4, 2, 4, 3, 1, 4, 1, 0, 2, 3, 0, 4]
RUNS = [0, 1, 2, 4, 6]
RUN_P = [0.38, 0.37, 0.08, 0.12, 0.05]

PLANT_AFTER_SIX = 2.0        # batter just hit a six → twice as likely out
PLANT_NEW_BATTER = 1.6       # first 5 balls faced → 1.6x


def innings(rng: random.Random, team: str, batters: list[str], bowlers: list[str], target: int | None):
    overs, striker, non, nxt, wkts, runs = [], 0, 1, 2, 0, 0
    faced = {b: 0 for b in batters}
    last_six = {b: False for b in batters}
    for o in range(20):
        dels, legal = [], 0
        bowler = bowlers[OVER_PLAN[o]]
        while legal < 6:
            bat = batters[striker]
            if rng.random() < 0.03:                      # wide
                dels.append({"batter": bat, "bowler": bowler, "non_striker": batters[non],
                             "runs": {"batter": 0, "extras": 1, "total": 1}, "extras": {"wides": 1}})
                runs += 1
                continue
            legal += 1
            p_w = 0.045 + (0.03 if o >= 16 else 0.0)
            if last_six[bat]:
                p_w *= PLANT_AFTER_SIX
            if faced[bat] < 5:
                p_w *= PLANT_NEW_BATTER
            faced[bat] += 1
            d = {"batter": bat, "bowler": bowler, "non_striker": batters[non]}
            if rng.random() < p_w:
                d["runs"] = {"batter": 0, "extras": 0, "total": 0}
                d["wickets"] = [{"player_out": bat, "kind": "caught", "fielders": [{"name": "F"}]}]
                dels.append(d)
                wkts += 1
                if wkts == 10:
                    overs.append({"over": o, "deliveries": dels})
                    return overs
                striker, nxt = nxt, nxt + 1
                continue
            r = rng.choices(RUNS, RUN_P)[0]
            last_six[bat] = r == 6
            d["runs"] = {"batter": r, "extras": 0, "total": r}
            dels.append(d)
            runs += r
            if r % 2:
                striker, non = non, striker
            if target is not None and runs >= target:
                overs.append({"over": o, "deliveries": dels})
                return overs
        overs.append({"over": o, "deliveries": dels})
        striker, non = non, striker
    return overs


def match(rng: random.Random, year: int, i: int) -> dict:
    a = [f"A{k}" for k in range(11)]
    b = [f"B{k}" for k in range(11)]
    reg = {n: f"id-{n}" for n in a + b + ["F"]}
    first = innings(rng, "Alpha", a, b[6:], None)
    total = sum(d["runs"]["total"] for o in first for d in o["deliveries"])
    second = innings(rng, "Beta", b, a[6:], total + 1)
    return {"meta": {}, "info": {
        "balls_per_over": 6, "dates": [f"{year}-0{1 + i % 9}-1{i % 9}"], "event": {"name": "Synthetic League"},
        "gender": "male", "match_type": "T20", "overs": 20, "registry": {"people": reg}, "season": str(year),
        "team_type": "club", "teams": ["Alpha", "Beta"], "venue": "Test Ground", "outcome": {"result": "no result"},
        "players": {"Alpha": a, "Beta": b}},
        "innings": [{"team": "Alpha", "overs": first}, {"team": "Beta", "overs": second, "target": {"runs": total + 1}}]}


def write_zip(path: Path, n_per_year: int = 220, years=range(2017, 2025), seed: int = 3) -> Path:
    rng = random.Random(seed)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        k = 0
        for y in years:
            for i in range(n_per_year):
                k += 1
                zf.writestr(f"{k}.json", json.dumps(match(rng, y, i)))
    return path
