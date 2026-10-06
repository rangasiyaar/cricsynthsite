"""Scores derived from the quantile predictions — pure functions, no I/O.

    form            0–1 percentile of recent (recency-weighted) fantasy points,
                    plus a rising / steady / falling trend
    composite_score 0–1 blend of expected output, form and floor
    tier            S / A / B / C / D bands on the composite score
    captain_value   chance the player is a top-2 fantasy scorer in the match
    confidence      how much to trust the range: experience, range width, XI status
"""
from __future__ import annotations

from collections.abc import Sequence

import numpy as np

# Points-per-match slope over the last 5 matches beyond which form counts as moving.
TREND_THRESHOLD = 1.0

COMPOSITE_WEIGHTS = {"expected": 0.60, "form": 0.25, "floor": 0.15}
TIER_BANDS = (("S", 0.80), ("A", 0.60), ("B", 0.40), ("C", 0.20))


def percentile(value: float, reference: Sequence[float]) -> float:
    """Where `value` sits in a reference distribution given as 101 quantiles (0..1)."""
    ref = np.asarray(reference, dtype=float)
    if ref.size == 0 or not np.isfinite(value):
        return 0.5
    grid = np.linspace(0, 1, ref.size)
    # np.interp needs strictly increasing x; collapse flat runs in the reference.
    ref_u, idx = np.unique(ref, return_index=True)
    if ref_u.size == 1:
        return 0.5 if value == ref_u[0] else float(value > ref_u[0])
    return float(np.clip(np.interp(value, ref_u, grid[idx]), 0.0, 1.0))


def form(fp_ewm5: float, fp_trend: float, reference: Sequence[float]) -> tuple[float, str]:
    score = round(percentile(fp_ewm5, reference), 2)
    if fp_trend > TREND_THRESHOLD:
        trend = "rising"
    elif fp_trend < -TREND_THRESHOLD:
        trend = "falling"
    else:
        trend = "steady"
    return score, trend


def primary_metric(role: str | None) -> str:
    """Batters are judged on runs, bowlers on wickets, all-rounders on fantasy points."""
    role = (role or "").upper()
    if role in ("BAT", "WK"):
        return "runs"
    if role == "BOWL":
        return "wickets"
    return "fantasy_points"


def composite_score(expected_pct: float, form_score: float, floor_pct: float) -> float:
    w = COMPOSITE_WEIGHTS
    return round(float(np.clip(
        w["expected"] * expected_pct + w["form"] * form_score + w["floor"] * floor_pct, 0, 1)), 2)


def tier(composite: float) -> str:
    for name, cutoff in TIER_BANDS:
        if composite >= cutoff:
            return name
    return "D"


def confidence(matches_total: float, p10: float, p50: float, p90: float, xi_confirmed: bool) -> float:
    """0.30–0.97. More history and a tighter range → higher; an unconfirmed XI costs 8%."""
    experience = 1.0 - np.exp(-max(0.0, float(matches_total or 0)) / 15.0)
    spread = max(0.0, p90 - p10) / (max(0.0, p50) + 10.0)
    tightness = 1.0 / (1.0 + spread)
    conf = 0.40 + 0.35 * experience + 0.20 * tightness
    if not xi_confirmed:
        conf *= 0.92
    return round(float(np.clip(conf, 0.30, 0.97)), 2)


def _quantile_fn(p10: np.ndarray, p50: np.ndarray, p90: np.ndarray):
    """Piecewise-linear inverse CDF through P10/P50/P90 with tails extended outward."""
    lo = np.maximum(0.0, p10 - (p50 - p10))
    hi = p90 + 1.5 * (p90 - p50)              # fantasy points are right-skewed
    knots_u = np.array([0.0, 0.1, 0.5, 0.9, 1.0])
    knots_v = np.stack([lo, p10, p50, p90, hi], axis=1)   # (n, 5)
    return knots_u, knots_v


def captain_values(points_q: np.ndarray, n_sims: int = 4000, seed: int = 7, top_k: int = 2) -> np.ndarray:
    """P(player finishes in the match's top `top_k` fantasy scorers), by simulation.

    points_q: (n_players, 3) array of P10 / P50 / P90 fantasy points.
    """
    points_q = np.asarray(points_q, dtype=float)
    n = len(points_q)
    if n == 0:
        return np.zeros(0)
    if n <= top_k:
        return np.ones(n)
    rng = np.random.default_rng(seed)
    knots_u, knots_v = _quantile_fn(points_q[:, 0], points_q[:, 1], points_q[:, 2])
    u = rng.random((n_sims, n))
    # vectorised piecewise-linear interpolation per player
    seg = np.clip(np.searchsorted(knots_u, u, side="right") - 1, 0, len(knots_u) - 2)
    u0, u1 = knots_u[seg], knots_u[seg + 1]
    cols = np.arange(n)[None, :]
    v0, v1 = knots_v[cols, seg], knots_v[cols, seg + 1]
    samples = v0 + (u - u0) / (u1 - u0) * (v1 - v0)
    # rank within each simulated match; tiny jitter breaks exact ties fairly
    samples += rng.random(samples.shape) * 1e-6
    top = np.argsort(-samples, axis=1)[:, :top_k]
    counts = np.bincount(top.ravel(), minlength=n)
    return counts / n_sims
