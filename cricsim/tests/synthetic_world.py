"""A synthetic cricket world with known truth, written as Cricsheet JSON — for engine tests.

Two T20 leagues: "Premier" (strong players, a batting-friendly ground) and "Shield" (weaker).
Every player has a hidden batting and bowling skill. Some Shield players move to the Premier
league in 2022 ("bridge" players, which link the two leagues), and a set of "debutants" play
only Shield cricket until their Premier debut in 2024. Tests check that the fitted ratings recover
the hidden skills and that debutants are projected sensibly from their Shield record.
"""
from __future__ import annotations

import json
import math
import random
import zipfile
from dataclasses import dataclass
from pathlib import Path

RUN_P = {0: 0.36, 1: 0.38, 2: 0.07, 3: 0.005, 4: 0.12, 6: 0.055}
BASE_WICKET = 0.052
WIDE_P = 0.03
KINDS = [("right", "pace"), ("left", "pace"), ("right", "off_spin"), ("right", "leg_spin"), ("left", "left_arm_orthodox")]


@dataclass
class Player:
    pid: str
    name: str
    bat: float          # + = better batter (fewer wickets, more boundaries)
    bowl: float         # + = better bowler
    hand: str
    arm: str
    kind: str
    role: str           # bat | bowl


def make_world(seed: int = 7, teams_per_league: int = 6) -> dict:
    rng = random.Random(seed)
    players: list[Player] = []
    teams: dict[str, list[Player]] = {}
    for league, shift in (("Premier", 0.25), ("Shield", -0.25)):
        for t in range(teams_per_league):
            squad = []
            for k in range(13):
                role = "bat" if k < 7 else "bowl"
                arm, kind = KINDS[rng.randrange(len(KINDS))]
                p = Player(pid=f"{league[0]}{t}-{k}", name=f"{league} {t} Player {k}",
                           bat=rng.gauss(shift + (0.3 if role == "bat" else -0.6), 0.3),
                           bowl=rng.gauss(shift + (0.3 if role == "bowl" else -0.8), 0.3),
                           hand="left" if rng.random() < 0.3 else "right", arm=arm, kind=kind, role=role)
                squad.append(p)
                players.append(p)
            teams[f"{league} {t}"] = squad
    return {"players": {p.pid: p for p in players}, "teams": teams}


def _outcome(rng, batter: Player, bowler: Player, over: int, premier: bool) -> tuple[str, int]:
    edge = batter.bat - bowler.bowl
    p_w = BASE_WICKET * math.exp(-0.9 * edge) * (1.25 if over >= 16 else 1.0)
    if rng.random() < WIDE_P:
        return "wide", 1
    if rng.random() < p_w:
        return "wicket", 0
    boost = math.exp(0.6 * edge) * (1.15 if premier else 1.0) * (1.3 if over >= 16 or over < 6 else 1.0)
    weights = {r: p * (boost if r in (4, 6) else 1.0) for r, p in RUN_P.items()}
    r = rng.choices(list(weights), list(weights.values()))[0]
    return "runs", r


def _innings(rng, bat_xi: list[Player], bowl_xi: list[Player], premier: bool, target: int | None):
    order = [p for p in bat_xi]
    bowlers = [p for p in bowl_xi if p.role == "bowl"][:5]
    plan = [0, 1, 0, 1, 2, 3, 2, 3, 4, 2, 4, 3, 1, 4, 1, 0, 2, 3, 0, 4]
    striker, non, nxt, wkts, runs, overs = 0, 1, 2, 0, 0, []
    for o in range(20):
        bowler = bowlers[plan[o]]
        dels, legal = [], 0
        while legal < 6:
            kind, r = _outcome(rng, order[striker], bowler, o, premier)
            d = {"batter": order[striker].name, "bowler": bowler.name, "non_striker": order[non].name}
            if kind == "wide":
                d.update(runs={"batter": 0, "extras": 1, "total": 1}, extras={"wides": 1})
                dels.append(d)
                runs += 1
                continue
            legal += 1
            if kind == "wicket":
                d.update(runs={"batter": 0, "extras": 0, "total": 0},
                         wickets=[{"player_out": order[striker].name, "kind": "caught", "fielders": [{"name": "Sub"}]}])
                dels.append(d)
                wkts += 1
                if wkts == 10:
                    overs.append({"over": o, "deliveries": dels})
                    return overs, runs
                striker, nxt = nxt, nxt + 1
                continue
            d["runs"] = {"batter": r, "extras": 0, "total": r}
            dels.append(d)
            runs += r
            if r % 2:
                striker, non = non, striker
            if target is not None and runs >= target:
                overs.append({"over": o, "deliveries": dels})
                return overs, runs
        overs.append({"over": o, "deliveries": dels})
        striker, non = non, striker
    return overs, runs


def pick_xi(squad: list[Player]) -> list[Player]:
    bats = [p for p in squad if p.role == "bat"][:6]
    bowls = [p for p in squad if p.role == "bowl"][:5]
    return bats + bowls


def generate(world: dict, years=range(2017, 2025), rounds: int = 2, seed: int = 11,
             bridges: int = 4, debutants: int = 3) -> list[dict]:
    """Match JSON list. In 2022 `bridges` Shield players join Premier teams; `debutants` follow in 2024."""
    rng = random.Random(seed)
    teams = {k: list(v) for k, v in world["teams"].items()}
    shield_bats = [p for name, sq in teams.items() if name.startswith("Shield") for p in sq if p.role == "bat"]
    movers = shield_bats[:bridges]
    late = shield_bats[bridges:bridges + debutants]
    world["movers"] = [p.pid for p in movers]
    world["debutants"] = [p.pid for p in late]
    matches = []
    n = 0
    for year in years:
        if year == 2022:
            for i, p in enumerate(movers):
                teams[f"Premier {i % 6}"][i % 6] = p
        if year == 2024:
            for i, p in enumerate(late):
                teams[f"Premier {(i + 3) % 6}"][(i + 1) % 6] = p
        for league in ("Premier", "Shield"):
            names = [t for t in teams if t.startswith(league)]
            fixtures = [(a, b) for a in names for b in names if a != b] * (rounds // 2 or 1)
            for i, (a, b) in enumerate(fixtures):
                n += 1
                xa, xb = pick_xi(teams[a]), pick_xi(teams[b])
                premier = league == "Premier"
                first, total = _innings(rng, xa, xb, premier, None)
                second, chase = _innings(rng, xb, xa, premier, total + 1)
                winner = b if chase > total else a if chase < total else None
                people = {p.name: p.pid for p in xa + xb}
                people["Sub"] = "sub"
                matches.append({"meta": {}, "info": {
                    "balls_per_over": 6, "dates": [f"{year}-{1 + i % 12:02d}-{1 + i % 27:02d}"],
                    "event": {"name": f"{league} League"}, "gender": "male", "match_type": "T20", "overs": 20,
                    "registry": {"people": people}, "season": str(year), "team_type": "club", "teams": [a, b],
                    "venue": f"{league} Oval", "city": league,
                    "outcome": {"winner": winner} if winner else {"result": "tie"},
                    "players": {a: [p.name for p in xa], b: [p.name for p in xb]}},
                    "innings": [{"team": a, "overs": first}, {"team": b, "overs": second, "target": {"runs": total + 1}}]})
    return matches


def write_world(tmp: Path, **kw) -> tuple[dict, Path, Path]:
    """Writes all_json.zip + attributes; returns (world, zip_path, attributes_rows_path)."""
    world = make_world()
    matches = generate(world, **kw)
    zp = tmp / "world.zip"
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, m in enumerate(matches, start=1):
            zf.writestr(f"{i}.json", json.dumps(m))
    rows = [{"player_id": p.pid, "batting_hand": p.hand, "bowling_arm": p.arm, "bowling_kind": p.kind}
            for p in world["players"].values()]
    ap = tmp / "attrs.json"
    ap.write_text(json.dumps(rows))
    return world, zp, ap
