"""Calibrated fantasy picks, judged fairly: the simulations reweighted (favourite wins log-odds x s; the bottom
third of first-innings totals counted x b) before picking the XI. The setting is chosen on the older half of the
backtest's matches and judged only on the newer half, against the live rule (s = 1.2, b = 1). Also: the best of
five teams from the reliable script parts (winner x first-innings third) against the live five-team set.

python -m cricsim.fantasy_cal data/lab/T20.json
"""
from __future__ import annotations

import json

import click
import numpy as np

LIVE = "cal_1.2_1.0"


def _paired(a: np.ndarray, b: np.ndarray) -> str:
    d = a - b
    rng = np.random.default_rng(0)
    boot = [d[rng.integers(len(d), size=len(d))].mean() for _ in range(2000)]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    return f"{d.mean():+.1f} ({lo:+.1f} to {hi:+.1f}) · better {int((d > 0).sum())} / worse {int((d < 0).sum())} of {len(d)}"


@click.command()
@click.argument("report", type=click.Path(exists=True))
def main(report: str) -> None:
    rows = sorted(json.load(open(report))["fantasy"].get("cal_rows") or [], key=lambda r: r["date"])
    if len(rows) < 20:
        click.echo("too few matches")
        return
    keys = [k for k in rows[0] if k.startswith("cal_")]
    half = len(rows) // 2
    old, new = rows[:half], rows[half:]
    share = lambda rs, k: 100 * np.mean([r[k] for r in rs]) / np.mean([r["best"] for r in rs])
    L = [f"## Calibrated fantasy picks ({report}: {len(rows)} matches; older {len(old)} to choose, newer {len(new)} to judge)",
         "", "| Favourite stretch s | Low-total boost b | Older half | Newer half |", "|---|---|---|---|"]
    for k in keys:
        s, b = k.split("_")[1:]
        mark = " (live)" if k == LIVE else ""
        L.append(f"| {s}{mark} | {b} | {share(old, k):.1f}% | {share(new, k):.1f}% |")
    pick = max(keys, key=lambda k: np.mean([r[k] for r in old]))
    s, b = pick.split("_")[1:]
    arr = lambda rs, k: np.array([r[k] for r in rs])
    L += ["", f"Chosen on the older half: **s = {s}, b = {b}**", "",
          f"- Newer half, chosen v live XI: {_paired(arr(new, pick), arr(new, LIVE))} points a match",
          f"- Newer half, chosen v plain mean (s = 1, b = 1): {_paired(arr(new, pick), arr(new, 'cal_1.0_1.0'))}"]
    both = [r for r in rows if r.get("portfolio_5") is not None]
    if both:
        L += [f"- All matches, best of 5 reliable-script teams v best of live 5-team set: "
              f"{_paired(arr(both, 'reliable_top5_best'), arr(both, 'portfolio_5'))} "
              f"({share(both, 'reliable_top5_best'):.1f}% v {share(both, 'portfolio_5'):.1f}% of the best XI)"]
    click.echo("\n".join(L))


if __name__ == "__main__":
    main()
