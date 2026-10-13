"""Venue diagnostic: what the ball model's one-number-per-ground venue factor misses, out of sample.

    python -m cricsim.engine.venue_diag --parquet data/parquet --cutoff 2025-01-01

Fits the model on balls before the cutoff, then scores every T20 ball before and after it with the fitted
model (the real batter, bowler and match state, exactly as the simulator composes them). Observed ÷ expected
runs, boundaries and wickets are then broken down by ground and

    phase    overs 1-6 / 7-12 / 13-16 / 17-20      (does a ground have its own scoring curve and wicket timing?)
    innings  batting first / chasing               (dew, pitch wearing, chasing ease)
    kind     pace / spin                           (seam- or spin-friendly surfaces)
    gender   men's / women's matches               (boundary ropes differ at the same ground)

For each split two questions are answered:
    excess   within a ground, does the split vary more than chance in the held-out matches? (chi²/df; 1 = chance)
    gain     does the split measured *before* the cutoff predict the split *after* it? Share of that excess
             removed by a shrunk pre-cutoff adjustment (positive = a venue × split factor would help).
Plus: for thin grounds, would borrowing from other grounds in the same city beat shrinking to the global average?
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
from cricsim.engine.model import FORMAT_LIST, N_ERA, Model, era_vector

log = logging.getLogger(__name__)

T20 = FORMAT_LIST.index("T20")
PHASES = ("overs 1-6", "overs 7-12", "overs 13-16", "overs 17-20")
PHASE_EDGES = np.array([6, 12, 16])                      # 0-indexed over → phase 0..3
PACE, SPIN = {1, 2}, {3, 4, 5, 6, 7}
METRICS = ("runs", "boundaries", "wickets")
SHRINKS = (250, 500, 1000, 2000, 4000, 8000)             # balls


# ── scoring balls with the fitted model ───────────────────────────────────────────────────────────────────────────

def _remap(d: dict, ids: dict, model: Model) -> None:
    """Re-index a ball table's players / venues / comps from its own id lists to the model's."""
    for key, look, src in (("bat", model.pid, "players"), ("bowl", model.pid, "players"),
                           ("venue", model.venue, "venues"), ("comp", model.comp, "comps")):
        m = np.array([look(x) if x else 0 for x in ids[src]], dtype=np.int32)
        d[key] = m[d[key]]


def score_balls(con, model: Model, start: date, end: date | None, future: bool) -> dict:
    """T20 balls in [start, end): observed outcome, model probabilities and the split keys."""
    d, ids = load_training(con, FitConfig(min_date=start, cutoff=end))
    keep = d["fmt"] == T20
    d = {k: v[keep] for k, v in d.items()}
    venue_ids = np.array(ids["venues"], dtype=object)[d["venue"]]       # own index → venue id ("" = unknown)
    _remap(d, ids, model)
    f = model.factors
    levels = level_indices(d, len(model.players), len(model.venues), len(model.comps))
    L = np.zeros((len(d["y"]), S.K), dtype=np.float32)
    for name, (idx, _) in levels.items():
        if name == "era" and future:
            L += era_vector(model, 0)                    # what the simulator uses for coming matches
        elif name == "era":
            L += f[name][np.minimum(idx, 2 * N_ERA - 1)]
        else:
            L += f[name][idx]
    L -= L.max(1, keepdims=True)
    P = np.exp(L)
    P /= P.sum(1, keepdims=True)
    return {"venue": venue_ids, "y": d["y"], "runs": d["runs_total"].astype(np.float64), "P": P,
            "phase": np.searchsorted(PHASE_EDGES, d["over"], side="right"), "innings": d["inn0"].astype(int),
            "kind": np.where(np.isin(d["kind"], list(PACE)), 0, np.where(np.isin(d["kind"], list(SPIN)), 1, -1)),
            "gender": d["gender"].astype(int)}


def _per_ball(b: dict, run_mean: np.ndarray) -> dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """metric → (observed, expected, variance) per ball."""
    P, y = b["P"], b["y"]
    er = P @ run_mean
    out = {"runs": (b["runs"], er, P @ run_mean ** 2 - er ** 2)}
    pb = P[:, S.FOUR] + P[:, S.SIX]
    out["boundaries"] = (np.isin(y, [S.FOUR, S.SIX]).astype(float), pb, pb * (1 - pb))
    pw = P[:, S.WKT]
    out["wickets"] = ((y == S.WKT).astype(float), pw, pw * (1 - pw))
    return out


def _cells(b: dict, per: dict, split: str | None, mask: np.ndarray | None = None) -> dict:
    """(venue, split level) → {balls, metric: (O, E, V)}."""
    key = b["venue"].astype(str)
    if split is not None:
        key = np.char.add(np.char.add(key, "|"), b[split].astype(str))
    if mask is not None:
        key = key[mask]
    uniq, inv = np.unique(key, return_inverse=True)
    out = {u: {"balls": 0} for u in uniq}
    n = np.bincount(inv, minlength=len(uniq))
    sums = {m: [np.bincount(inv, weights=(a if mask is None else a[mask]), minlength=len(uniq)) for a in per[m]]
            for m in METRICS}
    for i, u in enumerate(uniq):
        out[u]["balls"] = int(n[i])
        for m in METRICS:
            out[u][m] = tuple(float(s[i]) for s in sums[m])
    return out


# ── the split test ────────────────────────────────────────────────────────────────────────────────────────────────

def split_test(pre: dict, post: dict, split: str, levels: int, min_balls: int) -> dict:
    """Excess within-ground variation of one split after the cutoff, and how much the pre-cutoff split explains."""
    mask_pre = mask_post = None
    if split == "kind":
        mask_pre, mask_post = pre["b"]["kind"] >= 0, post["b"]["kind"] >= 0
    cp, cq = (_cells(x["b"], x["per"], split, mk) for x, mk in ((pre, mask_pre), (post, mask_post)))
    out = {}
    for m in METRICS:
        venues: dict[str, list] = {}
        for key, c in cq.items():
            v, lvl = key.rsplit("|", 1)
            if not v:
                continue
            p = cp.get(key)
            venues.setdefault(v, []).append((int(lvl), c, p))
        rows = []                                      # (venue, level, O, E, V, log rel_pre, balls_pre, balls_post)
        for v, cs in venues.items():
            if len(cs) < 2 or any(c["balls"] < min_balls // levels for _, c, _ in cs):
                continue
            pre_tot = [p for _, _, p in cs if p]
            if len(pre_tot) < len(cs):
                continue
            Op, Ep = sum(p[m][0] for p in pre_tot), sum(p[m][1] for p in pre_tot)
            for lvl, c, p in cs:
                rel_pre = np.log(max(p[m][0], 0.5) / p[m][1]) - np.log(max(Op, 0.5) / Ep)
                rows.append((v, lvl, *c[m], rel_pre, p["balls"], c["balls"]))
        if not rows:
            out[m] = None
            continue
        res = _score_rows(rows)
        res["grounds"] = len({r[0] for r in rows})
        out[m] = res
    return out


def _score_rows(rows: list) -> dict:
    v = np.array([r[0] for r in rows])
    O, E, V, rel, npre, npost = (np.array([r[i] for r in rows], dtype=float) for i in range(2, 8))
    _, inv = np.unique(v, return_inverse=True)
    ng = inv.max() + 1

    def chi2(adj):
        Ea = E * np.exp(adj)
        k = np.bincount(inv, weights=O, minlength=ng) / np.bincount(inv, weights=Ea, minlength=ng)   # ground level
        Eh = Ea * k[inv]
        return float(((O - Eh) ** 2 / np.maximum(V * k[inv] * np.exp(adj), 1e-9)).sum())

    base = chi2(np.zeros_like(E))
    df = len(rows) - ng
    best = min(((chi2(rel * npre / (npre + s)), s) for s in SHRINKS))
    O_ = np.bincount(inv, weights=O, minlength=ng)[inv]
    E_ = np.bincount(inv, weights=E, minlength=ng)[inv]
    rel_post = np.log(np.maximum(O, 0.5) / E) - np.log(O_ / E_)
    w = 1 / (1 / npre + 1 / npost)
    return {"cells": len(rows), "excess": base / max(df, 1), "gain": 1 - best[0] / base if base else 0.0,
            "shrink": best[1], "corr": _wcorr(rel, rel_post, w)}


def _wcorr(a, b, w) -> float:
    am, bm = (w * a).sum() / w.sum(), (w * b).sum() / w.sum()
    cov = (w * (a - am) * (b - bm)).sum()
    den = np.sqrt((w * (a - am) ** 2).sum() * (w * (b - bm) ** 2).sum())
    return float(cov / den) if den else 0.0


# ── thin grounds: borrow from the same city? ─────────────────────────────────────────────────────────────────────

def venue_run_effect(model: Model, p_bar: np.ndarray, run_mean: np.ndarray) -> np.ndarray:
    """Log multiplier on expected runs per ball implied by each ground's fitted venue factor."""
    q = p_bar[None] * np.exp(model.factors["venue"].astype(np.float64))
    q /= q.sum(1, keepdims=True)
    return np.log(q @ run_mean) - np.log(p_bar @ run_mean)


def city_test(post: dict, pre_balls: dict[str, int], cities: dict[str, str], effect: np.ndarray, model: Model,
              shrink: float, min_balls: int) -> dict:
    cells = _cells(post["b"], post["per"], None)
    rows = []
    for v, c in cells.items():
        if not v or c["balls"] < min_balls or pre_balls.get(v, 0) >= 4 * shrink:
            continue
        city = cities.get(v)
        peers = [(u, n) for u, n in pre_balls.items() if u != v and cities.get(u) == city and n >= 1000]
        if not city or not peers:
            continue
        peer = sum(effect[model.venue(u)] * n for u, n in peers) / sum(n for _, n in peers)
        n = pre_balls.get(v, 0)
        rows.append((v, *c["runs"], (1 - n / (n + shrink)) * peer))
    if not rows:
        return {"grounds": 0}
    O, E, V, adj = (np.array([r[i] for r in rows], dtype=float) for i in range(1, 5))
    base = float(((O - E) ** 2 / V).sum())
    new = float(((O - E * np.exp(adj)) ** 2 / (V * np.exp(adj))).sum())
    return {"grounds": len(rows), "excess": base / len(rows), "gain": 1 - new / base,
            "corr": _wcorr(adj, np.log(O / E), np.ones_like(O)),
            "rows": sorted(rows, key=lambda r: -r[1])[:12]}


# ── report ────────────────────────────────────────────────────────────────────────────────────────────────────────

def run(parquet: Path, cutoff: date, years: float, min_balls: int, memory: str) -> str:
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    model = fit(parquet, FitConfig(cutoff=cutoff), memory=memory, con=con)
    start = cutoff - timedelta(days=int(365.25 * years))
    pre_b = score_balls(con, model, start, cutoff, future=False)
    post_b = score_balls(con, model, cutoff, None, future=True)
    obs = np.bincount(post_b["y"], weights=post_b["runs"], minlength=S.K)
    run_mean = obs / np.maximum(np.bincount(post_b["y"], minlength=S.K), 1)
    pre = {"b": pre_b, "per": _per_ball(pre_b, run_mean)}
    post = {"b": post_b, "per": _per_ball(post_b, run_mean)}
    m = (parquet / "matches" / "*.parquet").as_posix()
    meta = {v: (n, c) for v, n, c in con.execute(
        f"SELECT venue_id, any_value(venue), any_value(city) FROM read_parquet('{m}') WHERE venue_id IS NOT NULL "
        "GROUP BY 1").fetchall()}

    out = [f"### Venue diagnostic: T20, model fitted before {cutoff}",
           "", f"Balls scored: {len(pre_b['y']):,} before the cutoff (from {start}), {len(post_b['y']):,} after. "
           f"Grounds need {min_balls:,}+ balls after the cutoff to count.", ""]

    # ground level: does the flat venue factor carry forward?
    cq = _cells(post_b, post["per"], None)
    rows = [(v, c) for v, c in cq.items() if v and c["balls"] >= min_balls]
    out += ["#### 1. Ground level (the current venue factor)", "",
            "| Metric | Grounds | chi²/df after cutoff (1 = chance) | Overall O/E |", "|---|---|---|---|"]
    for met in METRICS:
        O = np.array([c[met][0] for _, c in rows])
        E = np.array([c[met][1] for _, c in rows])
        V = np.array([c[met][2] for _, c in rows])
        k = O.sum() / E.sum()
        out.append(f"| {met} | {len(rows)} | {((O - E * k) ** 2 / (V * k)).sum() / max(len(rows) - 1, 1):.2f} | {k:.3f} |")

    out += ["", "#### 2. Within-ground splits", "",
            "excess = chi²/df of the split inside each ground after the cutoff (1 = no more than chance). "
            "gain = share of that removed by the pre-cutoff split, shrunk with the best prior (balls). "
            "corr = pre v post split, weighted.", "",
            "| Split | Metric | Grounds | Cells | Excess | Gain | Prior | Corr |", "|---|---|---|---|---|---|---|---|"]
    for split, lv in (("phase", 4), ("innings", 2), ("kind", 2), ("gender", 2)):
        res = split_test(pre, post, split, lv, min_balls)
        for met in METRICS:
            r = res[met]
            if r is None:
                out.append(f"| {split} | {met} | 0 | – | – | – | – | – |")
                continue
            out.append(f"| {split} | {met} | {r['grounds']} | {r['cells']} | {r['excess']:.2f} | "
                       f"{r['gain']:+.1%} | {r['shrink']} | {r['corr']:+.2f} |")

    # thin grounds
    pre_cells = _cells(pre_b, pre["per"], None)
    pre_balls = {v: c["balls"] for v, c in pre_cells.items() if v}
    p_bar = np.bincount(post_b["y"], minlength=S.K) / len(post_b["y"])
    effect = venue_run_effect(model, p_bar, run_mean)
    cities = {v: (c or "").strip().lower() for v, (_, c) in meta.items()}
    ct = city_test(post, pre_balls, cities, effect, model, 6000, min_balls // 2)
    out += ["", "#### 3. Thin grounds: borrow from the same city", ""]
    if ct["grounds"]:
        out += [f"{ct['grounds']} grounds with under 24,000 balls of history. Runs chi²/ground {ct['excess']:.2f}; "
                f"city prior removes **{ct['gain']:+.1%}** of it (corr {ct['corr']:+.2f}).", "",
                "| Ground | Balls after | O/E runs | City adjustment |", "|---|---|---|---|"]
        for v, O, E, _, adj in ct["rows"]:
            out.append(f"| {meta.get(v, (v,))[0]} | {int(post_cells_balls(post_b, v)):,} | {O / E:.3f} | {np.exp(adj):.3f} |")
    else:
        out.append("No thin grounds with city peers.")

    # busiest grounds: phase profile after the cutoff
    cp = _cells(post_b, post["per"], "phase")
    busiest = sorted(rows, key=lambda r: -r[1]["balls"])[:15]
    out += ["", "#### 4. Busiest grounds after the cutoff: observed ÷ model runs by phase", "",
            "| Ground | Balls | All | " + " | ".join(PHASES) + " |", "|---|---|---|" + "---|" * len(PHASES)]
    for v, c in busiest:
        ph = [cp.get(f"{v}|{i}") for i in range(len(PHASES))]
        cells = " | ".join(f"{p['runs'][0] / p['runs'][1]:.2f}" if p else "–" for p in ph)
        out.append(f"| {meta.get(v, (v,))[0]} | {c['balls']:,} | {c['runs'][0] / c['runs'][1]:.2f} | {cells} |")
    return "\n".join(out)


def post_cells_balls(b: dict, v: str) -> int:
    return int((b["venue"] == v).sum())


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), default=Path("data/parquet"))
@click.option("--cutoff", type=click.DateTime(["%Y-%m-%d"]), default="2025-01-01")
@click.option("--years", default=3.0, help="Years before the cutoff used to measure each ground's split")
@click.option("--min-balls", default=1200)
@click.option("--memory", default="5GB")
def main(parquet: Path, cutoff, years: float, min_balls: int, memory: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    click.echo(run(parquet, cutoff.date(), years, min_balls, memory))


if __name__ == "__main__":
    main()
