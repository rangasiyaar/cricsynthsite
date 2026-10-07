"""Pull one concrete simulated match out of a forecast, score it with fantasy points, and pick the XI.

    python -m cricsim.sample --model data/models/latest --coverage data/coverage/matches/<id>.json \
        --top-scorer "SS Iyer" [--n 20000 --seed 0]

Uses the same seed and count as publish, so the match is one of the published simulations. Among the
simulations that meet the condition (e.g. a player is the match's top scorer), it shows the most typical
one: closest to the condition's median team totals and that player's median score.

Fantasy points follow the common T20 table (Dream11-style): run 1, four +4, six +6, 25/50/75/100 bonus
4/8/12/16 (highest only), duck -2, strike-rate and economy bands, wicket 30, bowled/LBW +8, 3/4/5-wicket
bonus 4/8/12, stumping 12, playing +4. Catches and run-outs are not simulated per fielder, so they are left
out (the keeper gets stumpings only); maidens are left out too.
"""
from __future__ import annotations

import itertools
import json
from pathlib import Path

import click
import numpy as np

from cricsim.engine.io import spec_from_dict
from cricsim.engine.model import DISMISSALS, Model
from cricsim.engine.simulate import simulate

BOWLED_LBW = {DISMISSALS.index("bowled"), DISMISSALS.index("lbw")}
STUMPED = DISMISSALS.index("stumped")


def _bat_points(r: int, b: int, f4: int, f6: int, out: bool, role: str) -> int:
    p = r + 4 * f4 + 6 * f6
    p += 16 if r >= 100 else 12 if r >= 75 else 8 if r >= 50 else 4 if r >= 25 else 0
    if r == 0 and out and role != "BOWL":
        p -= 2
    if b >= 10 and role != "BOWL":
        sr = 100 * r / b
        p += 6 if sr > 170 else 4 if sr > 150 else 2 if sr >= 130 else 0
        p -= 6 if sr < 50 else 4 if sr < 60 else 2 if sr <= 70 else 0
    return p


def _bowl_points(balls: int, runs: int, wkts: int, bowled_lbw: int) -> int:
    p = 30 * wkts + 8 * bowled_lbw + (12 if wkts >= 5 else 8 if wkts == 4 else 4 if wkts == 3 else 0)
    if balls >= 12:
        econ = 6 * runs / balls
        p += 6 if econ < 5 else 4 if econ < 6 else 2 if econ <= 7 else 0
        p -= 6 if econ > 12 else 4 if econ > 11 else 2 if econ >= 10 else 0
    return p


def scorecard(model: Model, sims, i: int, roles: dict[str, str]) -> dict:
    """Scorecard and fantasy points for simulation i (index across parts)."""
    off = 0
    for part in sims.parts:
        if i < off + part.n:
            break
        off += part.n
    j = i - off
    name = {p: model.names[model.pid(p)] if model.knows(p) else p.replace("new:", "") for t in sims.spec.teams
            for p in t.players}
    pts = {p: 4 for t in sims.spec.teams for p in t.players}
    innings = []
    for lg in part.innings:
        bat = []
        for s, p in enumerate(lg.order):
            balls = int(lg.bat_balls[j, s])
            batted = balls > 0 or bool(lg.bat_out[j, s])
            if not batted:
                bat.append({"player": name[p], "dnb": True})
                continue
            r, f4, f6, out = int(lg.bat_runs[j, s]), int(lg.bat_4s[j, s]), int(lg.bat_6s[j, s]), bool(lg.bat_out[j, s])
            kind = int(lg.bat_kind[j, s])
            by = int(lg.bat_by[j, s])
            how = "not out" if not out else (f"{DISMISSALS[kind]}" + (f" b {name[lg.bowlers[by]]}" if by >= 0 else ""))
            pts[p] += _bat_points(r, balls, f4, f6, out, roles.get(p, "BAT"))
            bat.append({"player": name[p], "how": how, "runs": r, "balls": balls, "4s": f4, "6s": f6})
        bowl = []
        for k, p in enumerate(lg.bowlers):
            balls = int(lg.bowl_balls[j, k])
            if balls == 0:
                continue
            w = int(lg.bowl_wkts[j, k])
            bl = int(sum(1 for s in range(11) if lg.bat_out[j, s] and lg.bat_by[j, s] == k
                         and lg.bat_kind[j, s] in BOWLED_LBW))
            st = int(sum(1 for s in range(11) if lg.bat_out[j, s] and lg.bat_by[j, s] == k
                         and lg.bat_kind[j, s] == STUMPED))
            pts[p] += _bowl_points(balls, int(lg.bowl_runs[j, k]), w, bl)
            if st:
                keeper = next((q for q in lg.bowlers if roles.get(q) == "WK"), None)
                if keeper:
                    pts[keeper] += 12 * st
            bowl.append({"player": name[p], "overs": f"{balls // 6}.{balls % 6}", "runs": int(lg.bowl_runs[j, k]),
                         "wkts": w, "econ": round(6 * int(lg.bowl_runs[j, k]) / balls, 2)})
        innings.append({"team": sims.spec.teams[lg.batting].name, "runs": int(lg.runs[j]), "wkts": int(lg.wkts[j]),
                        "overs": f"{int(lg.legal[j]) // 6}.{int(lg.legal[j]) % 6}",
                        "extras": int(lg.extras[j].sum()), "batting": bat, "bowling": bowl})
    winner = sims.spec.teams[int(part.winner[j])].name
    return {"sim": i, "winner": winner, "tie": bool(part.tie[j]), "innings": innings,
            "points": {name[p]: v for p, v in sorted(pts.items(), key=lambda kv: -kv[1])},
            "_pts": pts, "_name": name}


def best_xi(pts: dict[str, int], roles: dict[str, str], team_of: dict[str, int]) -> tuple[list[str], str, str, float]:
    """Highest-scoring 11 with 1-10 per team and 1-8 per role; captain 2x, vice-captain 1.5x."""
    ranked = sorted(pts, key=lambda p: -pts[p])
    pool = ranked[:15]
    for role in ("WK", "BAT", "AR", "BOWL"):          # the best of each role, even if it ranks low overall
        pool += [p for p in ranked if roles.get(p) == role and p not in pool][:2]
    best = None
    for combo in itertools.combinations(pool, 11):
        per_team = [sum(team_of[p] == t for p in combo) for t in (0, 1)]
        per_role = {r: sum(roles.get(p) == r for p in combo) for r in ("WK", "BAT", "AR", "BOWL")}
        if min(per_team) < 1 or max(per_team) > 10 or min(per_role.values()) < 1 or max(per_role.values()) > 8:
            continue
        top = sorted(combo, key=lambda p: -pts[p])
        total = sum(pts[p] for p in combo) + pts[top[0]] + 0.5 * pts[top[1]]
        if best is None or total > best[3]:
            best = (list(combo), top[0], top[1], total)
    return best


@click.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--coverage", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--top-scorer", default=None, help="Display name (as in the model) who must top-score the match")
@click.option("--n", default=20_000)
@click.option("--seed", default=0)
def main(model_dir: Path, coverage: Path, top_scorer: str | None, n: int, seed: int) -> None:
    cov = json.loads(coverage.read_text())
    model = Model.load(model_dir)
    spec, scenario = spec_from_dict(cov)
    sims = simulate(model, spec, n=n, scenario=scenario, seed=seed)
    roles = {p: r for t in cov["teams"] for p, r in zip(t["players"], t.get("roles") or [])}
    team_of = {p: k for k, t in enumerate(spec.teams) for p in t.players}

    runs, totals, top = [], [], []
    for part in sims.parts:
        per = {}
        for lg in part.innings:
            for s, p in enumerate(lg.order):
                per[p] = lg.bat_runs[:, s]
        ids = list(per)
        mat = np.stack([per[p] for p in ids], 1)
        top.append(np.array(ids)[mat.argmax(1)])
        runs.append(mat)
        totals.append(np.stack([next(lg for lg in part.innings if lg.batting == t).runs for t in (0, 1)], 1))
    tops = np.concatenate(top)
    tot = np.concatenate(totals)
    ok = np.ones(len(tops), dtype=bool)
    target_pid = None
    if top_scorer:
        target_pid = next(p for t in spec.teams for p in t.players
                          if (model.names[model.pid(p)] if model.knows(p) else p) == top_scorer)
        ok = tops == target_pid
    idx = np.flatnonzero(ok)
    click.echo(f"{len(idx)} of {len(tops)} simulations match ({100 * len(idx) / len(tops):.1f}%)")
    med = np.median(tot[idx], 0)
    dist = np.abs(tot[idx] - med).sum(1)
    if target_pid:
        ir = np.concatenate([r[:, list(dict.fromkeys(
            p for lg in part.innings for p in lg.order)).index(target_pid)] for r, part in zip(runs, sims.parts)])
        dist = dist + np.abs(ir[idx] - np.median(ir[idx]))
    else:      # most typical match overall: every player's fantasy points closest to their average
        from cricsim.fantasy import sim_points
        _, fp = sim_points(sims, roles)
        dist = np.abs(fp - fp.mean(0)).sum(1)[idx]
    i = int(idx[np.argmin(dist)])
    card = scorecard(model, sims, i, roles)
    pts, name = card.pop("_pts"), card.pop("_name")
    xi, cap, vc, total = best_xi(pts, roles, team_of)
    card["fantasy_xi"] = {"players": [{"player": name[p], "team": spec.teams[team_of[p]].name, "role": roles.get(p),
                                       "points": pts[p]} for p in sorted(xi, key=lambda p: -pts[p])],
                          "captain": name[cap], "vice_captain": name[vc], "total": total}
    click.echo(json.dumps(card, indent=1))


if __name__ == "__main__":
    main()
