"""Level audit: is the model's scoring level right for each kind of cricket, in sample and out of sample?

    python -m cricsim.engine.level_audit --parquet data/parquet --cutoff 2025-01-01

Observed ÷ model runs, boundaries and dismissals per ball, by format family × gender × international / club,
for the last year before the cutoff (in sample: the model saw these balls) and after it (held out, with the
projected season level the simulator uses). A gap held out but not in sample is drift the season trend missed;
a gap in both is structural. Then: other ways of projecting the season level, scored by held-out log-loss, and
where in the innings a one-day gap sits.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from pathlib import Path

import click
import duckdb
import numpy as np

from cricsim.engine import states as S
from cricsim.engine.fit import FitConfig, fit, level_indices, load_training
from cricsim.engine.model import ERA_AHEAD, FORMAT_LIST, N_ERA, Model
from cricsim.engine.venue_diag import _remap

log = logging.getLogger(__name__)

FAMILIES = ("short", "one-day")
TEAM_TYPES = ("international", "club", "?")


def score(con, model: Model, start: date, end: date | None) -> dict:
    """Balls in [start, end): logits without the season level, the season index, and the split keys."""
    d, ids = load_training(con, FitConfig(min_date=start, cutoff=end))
    tt = np.asarray(ids["comp_group"])[d["comp"]] // (len(FORMAT_LIST) * 2)
    _remap(d, ids, model)
    f = model.factors
    levels = level_indices(d, len(model.players), len(model.venues), len(model.comps))
    L = np.zeros((len(d["y"]), S.K), dtype=np.float32)
    for name, (idx, _) in levels.items():
        if name != "era":
            L += f[name][idx]
    return {"L": L, "era_idx": np.minimum(levels["era"][0], 2 * N_ERA - 1), "fam": d["fam"].astype(np.int64),
            "gender": d["gender"].astype(np.int64), "tt": np.clip(tt, 0, 2), "y": d["y"].astype(np.int64),
            "runs": d["runs_total"].astype(np.float64), "day": d["day"], "over": d["over"].astype(np.int64),
            "wkts": d["wkts"].astype(np.int64), "fmt": d["fmt"], "inn0": d["inn0"].astype(np.int64),
            "chase": S.chase_bucket(d["inn0"] + 1, d["need"], d["balls_left"]), "need": d["need"]}


def projections(model: Model, fam: int) -> dict[str, np.ndarray]:
    """Ways of projecting the season level for the coming months (log-multipliers per outcome)."""
    f = model.factors["era"]
    fit_ = model.meta.get("fit", {})
    i = int(fit_.get("era_index", N_ERA - 1))
    balls = np.asarray(fit_.get("era_balls", [[1.0] * N_ERA] * 2)[fam], dtype=np.float64)
    asof = fit_.get("era_asof", i + 1.0)
    frac = asof - i                                                # share of the latest season already played

    def line(n: int, ahead: float) -> np.ndarray:
        seasons = np.arange(max(0, i - n + 1), i + 1)
        y = f[fam * N_ERA + seasons].astype(np.float64)
        w = balls[seasons] / max(balls[seasons].max(), 1.0) + 1e-6
        x = seasons + 0.5
        xm, ym = (w * x).sum() / w.sum(), (w[:, None] * y).sum(0) / w.sum()
        slope = (w[:, None] * (x - xm)[:, None] * (y - ym)).sum(0) / (w * (x - xm) ** 2).sum()
        return ym + slope * (asof + ahead - xm)

    last_full = f[fam * N_ERA + (i if frac > 0.5 else i - 1)].astype(np.float64)
    blend = (frac * f[fam * N_ERA + i] + (1 - frac) * f[fam * N_ERA + i - 1]).astype(np.float64)
    return {"trend, 4 seasons (today)": line(4, ERA_AHEAD), "trend, 3 seasons": line(3, ERA_AHEAD),
            "trend, 6 seasons": line(6, ERA_AHEAD), "trend, 4 seasons, aimed at now": line(4, 0.0),
            "latest season (blended by share played)": blend, "last full season": last_full}


def _ll(L: np.ndarray, y: np.ndarray) -> float:
    m = L.max(1, keepdims=True)
    return float((np.log(np.exp(L - m).sum(1)) + m[:, 0] - L[np.arange(len(y)), y]).mean())


def _probs(L: np.ndarray) -> np.ndarray:
    P = np.exp(L - L.max(1, keepdims=True))
    return P / P.sum(1, keepdims=True)


def _oe(b: dict, P: np.ndarray, k: np.ndarray, run_mean: np.ndarray) -> str:
    if k.sum() < 500:
        return "| – | – | – |"
    y, Pk = b["y"][k], P[k]
    runs = b["runs"][k].sum() / (Pk @ run_mean).sum()
    bnd = np.isin(y, [S.FOUR, S.SIX]).sum() / (Pk[:, S.FOUR] + Pk[:, S.SIX]).sum()
    wkt = (y == S.WKT).sum() / Pk[:, S.WKT].sum()
    return f"| {runs:.3f} | {bnd:.3f} | {wkt:.3f} |"


def run(parquet: Path, cutoff: date, memory: str) -> str:
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    model = fit(parquet, FitConfig(cutoff=cutoff), memory=memory, con=con)
    f = model.factors["era"]
    pre = score(con, model, cutoff - timedelta(days=365), cutoff)
    post = score(con, model, cutoff, None)
    proj = {fam: projections(model, fam) for fam in (0, 1)}
    today = "trend, 4 seasons (today)"
    Lpre = pre["L"] + f[pre["era_idx"]]
    Lpost = post["L"] + np.stack([proj[0][today], proj[1][today]]).astype(np.float32)[post["fam"]]
    Ppre, Ppost = _probs(Lpre), _probs(Lpost)
    run_mean = np.bincount(post["y"], weights=post["runs"], minlength=S.K) / \
        np.maximum(np.bincount(post["y"], minlength=S.K), 1)

    out = [f"### Level audit: model fitted before {cutoff}", "",
           f"Observed ÷ model per ball. In sample = the year before the cutoff ({len(Lpre):,} balls); held out = "
           f"after it ({len(Lpost):,} balls), with the projected season level.", "",
           "| Family | Gender | Teams | In-sample runs | boundaries | dismissals | Held-out runs | boundaries | dismissals |",
           "|---|---|---|---|---|---|---|---|---|"]
    for fam in (0, 1):
        for g, gname in ((0, "men"), (1, "women")):
            for t in (0, 1):
                kp = (pre["fam"] == fam) & (pre["gender"] == g) & (pre["tt"] == t)
                kq = (post["fam"] == fam) & (post["gender"] == g) & (post["tt"] == t)
                out.append(f"| {FAMILIES[fam]} | {gname} | {TEAM_TYPES[t]} " + _oe(pre, Ppre, kp, run_mean)[:-1]
                           + _oe(post, Ppost, kq, run_mean))

    out += ["", "#### Projecting the season level", "",
            "Held-out log-loss per ball ×1000, change against today's projection (negative = better); and held-out "
            "observed ÷ model dismissals with each.", "",
            "| Projection | short Δ | one-day Δ | short dismissals O/E | one-day dismissals O/E |", "|---|---|---|---|---|"]
    base = {fam: _ll(Lpost[post["fam"] == fam], post["y"][post["fam"] == fam]) for fam in (0, 1)
            if (post["fam"] == fam).any()}
    for name in proj[0]:
        cells, wk = [], []
        for fam in (0, 1):
            k = post["fam"] == fam
            if not k.any():
                cells.append("–")
                wk.append("–")
                continue
            L = post["L"][k] + proj[fam][name].astype(np.float32)
            cells.append(f"{1000 * (_ll(L, post['y'][k]) - base[fam]):+.3f}")
            wk.append(f"{(post['y'][k] == S.WKT).sum() / _probs(L)[:, S.WKT].sum():.3f}")
        out.append(f"| {name} | {cells[0]} | {cells[1]} | {wk[0]} | {wk[1]} |")
    i = int(model.meta["fit"].get("era_index", N_ERA - 1))
    out += ["", "Season levels (log-multiplier on dismissals / fours / sixes):", "",
            "| Season | short wkt | short 4 | short 6 | one-day wkt | one-day 4 | one-day 6 |", "|---|---|---|---|---|---|---|"]
    for s in range(max(0, i - 6), i + 1):
        a, b_ = f[s], f[N_ERA + s]
        out.append(f"| {2000 + s} | {a[S.WKT]:+.3f} | {a[S.FOUR]:+.3f} | {a[S.SIX]:+.3f} | {b_[S.WKT]:+.3f} | "
                   f"{b_[S.FOUR]:+.3f} | {b_[S.SIX]:+.3f} |")
    for fam in (0, 1):
        v = proj[fam][today]
        out.append(f"| projected {FAMILIES[fam]} | " + ("– | – | – | " if fam else "")
                   + f"{v[S.WKT]:+.3f} | {v[S.FOUR]:+.3f} | {v[S.SIX]:+.3f} |" + (" – | – | – |" if not fam else ""))

    out += ["", "#### By innings and chase pressure", "",
            "Required runs per over buckets as the ball model sees them (1 = under 6 … 6 = over 15). 'No target' = "
            "second-innings balls whose data has no target, which the model files as an easy chase.", "",
            "| Family | Innings | Chase | In-sample balls | runs | boundaries | dismissals | Held-out balls | runs | boundaries | dismissals |",
            "|---|---|---|---|---|---|---|---|---|---|---|"]
    labels = {0: "first innings", 1: "< 6", 2: "6-8", 3: "8-10", 4: "10-12", 5: "12-15", 6: "15+"}
    for fam in (0, 1):
        for c in range(7):
            kp = (pre["fam"] == fam) & (pre["chase"] == c)
            kq = (post["fam"] == fam) & (post["chase"] == c)
            out.append(f"| {FAMILIES[fam]} | {1 if c == 0 else 2} | {labels[c]} | {kp.sum():,} "
                       + _oe(pre, Ppre, kp, run_mean)[:-1] + f"| {kq.sum():,} " + _oe(post, Ppost, kq, run_mean))
        for b, P_, nm in ((pre, Ppre, "in sample"), (post, Ppost, "held out")):
            k2 = (b["fam"] == fam) & (b["inn0"] == 1)
            nt = k2 & (b["need"] == 0)
            out.append(f"| {FAMILIES[fam]} | 2 | no target ({nm}) | {nt.sum():,} of {k2.sum():,} " + _oe(b, P_, nt, run_mean)
                       + " | | | |")

    od = post["fam"] == 1
    out += ["", "#### Where the one-day gap sits (held out)", "",
            "| Overs | Wickets down | Balls | Runs O/E | Boundaries O/E | Dismissals O/E |", "|---|---|---|---|---|---|"]
    for o0, o1 in ((0, 10), (10, 30), (30, 40), (40, 50)):
        for w0, w1 in ((0, 3), (3, 6), (6, 10)):
            k = od & (post["over"] >= o0) & (post["over"] < o1) & (post["wkts"] >= w0) & (post["wkts"] < w1)
            out.append(f"| {o0 + 1}-{o1} | {w0}-{w1 - 1} | {k.sum():,} " + _oe(post, Ppost, k, run_mean))
    return "\n".join(out)


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), default=Path("data/parquet"))
@click.option("--cutoff", type=click.DateTime(["%Y-%m-%d"]), default="2025-01-01")
@click.option("--memory", default="5GB")
def main(parquet: Path, cutoff, memory: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    click.echo(run(parquet, cutoff.date(), memory))


if __name__ == "__main__":
    main()
