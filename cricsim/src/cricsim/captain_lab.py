"""Captains lab: is a team of the most-picked captains better than our single team?

For every match with a manual scorecard (cricsim/results/), 100 teams are built from the pre-match simulations
(cricsim.fantasy_teams.build). The "captains team" is the 11 players who captained most often (ties: vice-captaincies,
then expected points), kept within the usual rules (1-10 per side, 1-8 per role), with the most-captained player as
captain and the next as vice-captain. It is scored on the real scorecard next to our live single team, the live team
with the most-picked captain, and the best team in hindsight.

python -m cricsim.captain_lab --model M --coverage DIR --fixtures cricsim/fixtures --results cricsim/results
"""
from __future__ import annotations

import json
from pathlib import Path

import click
import numpy as np

from cricsim.engine.model import Model
from cricsim.fantasy import pick_xi, scorecard_points, team_points
from cricsim.fantasy_teams import build
from cricsim.results import Roster


def captains_team(t: dict) -> tuple[list[str], str, str]:
    counts, exp = t["counts"], t["exp"]
    rank = {p: counts[p]["c"] * 1e6 + counts[p]["vc"] * 1e3 + exp[p] for p in t["pids"]}
    return pick_xi(rank, t["team_of"], t["use_roles"])


QUOTA = {"WK": (1, 2), "BAT": (3, 4), "AR": (2, 3), "BOWL": (3, 4)}


def _vote(t: dict) -> dict[str, float]:
    counts, exp = t["counts"], t["exp"]
    return {p: counts[p]["c"] * 1e6 + counts[p]["vc"] * 1e3 + exp[p] for p in t["pids"]}


def appearances_team(t: dict) -> tuple[list[str], str, str]:
    """The 11 players picked most often across the teams (within the rules); captain and vice-captain by the vote."""
    counts, exp = t["counts"], t["exp"]
    rank = {p: counts[p]["xi"] * 1e3 + counts[p]["c"] + exp[p] / 1e3 for p in t["pids"]}
    return pick_xi(rank, t["team_of"], t["use_roles"], captain_score=_vote(t))


def quota_captains_team(t: dict) -> tuple[list[str], str, str]:
    """The most-voted captains per role, with role quotas (1-2 WK, 3-4 BAT, 2-3 AR, 3-4 BOWL) so bowlers get in."""
    vote, roles, team_of = _vote(t), t["roles"], t["team_of"]
    by_role = {r: sorted((p for p in t["pids"] if roles.get(p) == r), key=lambda p: -vote[p]) for r in QUOTA}
    best, best_total = None, -1e30
    for w in range(QUOTA["WK"][0], QUOTA["WK"][1] + 1):
        for b in range(QUOTA["BAT"][0], QUOTA["BAT"][1] + 1):
            for a in range(QUOTA["AR"][0], QUOTA["AR"][1] + 1):
                bo = 11 - w - b - a
                n = {"WK": w, "BAT": b, "AR": a, "BOWL": bo}
                if not QUOTA["BOWL"][0] <= bo <= QUOTA["BOWL"][1] or any(len(by_role[r]) < n[r] for r in n):
                    continue
                xi = [p for r in n for p in by_role[r][:n[r]]]
                per_team = [sum(team_of[p] == k for p in xi) for k in (0, 1)]
                total = sum(vote[p] for p in xi)
                if min(per_team) >= 1 and max(per_team) <= 10 and total > best_total:
                    best, best_total = xi, total
    if best is None:                                          # quotas can't be met (e.g. roles unknown)
        return captains_team(t)
    c, vc = sorted(best, key=lambda p: -vote[p])[:2]
    return best, c, vc


def evaluate(model, cov: dict, fixture: dict, card: dict, n_teams: int = 100, n_sims: int = 20_000) -> dict:
    t = build(model, cov, n_teams, n_sims)
    pids, team_of, roles, exp = t["pids"], t["team_of"], t["roles"], t["exp"]
    names = {p: (model.names[model.pid(p)] if model.knows(p) else p.removeprefix("new:")) for p in pids}
    shown = {p: n for tm, ft in zip(cov["teams"], fixture["teams"]) for p, n in zip(tm["players"], ft["players"])}
    doc = {"summary": {"teams": [{"players": [{"id": p, "name": names[p]} for p in tm["players"]]} for tm in cov["teams"]]},
           "match": {"teams": [{"name": tm["name"], "players": tm["players"]} for tm in cov["teams"]]}}
    got = scorecard_points(card, Roster(doc, fixture).player, roles, pids, od=cov.get("format") == "OD")
    real = {p: got.get(p, 4.0) for p in pids}
    best = team_points(*pick_xi(real, team_of, t["use_roles"]), real)
    live = t["live"]
    cap = captains_team(t)
    appear, quota = appearances_team(t), quota_captains_team(t)
    top_c = max(pids, key=lambda p: (t["counts"][p]["c"], t["counts"][p]["vc"], exp[p]))
    live_c = (live[0], top_c, live[1] if live[1] != top_c else live[2]) if top_c in live[0] else live

    def score(team):
        xi, c, vc = team
        pts = team_points(xi, c, vc, real)
        return {"points": round(pts, 1), "share": round(pts / best, 4) if best > 0 else None,
                "captain": shown.get(c, names[c]), "c_points": round(real[c], 1), "vice_captain": shown.get(vc, names[vc]),
                "overlap": len(set(xi) & set(live[0]))}
    # who really topped the scoring, against how often the simulations expected each role to
    pts = t["pts"]
    sim_top = pts.argmax(1)
    p_role = {r: float(np.isin(sim_top, [j for j, p in enumerate(pids) if roles.get(p) == r]).mean()) for r in QUOTA}
    top_real = max(pids, key=lambda p: real[p])
    best_xi = pick_xi(real, team_of, t["use_roles"])
    return {"id": cov["id"], "title": cov.get("title"), "format": cov.get("format"), "best": round(best, 1),
            "live": score(live), "captains": score(cap), "live_top_captain": score(live_c),
            "appearances": score(appear), "quota": score(quota),
            "top_real": {"player": shown.get(top_real, names[top_real]), "role": roles.get(top_real),
                         "points": round(real[top_real], 1)},
            "best_xi_roles": {r: sum(roles.get(p) == r for p in best_xi[0]) for r in QUOTA},
            "live_xi_roles": {r: sum(roles.get(p) == r for p in live[0]) for r in QUOTA},
            "p_top_role": {r: round(v, 4) for r, v in p_role.items()},
            "captains_bowlers": sum(roles.get(p) == "BOWL" for p in cap[0])}


TEAMS = {"live": "live team", "live_top_captain": "live team, top captain", "captains": "captains team",
         "appearances": "most-picked XI", "quota": "captains with role quotas"}


def report(rows: list[dict]) -> str:
    L = ["# Captains lab", "",
         "Per match, real points (share of the best team in hindsight) of: our live single team; the same team with "
         "the most-picked captain; the 11 most-picked captains; the 11 players picked most often across the teams "
         "(captain by the vote); and the most-picked captains with role quotas (1-2 WK, 3-4 BAT, 2-3 AR, 3-4 BOWL). "
         "100 teams per match from the pre-match simulations.", "",
         "| match | best | " + " | ".join(TEAMS.values()) + " | real top scorer | bowlers: captains team / best XI |",
         "|---|---:|" + "---:|" * len(TEAMS) + "---|---:|"]
    for r in rows:
        cells = " | ".join(f"{r[k]['points']} ({r[k]['share']:.0%})" for k in TEAMS)
        tr = r["top_real"]
        L.append(f"| {r['title']} ({r['id'][-10:]}) | {r['best']} | {cells} | {tr['player']} ({tr['role']}, {tr['points']}) | "
                 f"{r['captains_bowlers']} / {r['best_xi_roles']['BOWL']} |")
    if not rows:
        return "\n".join(L)
    rng = np.random.default_rng(0)
    L += ["", "| team | share of best (average) | points (average) | v live team (points a match, 95% range) | better in |",
          "|---|---:|---:|---:|---:|"]
    base = np.array([r["live"]["points"] for r in rows])
    for k, name in TEAMS.items():
        v = np.array([r[k]["points"] for r in rows])
        d = v - base
        boot = [d[rng.integers(len(d), size=len(d))].mean() for _ in range(5000)]
        lo, hi = np.percentile(boot, [2.5, 97.5])
        L.append(f"| {name} | {np.mean([r[k]['share'] for r in rows]):.1%} | {v.mean():.1f} | "
                 f"{d.mean():+.1f} ({lo:+.1f} to {hi:+.1f}) | {(d > 0).sum()} of {len(d)} |")
    L += ["", "## Who tops the scoring: real matches v the simulations", "",
          "| role | real top scorer (matches) | expected by the simulations (matches) | in the best XI (average) | in our live XI (average) |",
          "|---|---:|---:|---:|---:|"]
    for role in QUOTA:
        real_n = sum(r["top_real"]["role"] == role for r in rows)
        exp_n = sum(r["p_top_role"][role] for r in rows)
        L.append(f"| {role} | {real_n} | {exp_n:.1f} | {np.mean([r['best_xi_roles'][role] for r in rows]):.1f} | "
                 f"{np.mean([r['live_xi_roles'][role] for r in rows]):.1f} |")
    return "\n".join(L)


@click.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--coverage", type=click.Path(exists=True, path_type=Path), required=True,
              help="Folder of resolved fixtures (<id>.json)")
@click.option("--fixtures", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--results", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/results"))
@click.option("--teams", "n_teams", default=100)
@click.option("--out", type=click.Path(path_type=Path), default=None)
def main(model_dir: Path, coverage: Path, fixtures: Path, results: Path, n_teams: int, out: Path | None) -> None:
    model = Model.load(model_dir)
    rows = []
    for rf in sorted(results.glob("*.json")):
        card = json.loads(rf.read_text())
        cf, ff = coverage / rf.name, fixtures / rf.name
        if card.get("abandoned") or not card.get("innings") or not cf.exists() or not ff.exists():
            click.echo(f"skip {rf.stem}", err=True)
            continue
        rows.append(evaluate(model, json.loads(cf.read_text()), json.loads(ff.read_text()), card, n_teams))
        r = rows[-1]
        click.echo(f"{r['id']}: live {r['live']['share']:.0%}, captains team {r['captains']['share']:.0%}", err=True)
    text = report(rows)
    if out:
        out.write_text(text + "\n")
    click.echo(text)


if __name__ == "__main__":
    main()
