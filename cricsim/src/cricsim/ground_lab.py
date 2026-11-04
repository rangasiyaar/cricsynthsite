"""Do the fantasy pages' reads predict anything? A check on past matches before the pages lean on them.

Ground profiles and similar grounds are built from the seasons before a cutoff only. Then, for every player in every
later match (same format and gender) with at least 10 earlier matches:
- usual    = their mean fantasy points over their last 30 matches before the match;
- form     = mean of the last 5 minus the 25 before them;
- fit      = their mean at this ground and the grounds that play like it minus their mean everywhere (last 5 years,
             same format), pulled towards zero with a pseudo-count of 6 matches (as on the pages);
- ground   = the same with this ground only (the plain "record here" read, for comparison).
Each is compared with what the player scored in the match minus their usual level: a read that knows something
should line up with it (correlation above zero, with a bootstrap 95% interval over matches that stays above zero),
and players with a clearly good read should beat their usual level on average.

    python -m cricsim.ground_lab --parquet data/parquet --cutoff 2025-01-01 --format T20
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import click
import duckdb
import numpy as np

from cricsim import fantasy_history as fh
from cricsim import grounds
from cricsim.venue_intel import FIT_K, FIT_YEARS, YEARS, _tbl


def _fit(x, mids, dates, day, where, fmt, group, start):
    keep = [(v, m) for v, m, d in zip(x, mids, dates) if d >= start and where.get(m, (None, None))[1] == fmt]
    if len(keep) < 8:
        return None
    allp = np.array([v for v, _ in keep])
    here = np.array([v for v, m in keep if where[m][0] in group])
    if len(here) < 3:
        return None
    return float(here.mean() - allp.mean()) * len(here) / (len(here) + FIT_K)


def _ci(a: np.ndarray, b: np.ndarray, cl: np.ndarray, reps: int = 400, seed: int = 0) -> tuple[float, float, float]:
    """Correlation of a and b, with a bootstrap 95% interval resampling whole matches."""
    r = float(np.corrcoef(a, b)[0, 1])
    rng, ids = np.random.default_rng(seed), np.unique(cl)
    idx = {c: np.flatnonzero(cl == c) for c in ids}
    out = []
    for _ in range(reps):
        pick = np.concatenate([idx[c] for c in rng.choice(ids, len(ids))])
        out.append(np.corrcoef(a[pick], b[pick])[0, 1])
    lo, hi = np.percentile(out, [2.5, 97.5])
    return r, float(lo), float(hi)


def run(parquet: Path, cutoff: date, fmt: str, until: date | None = None, memory: str = "4GB") -> str:
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    fam = "OD" if fmt == "OD" else "T20"
    hist = fh.build(con, parquet, fam)
    where = {m: (v, f) for m, v, f in con.execute(f"SELECT match_id, venue_id, format FROM {_tbl(parquet, 'matches')}").fetchall()}
    lines = [f"## Fantasy reads v what happened: {fmt}, matches from {cutoff}", ""]
    for gender in ("male", "female"):
        prof = grounds.build(con, parquet, fmt, gender, cutoff - timedelta(days=round(365.25 * YEARS)), cutoff)
        sim = {v: {v, *(s for s, _ in prof.similar(v))} for v in prof.z}
        matches = con.execute(f"""
            SELECT match_id, match_date, venue_id FROM {_tbl(parquet, 'matches')}
            WHERE format = $f AND gender = $g AND match_date >= $c {"AND match_date < $u" if until else ""}""",
            {"f": fmt, "g": gender, "c": cutoff, **({"u": until} if until else {})}).fetchall()
        mset = {m: (d, v) for m, d, v in matches}
        rows = []                      # residual, form, fit, ground, usual, match index
        for p, mids in hist.matches.items():
            pts, dates = hist.points[p], hist.dates[p]
            for i, m in enumerate(mids):
                if m not in mset or i < 10:
                    continue
                day, vid = mset[m]
                x = pts[:i]
                usual = float(x[-30:].mean())
                form = float(x[-5:].mean() - x[-30:-5].mean())
                start = day - timedelta(days=round(365.25 * FIT_YEARS))
                fit = _fit(x, mids[:i], dates[:i], day, where, fmt, sim.get(vid, set()), start) if vid in sim else None
                gr = _fit(x, mids[:i], dates[:i], day, where, fmt, {vid}, start)
                rows.append((pts[i] - usual, form, fit, gr, usual, hash(m) % 10**9))
        if not rows:
            continue
        res = np.array([r[0] for r in rows])
        cl = np.array([r[5] for r in rows])
        lines += [f"### {'Men' if gender == 'male' else 'Women'}: {len(mset)} matches, {len(rows)} player-matches, "
                  f"{len(prof.values)} grounds profiled", "",
                  "| Read | Player-matches | Correlation with points above usual (95% interval) | Clearly good read: points above usual | Clearly poor read |",
                  "|---|---:|---|---:|---:|"]
        for name, k, cut in (("Form (last 5 v the 25 before)", 1, 8.0), ("Suits ground (here + similar grounds)", 2, 4.0),
                             ("Record at this ground only", 3, 4.0)):
            ok = np.array([r[k] is not None for r in rows])
            if ok.sum() < 200:
                lines.append(f"| {name} | {int(ok.sum())} | too few | | |")
                continue
            v = np.array([r[k] for r, o in zip(rows, ok) if o], dtype=float)
            r, lo, hi = _ci(v, res[ok], cl[ok])
            good, poor = res[ok][v >= cut], res[ok][v <= -cut]
            lines.append(f"| {name} | {int(ok.sum())} | {r:+.3f} ({lo:+.3f} to {hi:+.3f}) | "
                         f"{good.mean():+.1f} (n {len(good)}) | {poor.mean():+.1f} (n {len(poor)}) |")
        lines.append("")
    lines += ["A read is worth using when its interval stays above zero and the clearly-good group beats the "
              "clearly-poor one. Usual level = mean of the player's last 30 matches."]
    return "\n".join(lines)


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--cutoff", type=click.DateTime(["%Y-%m-%d"]), default="2025-01-01")
@click.option("--until", type=click.DateTime(["%Y-%m-%d"]), default=None)
@click.option("--format", "fmt", default="T20")
@click.option("--memory", default="4GB")
def main(parquet: Path, cutoff, until, fmt: str, memory: str) -> None:
    click.echo(run(parquet, cutoff.date(), fmt, until.date() if until else None, memory))


if __name__ == "__main__":
    main()
