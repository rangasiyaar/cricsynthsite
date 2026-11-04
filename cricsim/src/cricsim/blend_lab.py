"""Blend lab: would the fantasy XI have done better picked from a weighted average of the fantasy and MVP rankings?

For every published match we have scored (the forecast as it was before the start, fetched from the live site, and
its scorecard in cricsim/results), each player gets
- a fantasy rank (1 = most expected fantasy points, the published number the picks use) and
- an MVP rank (1 = highest site MVP rating, cricsim.engine.mvp_backtest.site_mvp, the port of app/lib/ratings.ts),
and for a weight w on the fantasy rank, blended rank = w × fantasy rank + (1 − w) × MVP rank.
The XI is the best 11 on the blended rank under the usual team rules (optionally only from the top 15 of it), with
captain and vice-captain the two best blended. Each XI is scored with the real points from the scorecard, as a share
of the best possible XI picked after the match (the results page's measure). w = 1 is today's pick.

    python -m cricsim.blend_lab --fixtures cricsim/fixtures --scorecards cricsim/results
"""
from __future__ import annotations

import json
from pathlib import Path

import click
import numpy as np

from cricsim.engine.mvp_backtest import site_mvp
from cricsim.fantasy import pick_xi, scorecard_points, team_points, top_pool
from cricsim.results import SITES, Roster, _fetch

WEIGHTS = (1.0, 0.85, 0.7, 0.5, 0.3, 0.0)


def _ranks(score: dict[str, float]) -> dict[str, int]:
    return {p: i + 1 for i, p in enumerate(sorted(score, key=lambda p: -score[p]))}


def match_rows(doc: dict, card: dict, fixture: dict | None, weights=WEIGHTS) -> dict | None:
    f = doc.get("fantasy")
    if not f or not card.get("innings") or card.get("abandoned"):
        return None
    players = list(f["players"])
    roles = {p: r.get("role") for p, r in f["players"].items()}
    team_of = {p: r["team"] for p, r in f["players"].items()}
    use_roles = roles if any(r == "WK" for r in roles.values()) else None
    got = scorecard_points(card, Roster(doc, fixture).player, roles, players, od=f.get("format") == "OD")
    real = {p: got.get(p, 4.0) for p in players}
    bxi, bc, bvc = pick_xi(real, team_of, use_roles)
    best = team_points(bxi, bc, bvc, real)
    if best <= 0:
        return None
    exp = {p: f["players"][p]["expected"] for p in players}
    mvp = site_mvp(doc["summary"])
    mvp = {p: mvp.get(p, 0.0) for p in players}
    rf, rm = _ranks(exp), _ranks(mvp)
    out = {"id": doc["match"]["id"], "format": f.get("format"), "best": best,
           "published": team_points(f["single"]["players"], f["single"]["captain"], f["single"]["vice_captain"], real) / best}
    for w in weights:
        # lower blended rank is better; expected points break ties
        score = {p: -(w * rf[p] + (1 - w) * rm[p]) + 1e-6 * exp[p] for p in players}
        for pooled in (False, True):
            pool = top_pool(score, team_of, use_roles) if pooled else players
            xi, c, vc = pick_xi({p: score[p] for p in pool}, team_of, use_roles)
            out[(w, pooled)] = team_points(xi, c, vc, real) / best
    return out


def run(fixtures: Path, scorecards: Path, sites=SITES, fetch=_fetch, weights=WEIGHTS) -> str:
    fx = {json.loads(p.read_text())["id"]: json.loads(p.read_text()) for p in sorted(fixtures.glob("*.json"))}
    rows = []
    for p in sorted(scorecards.glob("*.json")):
        card = json.loads(p.read_text())
        doc = fetch(f"matches/{card['id']}.json", sites)
        if doc is None:
            continue
        r = match_rows(doc, card, fx.get(card["id"]), weights)
        if r:
            rows.append(r)
    if not rows:
        return "No scored matches with published fantasy picks."
    base = np.array([r[(1.0, False)] for r in rows])
    lines = [f"## Fantasy XI from a blend of the fantasy and MVP rankings: {len(rows)} scored matches", "",
             f"Published single XI (as it went out): **{np.mean([r['published'] for r in rows]):.1%}** of the best possible XI on average.",
             "", "| Weight on fantasy rank | MVP weight | Share of best XI (all 22) | Wins / losses v fantasy only | Share of best XI (top 15 of the blend) |",
             "|---:|---:|---:|---:|---:|"]
    for w in weights:
        a = np.array([r[(w, False)] for r in rows])
        b = np.array([r[(w, True)] for r in rows])
        win, loss = int((a > base + 1e-9).sum()), int((a < base - 1e-9).sum())
        lines.append(f"| {w:.2f} | {1 - w:.2f} | {a.mean():.1%} (median {np.median(a):.1%}) | {win} / {loss} | {b.mean():.1%} |")
    for fam in ("T20", "OD"):
        sub = [r for r in rows if (r["format"] == "OD") == (fam == "OD")]
        if len(sub) >= 5:
            best_w = max(weights, key=lambda w: np.mean([r[(w, False)] for r in sub]))
            lines.append(f"\n{fam}-type ({len(sub)} matches): fantasy only {np.mean([r[(1.0, False)] for r in sub]):.1%}, "
                         f"best blend w = {best_w:.2f} at {np.mean([r[(best_w, False)] for r in sub]):.1%}")
    lines += ["", "Single XI only (the five-team set needs the simulations, which the published page doesn't keep). "
              "Weight 1.00 = today's pick; small samples: a gap under 2 points is noise."]
    return "\n".join(lines)


@click.command()
@click.option("--fixtures", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--scorecards", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/results"))
def main(fixtures: Path, scorecards: Path) -> None:
    click.echo(run(fixtures, scorecards))


if __name__ == "__main__":
    main()
