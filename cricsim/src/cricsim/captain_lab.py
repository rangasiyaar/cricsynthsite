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
    top_c = max(pids, key=lambda p: (t["counts"][p]["c"], t["counts"][p]["vc"], exp[p]))
    live_c = (live[0], top_c, live[1] if live[1] != top_c else live[2]) if top_c in live[0] else live

    def score(team):
        xi, c, vc = team
        pts = team_points(xi, c, vc, real)
        return {"points": round(pts, 1), "share": round(pts / best, 4) if best > 0 else None,
                "captain": shown.get(c, names[c]), "c_points": round(real[c], 1), "vice_captain": shown.get(vc, names[vc]),
                "overlap": len(set(xi) & set(live[0]))}
    return {"id": cov["id"], "title": cov.get("title"), "format": cov.get("format"), "best": round(best, 1),
            "live": score(live), "captains": score(cap), "live_top_captain": score(live_c)}


def report(rows: list[dict]) -> str:
    L = ["# Captains lab", "",
         "Per match: our live single team; the same team with the most-picked captain; and the team of the 11 "
         "most-picked captains (100 teams from the pre-match simulations). Real points, as a share of the best team "
         "in hindsight.", "",
         "| match | best | live team | live team, top captain | captains team | live captain (pts) | top captain (pts) | players shared |",
         "|---|---:|---:|---:|---:|---|---|---:|"]
    for r in rows:
        lv, lc, ct = r["live"], r["live_top_captain"], r["captains"]
        L.append(f"| {r['title']} ({r['id'][-10:]}) | {r['best']} | {lv['points']} ({lv['share']:.0%}) | "
                 f"{lc['points']} ({lc['share']:.0%}) | {ct['points']} ({ct['share']:.0%}) | {lv['captain']} ({lv['c_points']}) | "
                 f"{ct['captain']} ({ct['c_points']}) | {ct['overlap']}/11 |")
    if rows:
        def avg(k):
            return np.mean([r[k]["share"] for r in rows]), np.mean([r[k]["points"] for r in rows])
        d = np.array([r["captains"]["points"] - r["live"]["points"] for r in rows])
        rng = np.random.default_rng(0)
        boot = [d[rng.integers(len(d), size=len(d))].mean() for _ in range(5000)]
        lo, hi = np.percentile(boot, [2.5, 97.5])
        L += ["", "| | live team | live team, top captain | captains team |", "|---|---:|---:|---:|",
              "| share of best (average) | " + " | ".join(f"{avg(k)[0]:.1%}" for k in ("live", "live_top_captain", "captains")) + " |",
              "| points (average) | " + " | ".join(f"{avg(k)[1]:.1f}" for k in ("live", "live_top_captain", "captains")) + " |",
              "", f"Captains team v live team: {d.mean():+.1f} points a match (95% range {lo:+.1f} to {hi:+.1f}), "
              f"better in {(d > 0).sum()} of {len(d)} matches."]
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
