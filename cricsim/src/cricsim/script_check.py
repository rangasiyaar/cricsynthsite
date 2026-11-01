"""How well the simulations predict the match script (winner, first-innings third, powerplay wickets of the side
batting first 0-1 / 2+, close or comfortable finish), from a backtest's fantasy.script_pred rows.

For the whole script: the probability given to what happened, how often it was the top 1 / 3 / 5 pick, and log loss
against a no-model guess (each part at its base rate in these matches, left out one at a time). For each part:
Brier score against the same base-rate guess and a reliability table (predicted v actual by probability band).

python -m cricsim.script_check data/lab/T20.json
"""
from __future__ import annotations

import json
import math

import click
import numpy as np


def _loo(x: np.ndarray) -> np.ndarray:
    """Each match's base rate from the other matches."""
    return (x.sum() - x) / (len(x) - 1)


def _part(name: str, p: np.ndarray, y: np.ndarray) -> list[str]:
    base = _loo(y.astype(float))
    b_model, b_base = float(np.mean((p - y) ** 2)), float(np.mean((base - y) ** 2))
    L = [f"**{name}**: Brier {b_model:.3f} v {b_base:.3f} with no model "
         f"(skill {100 * (1 - b_model / b_base):+.1f}%; happened in {100 * y.mean():.0f}% of matches)", "",
         "| Predicted | Matches | Predicted avg | Happened |", "|---|---|---|---|"]
    edges = [0, .2, .4, .6, .8, 1.0001]
    for lo, hi in zip(edges, edges[1:]):
        m = (p >= lo) & (p < hi)
        if m.sum():
            L.append(f"| {100 * lo:.0f}-{min(100, 100 * hi):.0f}% | {int(m.sum())} | {100 * p[m].mean():.0f}% | "
                     f"{100 * y[m].mean():.0f}% |")
    return L + [""]


@click.command()
@click.argument("report", type=click.Path(exists=True))
def main(report: str) -> None:
    rows = json.load(open(report))["fantasy"].get("script_pred") or []
    if not rows:
        click.echo("no script predictions in the report")
        return
    n = len(rows)
    p = np.array([r["p"] for r in rows])
    rank = np.array([r["rank"] for r in rows])
    pw = np.array([r["p_win"] for r in rows])
    pp2, ypp2 = np.array([r["p_pp2"] for r in rows]), np.array([r["pp2"] for r in rows])
    pcl, ycl = np.array([r["p_close"] for r in rows]), np.array([r["close"] for r in rows])
    band = np.array([r["band"] for r in rows])
    # no-model guess for the exact script: winner 50%, each third 1/3, the two yes/no parts at their base rates
    b_pp2, b_cl = _loo(ypp2.astype(float)), _loo(ycl.astype(float))
    naive = 0.5 * (1 / 3) * np.where(ypp2, b_pp2, 1 - b_pp2) * np.where(ycl, b_cl, 1 - b_cl)
    ll_model = float(-np.mean(np.log(np.maximum(p, 1e-3))))
    ll_naive = float(-np.mean(np.log(naive)))
    L = [f"## Match-script prediction ({report}, {n} matches)", "",
         f"Exact script (24 possible): the model gave what happened **{100 * p.mean():.1f}%** on average "
         f"(its own top script averaged {100 * np.mean([r['top1'] for r in rows]):.1f}%; "
         f"a blind guess {100 * naive.mean():.1f}%)", "",
         "| Real script was the model's | Matches |", "|---|---|"]
    for k in (1, 3, 5, 10):
        L.append(f"| top {k} | {100 * (rank <= k).mean():.0f}% |")
    L += ["", f"Log loss {ll_model:.3f} v {ll_naive:.3f} blind (skill {100 * (1 - ll_model / ll_naive):+.1f}%; "
          f"never-seen scripts {int((p == 0).sum())})", "",
          "### Each part", ""]
    # winner: as the chance given to the side that won (Brier on the favourite)
    fav_p = np.maximum(pw, 1 - pw)
    fav_won = np.array([r["fav_won"] for r in rows])
    L += _part("Favourite wins", fav_p, fav_won)
    L += [f"**First-innings total** (thirds of the simulated totals; a fair model lands a third in each): "
          f"low {100 * (band == 0).mean():.0f}%, middle {100 * (band == 1).mean():.0f}%, "
          f"high {100 * (band == 2).mean():.0f}%", ""]
    L += _part("2+ powerplay wickets for the side batting first", pp2, ypp2)
    L += _part("Close finish", pcl, ycl)
    click.echo("\n".join(L))


if __name__ == "__main__":
    main()
