"""How much of the best possible fantasy XI our pre-match picks captured in a finished match.

    python -m cricsim.fantasy_check --model data/models/latest --coverage data/coverage/matches/<id>.json \
        --fixture cricsim/fixtures/<id>.json --result cricsim/results/<id>.json

The picks are made from the simulations exactly as the fantasy endpoints make them (one XI with captain and
vice-captain, and sets of 5 / 10 / 20 teams); the real points come from the scorecard with the same table,
fielding included.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import click
import numpy as np

from cricsim.engine.io import spec_from_dict
from cricsim.engine.model import Model
from cricsim.engine import modelling as M
from cricsim.fantasy import batting_points, bowling_points, decisive_mean, pick_xi, portfolio, team_points

RETIRED = ("retired hurt", "retired not out")


def _balls(overs: str) -> int:
    o, _, b = str(overs).partition(".")
    return int(o) * 6 + int(b or 0)


def card_points(card: dict, names: dict[str, str], roles: dict[str, str]) -> dict[str, float]:
    """Real points per player id from a results file (names as on the scorecard; `names` maps them to ids)."""
    def pid(name: str | None) -> str | None:
        if not name:
            return None
        name = re.sub(r"^\(sub\)", "", name.strip())
        if name in names:
            return names[name]
        last = [n for n in names if n.split()[-1] == name.split()[-1]]
        return names[last[0]] if len(last) == 1 else None

    pts = {p: 4.0 for p in names.values()}
    catches: dict[str, int] = {}
    for inn in card["innings"]:
        bl_lbw: dict[str, int] = {}
        for b in inn["batting"]:
            p, d = pid(b["name"]), b["dismissal"].strip()
            out = d not in ("", "not out") and d not in RETIRED
            if p:
                pts[p] += float(batting_points(b["runs"], b["balls"], b["fours"], b["sixes"], out,
                                               roles.get(p) == "BOWL"))
            if m := re.match(r"^(?:b|lbw b) (.+)$", d):
                bl_lbw[m.group(1)] = bl_lbw.get(m.group(1), 0) + 1
            if m := re.match(r"^c (?:and|&) b (.+)$", d):
                who = pid(m.group(1))
            elif m := re.match(r"^c (.+?) b .+$", d):
                who = pid(m.group(1))
            else:
                who = None
            if who:
                catches[who] = catches.get(who, 0) + 1
            if (m := re.match(r"^st (.+?) b .+$", d)) and pid(m.group(1)):
                pts[pid(m.group(1))] += 12
            if m := re.match(r"^run out \((.+)\)$", d):
                fs = [pid(x) for x in m.group(1).split("/")]
                for f in fs:
                    if f:
                        pts[f] += 12 if len(fs) == 1 else 6
        for b in inn["bowling"]:
            p = pid(b["name"])
            if p:
                pts[p] += float(bowling_points(_balls(b["overs"]), b["runs"], b["wickets"], bl_lbw.get(b["name"], 0)))
    for who, n in catches.items():
        pts[who] += 8 * n + (4 if n >= 3 else 0)
    return pts


def check(model: Model, cov: dict, fixture: dict, card: dict, n: int = 20000) -> dict:
    spec, _ = spec_from_dict(cov)
    names = {nm: pid for ft, ct in zip(fixture["teams"], cov["teams"]) for nm, pid in zip(ft["players"], ct["players"])}
    label = {pid: nm for nm, pid in names.items()}
    roles = {pid: r for ft, ct in zip(fixture["teams"], cov["teams"])
             for pid, r in zip(ct["players"], ft.get("roles") or [])}
    _, (pids, pts, roles, team_of, win) = M.fantasy_projections(model, spec, roles, n)
    use_roles = roles if any(r == "WK" for r in roles.values()) else None
    real = card_points(card, names, roles)
    best = pick_xi(real, team_of, use_roles)
    best_pts = team_points(*best, real)
    exp = dict(zip(pids, decisive_mean(pts, win)))
    xi, c, vc = pick_xi(exp, team_of, use_roles)
    out = {"best": {"xi": sorted(best[0], key=lambda p: -real[p]), "c": best[1], "vc": best[2], "points": best_pts},
           "ours": {"xi": sorted(xi, key=lambda p: -exp[p]), "c": c, "vc": vc,
                    "points": team_points(xi, c, vc, real)},
           "expected": exp, "real": real, "label": label, "team_of": team_of, "roles": roles}
    rc = sorted(xi, key=lambda p: -real[p])
    out["ours_hindsight_captain"] = team_points(xi, rc[0], rc[1], real)
    teams = portfolio(pids, pts, team_of, k=20, roles=use_roles, captains=5)
    got = [team_points(*t, real) for t in teams]
    out["sets"] = {k: max(got[:k]) for k in (5, 10, 20)}
    return out


@click.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--coverage", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--fixture", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--result", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--n", default=20000)
def main(model_dir: Path, coverage: Path, fixture: Path, result: Path, n: int) -> None:
    fx, card = json.loads(fixture.read_text()), json.loads(result.read_text())
    r = check(Model.load(model_dir), json.loads(coverage.read_text()), fx, card, n)
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
    L += ["", "### Everyone (real points)", "", "| Player | Team | Expected | Real |", "|---|---|---|---|"]
    L += [f"| {lab[p]} | {teams[tm[p]]} | {exp[p]:.0f} | {real[p]:.0f} |" for p in sorted(real, key=lambda q: -real[q])]
    click.echo("\n".join(L))


if __name__ == "__main__":
    main()
