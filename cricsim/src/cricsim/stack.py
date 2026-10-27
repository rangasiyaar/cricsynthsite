"""Bowlers' wickets blended with their recent real wickets (the stacking lab's tested blend), applied to a summary.

The lab found one blend that beat the simulations alone on T20-type matches in two separate test windows: a bowler's
chance of 2+ wickets and expected wickets (when bowling) learned from the simulation's own number plus the bowler's
recent real wickets. stack_weights.json holds its weights per format family (written by cricsim.stack_lab
--weights-out); families without weights keep the simulations as they are.

A bowler's simulated wickets are re-weighted (an exponential tilt of the counts) so that, when bowling, they hit the
blended expected wickets and 2+ chance; every published wicket number is then read from the same re-weighted
distribution, so they stay consistent with each other.
"""
from __future__ import annotations

import json
from functools import cache
from pathlib import Path

import numpy as np

from cricsim.fantasy_history import family
from cricsim.stack_lab import bowl_mean_x, bowl_p2_x, sigmoid

WEIGHTS = Path(__file__).with_name("stack_weights.json")
P2 = ("bowler 2+ wickets (chance, when bowling)", "stack: + recent 2+ rate")
MEAN = ("bowler wickets (expected, when bowling)", "stack: + recent wickets")
TOP = 5                                                   # published counts go to 5+; 5+ is treated as 5


@cache
def load_weights() -> dict:
    try:
        return json.loads(WEIGHTS.read_text())
    except FileNotFoundError:
        return {}


def families() -> set[str]:
    w = load_weights()
    return {f for f, v in w.items() if P2[0] in v and MEAN[0] in v}


def _blend(w: dict, target: tuple[str, str], x: list[float]) -> float:
    s = w[target[0]][target[1]]
    return float(np.asarray(x)[s["columns"]] @ np.asarray(s["weights"]))


def tilt(pmf: np.ndarray, mean: float, p2: float, iters: int = 60) -> np.ndarray:
    """Re-weight wicket counts 0..TOP (pmf) by exp(a·k + b·[k ≥ 2]) to hit `mean` and P(k ≥ 2) = `p2`."""
    k = np.arange(len(pmf), dtype=float)
    two = (k >= 2).astype(float)
    p2 = float(np.clip(p2, 1e-4, 1 - 1e-4))
    mean = float(np.clip(mean, 1e-4, k[-1] - 1e-4))

    def tilted(a, b):
        q = pmf * np.exp(a * k + b * two)
        return q / q.sum()

    def solve(f, target, lo=-20.0, hi=20.0):
        for _ in range(iters):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if f(mid) < target else (lo, mid)
        return (lo + hi) / 2

    a = b = 0.0
    for _ in range(25):                                   # alternate: b sets the 2+ chance, a the mean
        b = solve(lambda v: tilted(a, v)[2:].sum(), p2)
        a = solve(lambda v: (tilted(v, b) * k).sum(), mean)
    return tilted(a, b)


def adjust_bowlers(summary: dict, form: dict | None, fmt: str | None, bpo: int) -> int:
    """Blend every bowler's wickets in `summary` (in place) where weights exist for the format; returns how many."""
    w = load_weights().get(family(fmt or "")) if form else None
    if not w or P2[0] not in w or MEAN[0] not in w:
        return 0
    done = 0
    for team in summary.get("teams", []):
        for row in team.get("players", []):
            bw = row.get("bowling")
            f = form.get(row["id"])
            if not bw or not f or not bw.get("p_bowls"):
                continue
            pb = bw["p_bowls"]
            ge = [1.0] + [min(bw["p_wickets"][str(j)] / pb, 1.0) for j in range(1, TOP + 1)] + [0.0]
            pmf = np.maximum(np.diff(-np.asarray(ge)), 0)  # P(k | bowls) for k = 0..TOP
            if pmf.sum() <= 0:
                continue
            pmf = pmf / pmf.sum()
            k = np.arange(TOP + 1)
            r = {"form": f, "mean": float(pmf @ k), "p2": float(pmf[2:].sum()), "balls": bw["overs"] * bpo / pb}
            mean = max(_blend(w, MEAN, bowl_mean_x(r)), 0.0)
            p2 = float(sigmoid(_blend(w, P2, bowl_p2_x(r))))
            q = tilt(pmf, mean, p2)
            tail = np.cumsum(q[::-1])[::-1]                # P(k ≥ j | bowls)
            bw["p_wickets"] = {str(j): round(float(pb * tail[j]), 3) for j in range(1, TOP + 1)}
            bw["wickets"] = {**bw["wickets"], "mean": round(float(pb * (q @ k)), 2)}
            bw["method"] = "simulations + recent wickets"
            done += 1
    return done
