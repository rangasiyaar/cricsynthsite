"""How much of the best possible fantasy XI our pre-match picks captured in a finished match.

    python -m cricsim.fantasy_check --model data/models/latest --coverage data/coverage/matches/<id>.json \
        --fixture cricsim/fixtures/<id>.json --result cricsim/results/<id>.json

The picks are made from the simulations exactly as the fantasy endpoints make them (one XI with captain and
vice-captain, and sets of 5 / 10 / 20 teams); the real points come from the scorecard with the same table,
fielding included.
"""
from __future__ import annotations

import json
from pathlib import Path

import click

from cricsim.engine.io import spec_from_dict
from cricsim.engine.model import Model
from cricsim.engine.simulate import simulate
from cricsim.fantasy import fantasy_picks, pick_xi, scorecard_points, team_points

def card_points(card: dict, names: dict[str, str], roles: dict[str, str]) -> dict[str, float]:
    """Real points per player id; `names` maps scorecard names to ids (exact, else a unique surname)."""
    def pid(name: str) -> str | None:
        if name in names:
            return names[name]
        last = [n for n in names if n.split()[-1] == name.split()[-1]]
        return names[last[0]] if len(last) == 1 else None
    return scorecard_points(card, pid, roles, list(names.values()))


def check(model: Model, cov: dict, fixture: dict, card: dict, n: int = 20000) -> dict:
    """Picks made as the match centre makes them (same simulations as publish), scored on the scorecard."""
    spec, scenario = spec_from_dict(cov)
    names = {nm: pid for ft, ct in zip(fixture["teams"], cov["teams"]) for nm, pid in zip(ft["players"], ct["players"])}
    label = {pid: nm for nm, pid in names.items()}
    roles = {pid: str(r).upper() for ft, ct in zip(fixture["teams"], cov["teams"])
             for pid, r in zip(ct["players"], ft.get("roles") or []) if r}
    f = fantasy_picks(model, simulate(model, spec, n=n, scenario=scenario, seed=0), roles or None, k=20)
    for pid, row in f["players"].items():
        row["name"] = label.get(pid, pid)
    roles = {p: r["role"] for p, r in f["players"].items()}
    team_of = {p: r["team"] for p, r in f["players"].items()}
    exp = {p: r["expected"] for p, r in f["players"].items()}
    use_roles = roles if any(r == "WK" for r in roles.values()) else None
    real = card_points(card, names, roles)
    best = pick_xi(real, team_of, use_roles)
    one = f["single"]
    xi, c, vc = one["players"], one["captain"], one["vice_captain"]
    out = {"best": {"xi": sorted(best[0], key=lambda p: -real[p]), "c": best[1], "vc": best[2],
                    "points": team_points(*best, real)},
           "ours": {"xi": xi, "c": c, "vc": vc, "points": team_points(xi, c, vc, real)},
           "expected": exp, "real": real, "label": label, "team_of": team_of, "roles": roles,
           "picks": {**f, "teams": f["teams"][:5]}}            # what the match centre would have shown
    rc = sorted(xi, key=lambda p: -real[p])
    out["ours_hindsight_captain"] = team_points(xi, rc[0], rc[1], real)
    got = [team_points(t["players"], t["captain"], t["vice_captain"], real) for t in f["teams"]]
    out["sets"] = {k: max(got[:k]) for k in (5, 10, 20)}
    out["teams"] = [{"xi": t["players"], "c": t["captain"], "vc": t["vice_captain"], "points": g}
                    for t, g in zip(f["teams"], got)]
    return out


@click.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--coverage", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--fixture", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--result", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--n", default=20000)
@click.option("--picks-out", type=click.Path(path_type=Path), default=None,
              help="Also write the picks (one XI + five teams) for the Results page, e.g. cricsim/fantasy/<id>.json")
def main(model_dir: Path, coverage: Path, fixture: Path, result: Path, n: int, picks_out: Path | None) -> None:
    fx, card = json.loads(fixture.read_text()), json.loads(result.read_text())
    r = check(Model.load(model_dir), json.loads(coverage.read_text()), fx, card, n)
    if picks_out:
        picks_out.parent.mkdir(parents=True, exist_ok=True)
        picks_out.write_text(json.dumps(r["picks"], indent=1) + "\n")
    lab, real, exp, tm = r["label"], r["real"], r["expected"], r["team_of"]
    teams = [t["short"] if t.get("short") else t["name"] for t in fx["teams"]]
    best = r["best"]["points"]
    L = [f"## Fantasy check · {fx['title']} · {fx['date']}", "", f"Result: {card.get('result', '')}", "",
         "| Pick | Points | Share of best XI |", "|---|---|---|",
         f"| Best possible XI (hindsight) | {best:.0f} | 100% |",
         f"| Our XI (pre-match) | {r['ours']['points']:.0f} | {100 * r['ours']['points'] / best:.1f}% |",
         f"| Our XI, hindsight captain | {r['ours_hindsight_captain']:.0f} | "
         f"{100 * r['ours_hindsight_captain'] / best:.1f}% |"]
    L += [f"| Best of {k} teams | {v:.0f} | {100 * v / best:.1f}% |" for k, v in r["sets"].items()]
    for title, side, key in (("Our XI", r["ours"], exp), ("Best possible XI", r["best"], real)):
        L += ["", f"### {title}", "", "| Player | Team | Role | Expected | Real |", "|---|---|---|---|---|"]
        for p in side["xi"]:
            tag = " (C)" if p == side["c"] else " (VC)" if p == side["vc"] else ""
            L.append(f"| {lab[p]}{tag} | {teams[tm[p]]} | {r['roles'].get(p, '')} | {exp[p]:.0f} | {real[p]:.0f} |")
    L += ["", "### Team set (in the order the set adds them: the first 5 are the 5-team set, the first 10 the 10-team set)",
          "", "| # | Captain | Vice-captain | Other players | Points | Share of best XI |", "|---|---|---|---|---|---|"]
    for i, t in enumerate(r["teams"], 1):
        rest = ", ".join(lab[p] for p in t["xi"] if p not in (t["c"], t["vc"]))
        L.append(f"| {i} | {lab[t['c']]} | {lab[t['vc']]} | {rest} | {t['points']:.0f} | "
                 f"{100 * t['points'] / best:.1f}% |")
    L += ["", "### Everyone (real points)", "", "| Player | Team | Expected | Real |", "|---|---|---|---|"]
    L += [f"| {lab[p]} | {teams[tm[p]]} | {exp[p]:.0f} | {real[p]:.0f} |" for p in sorted(real, key=lambda q: -real[q])]
    click.echo("\n".join(L))


if __name__ == "__main__":
    main()
