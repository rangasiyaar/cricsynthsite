"""Player correlation in fantasy: do players rise and fall together, do the simulations know it, and do teams built
on it do better? Reads the backtest's fantasy.corr_rows.

Real co-movement per pair type is the average product of the two players' standardised surprises (real points minus
expected, over the simulated spread): positive when they beat (or miss) expectations together. Teams: the live XI
against an upside XI (best simulated 90th percentile of the team total) and a steady XI (best 10th percentile).

python -m cricsim.fantasy_corr data/lab/T20.json
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
    rows = json.load(open(report))["fantasy"].get("corr_rows") or []
    if len(rows) < 20:
        click.echo("too few matches")
        return
    agg: dict[str, list] = {}
    for r in rows:
        for t, (sim, real, n) in r["types"].items():
            a = agg.setdefault(t, [0.0, 0.0, 0, []])
            a[0] += sim * n
            a[1] += real * n
            a[2] += n
            a[3].append(real)
    L = [f"## Player correlation ({report}: {len(rows)} matches)", "",
         "| Pair type | Pairs | Simulated correlation | Real co-movement | 95% range (real) |", "|---|---|---|---|---|"]
    rng = np.random.default_rng(1)
    for t, (s, r, n, per) in sorted(agg.items(), key=lambda kv: -kv[1][2]):
        per = np.array(per)
        boot = [per[rng.integers(len(per), size=len(per))].mean() for _ in range(1000)]
        lo, hi = np.percentile(boot, [2.5, 97.5])
        L.append(f"| {t} | {n} | {s / n:+.3f} | {r / n:+.3f} | {lo:+.3f} to {hi:+.3f} |")
    arr = lambda k: np.array([r[k] for r in rows])
    best = arr("best")
    near = lambda k: 100 * np.mean(arr(k) >= 0.8 * best)
    L += ["", "| Team | Avg points | Share of best | Matches at 80%+ of best |", "|---|---|---|---|"]
    for k, lab in (("live", "Live XI (expected points)"), ("upside", "Upside XI (simulated top 10%)"),
                   ("steady", "Steady XI (simulated bottom 10%)")):
        L.append(f"| {lab} | {arr(k).mean():.1f} | {100 * arr(k).mean() / best.mean():.1f}% | {near(k):.0f}% |")
    if all("profile" in r for r in rows):
        L += ["", "### Profile team: 5 safe (floor) + 4 consistent (typical day) + 2 x factor (ceiling)", "",
              f"Shares {np.mean([r['profile_overlap'] for r in rows]):.1f} of 11 players with the live XI", "",
              "| Team | Avg points | Share of best | Matches at 80%+ of best |", "|---|---|---|---|"]
        for k, lab in (("live", "Live XI"), ("profile", "Profile XI, captain by expected points"),
                       ("profile_xcap", "Profile XI, x factor captain + safe vice-captain")):
            L.append(f"| {lab} | {arr(k).mean():.1f} | {100 * arr(k).mean() / best.mean():.1f}% | {near(k):.0f}% |")
        L += ["", f"- Profile XI v live: {_paired(arr('profile'), arr('live'))} points a match",
              f"- Profile XI (x factor captain) v live: {_paired(arr('profile_xcap'), arr('live'))}"]
    L += ["", f"- Upside v live: {_paired(arr('upside'), arr('live'))} points a match",
          f"- Steady v live: {_paired(arr('steady'), arr('live'))}"]
    click.echo("\n".join(L))


if __name__ == "__main__":
    main()
