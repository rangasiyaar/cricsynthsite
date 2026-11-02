"""Coverage index in fantasy picks: each player's expected balls in action (faced + bowled) from the simulations.
Strategies against the live XI: the most-covered XI, expected points x coverage^k, and a coverage captain. The
setting is chosen on the older half of the backtest's matches and judged on the newer half. Also how well the
index matched real time in action, and whether it explains real points beyond expected points.

python -m cricsim.fantasy_coverage data/lab/T20.json
"""
from __future__ import annotations

import json

import click
import numpy as np


def _paired(a: np.ndarray, b: np.ndarray) -> str:
    d = a - b
    rng = np.random.default_rng(0)
    boot = [d[rng.integers(len(d), size=len(d))].mean() for _ in range(2000)]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    return f"{d.mean():+.1f} ({lo:+.1f} to {hi:+.1f}) · better {int((d > 0).sum())} / worse {int((d < 0).sum())} of {len(d)}"


@click.command()
@click.argument("report", type=click.Path(exists=True))
def main(report: str) -> None:
    rows = sorted(json.load(open(report))["fantasy"].get("cov_rows") or [], key=lambda r: r["date"])
    if len(rows) < 20:
        click.echo("too few matches")
        return
    keys = ["live", "cov_xi", "cov_blend_0.25", "cov_blend_0.5", "cov_blend_1.0", "cov_captain"]
    half = len(rows) // 2
    old, new = rows[:half], rows[half:]
    share = lambda rs, k: 100 * np.mean([r[k] for r in rs]) / np.mean([r["best"] for r in rs])
    arr = lambda rs, k: np.array([r[k] for r in rs])
    m = lambda k: np.mean([r[k] for r in rows if k in r])
    L = [f"## Coverage index ({report}: {len(rows)} matches; older {len(old)} to choose, newer {len(new)} to judge)", "",
         f"- Index v real balls in action (per match, across the 22 players): correlation **{m('corr_cov_actual'):.2f}**",
         f"- Real balls in action v real fantasy points: correlation {m('corr_actual_points'):.2f}",
         f"- Index v real points *beyond* expected points (partial correlation): **{m('partial_cov_points'):+.3f}** "
         "(near 0: expected points already carry it)", "",
         "| Strategy | Older half | Newer half |", "|---|---|---|"]
    for k in keys:
        L.append(f"| {k} | {share(old, k):.1f}% | {share(new, k):.1f}% |")
    cands = [k for k in keys if k != "live"]
    pick = max(cands, key=lambda k: np.mean([r[k] for r in old]))
    L += ["", f"Best on the older half: **{pick}**", "",
          f"- Newer half, {pick} v live XI: {_paired(arr(new, pick), arr(new, 'live'))} points a match",
          f"- All matches, coverage-only XI v live XI: {_paired(arr(rows, 'cov_xi'), arr(rows, 'live'))}"]
    click.echo("\n".join(L))


if __name__ == "__main__":
    main()
