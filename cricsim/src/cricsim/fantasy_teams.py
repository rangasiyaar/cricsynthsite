"""Many fantasy teams for one fixture, and who captains them: an experiment, not part of the published picks.

Each team is built from one simulated match (a "match story"): every player's score for that team is their expected
points (as the live pick computes them) moved part-way towards what they scored in that simulated match, so players
who do well together in the same story are picked together. Each team then takes its best XI with captain and
vice-captain by the live rules. The table counts how often each player is captain, vice-captain and in the XI,
next to how often they top the fantasy scoring in the simulations.

python -m cricsim.fantasy_teams --model data/models/latest --coverage data/coverage/matches/X.json --teams 100
"""
from __future__ import annotations

import json
from pathlib import Path

import click
import numpy as np

from cricsim.engine.io import spec_from_dict
from cricsim.engine.model import Model
from cricsim.engine.simulate import simulate
from cricsim.fantasy import decisive_mean, load_weights, pick_xi, sim_features, sim_points, stack_features


def teams(model, cov: dict, n_teams: int = 100, n_sims: int = 20_000, mix: float = 0.5, seed: int = 0,
          fixture: dict | None = None) -> dict:
    t = build(model, cov, n_teams, n_sims, mix, seed)
    pids, pts, exp, roles, team_of, counts = (t[k] for k in ("pids", "pts", "exp", "roles", "team_of", "counts"))
    top = pts.argmax(1)
    names = {p: (model.names[model.pid(p)] if model.knows(p) else p.removeprefix("new:")) for p in pids}
    shown = ({p: n for t, ft in zip(cov["teams"], fixture["teams"]) for p, n in zip(t["players"], ft["players"])}
             if fixture else {})          # the names as the fixture gave them
    rows = [{"player": shown.get(p, names[p]), "team": cov["teams"][team_of[p]].get("short") or cov["teams"][team_of[p]]["name"],
             "role": roles.get(p), "expected": round(exp[p], 1), "p90": round(float(np.percentile(pts[:, j], 90)), 1),
             "captain": counts[p]["c"], "vice_captain": counts[p]["vc"], "in_xi": counts[p]["xi"],
             "top_scorer": round(float((top == j).mean()) * 100, 1)} for j, p in enumerate(pids)]
    rows.sort(key=lambda r: (-r["captain"], -r["vice_captain"], -r["expected"]))
    live = t["live"]
    return {"title": cov.get("title"), "teams": n_teams, "simulations": int(len(pts)), "mix": mix, "rows": rows,
            "live_captain": shown.get(live[1], names[live[1]]), "live_vice_captain": shown.get(live[2], names[live[2]])}


def build(model, cov: dict, n_teams: int = 100, n_sims: int = 20_000, mix: float = 0.5, seed: int = 0) -> dict:
    """The simulations, everyone's expected points (as the live pick computes them), the live single XI and how often
    each player is captain / vice-captain / in the XI across `n_teams` teams built from simulated match stories."""
    from cricsim.engine.modelling import infer_roles
    spec, scenario = spec_from_dict(cov)
    sims = simulate(model, spec, n=n_sims, scenario=scenario, seed=seed)
    given = {p: str(r).upper() for t in cov["teams"] for p, r in zip(t["players"], t.get("roles") or []) if r}
    roles = infer_roles(model, spec, given or None)
    pids, pts = sim_points(sims, roles, model=model, fielding=model.fielding is not None)
    team_of = {p: t for t, tm in enumerate(spec.teams) for p in tm.everyone}
    exp = dict(zip(pids, decisive_mean(pts, np.concatenate([part.winner for part in sims.parts]))))
    w = load_weights().get("OD" if spec.format == "OD" else "T20")
    form = cov.get("form")
    if w and form is not None:                      # the live pick's learned blend of simulations and recent form
        feats = sim_features(model, sims, pids, pts, team_of)
        exp = {p: float(np.dot(stack_features({**feats[p], **(form.get(p) or {"n": 0})}), w["weights"])) for p in pids}
    use_roles = roles if any(r == "WK" for r in roles.values()) else None
    mean = pts.mean(0)
    rng = np.random.default_rng(seed)
    counts = {p: {"c": 0, "vc": 0, "xi": 0} for p in pids}
    for s in rng.choice(len(pts), size=n_teams, replace=False):
        score = {p: exp[p] + mix * (pts[s, j] - mean[j]) for j, p in enumerate(pids)}
        xi, c, vc = pick_xi(score, team_of, use_roles)
        counts[c]["c"] += 1
        counts[vc]["vc"] += 1
        for p in xi:
            counts[p]["xi"] += 1
    return {"pids": pids, "pts": pts, "exp": exp, "roles": roles, "use_roles": use_roles, "team_of": team_of,
            "counts": counts, "live": pick_xi(exp, team_of, use_roles)}


def markdown(res: dict) -> str:
    L = [f"## {res['title']}: captains across {res['teams']} teams", "",
         f"{res['simulations']} simulations; each team built from one simulated match story (mix {res['mix']}). "
         f"The single live pick: captain **{res['live_captain']}**, vice-captain **{res['live_vice_captain']}**.", "",
         "| player | team | role | expected pts | 90th pct pts | captain | vice-captain | in XI | top scorer in sims |",
         "|---|---|---|---:|---:|---:|---:|---:|---:|"]
    for r in res["rows"]:
        L.append(f"| {r['player']} | {r['team']} | {r['role'] or ''} | {r['expected']} | {r['p90']} | {r['captain']} | "
                 f"{r['vice_captain']} | {r['in_xi']} | {r['top_scorer']}% |")
    return "\n".join(L)


@click.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--coverage", type=click.Path(exists=True, path_type=Path), required=True, help="A resolved fixture")
@click.option("--fixture", type=click.Path(exists=True, path_type=Path), default=None,
              help="The fixture before resolving, for players' names as given")
@click.option("--teams", "n_teams", default=100)
@click.option("--sims", default=20_000)
@click.option("--mix", default=0.5, help="How far each team moves from expected points towards its match story")
@click.option("--out", type=click.Path(path_type=Path), default=None)
def main(model_dir: Path, coverage: Path, fixture: Path | None, n_teams: int, sims: int, mix: float, out: Path | None) -> None:
    res = teams(Model.load(model_dir), json.loads(coverage.read_text()), n_teams, sims, mix,
                fixture=json.loads(fixture.read_text()) if fixture else None)
    text = markdown(res)
    if out:
        out.write_text(text + "\n")
    click.echo(text)


if __name__ == "__main__":
    main()
