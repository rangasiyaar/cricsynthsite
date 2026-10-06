"""Synthetic ball data with known player effects, shared by MatchSynth tests."""
from __future__ import annotations

import numpy as np
import pandas as pd

from cricveda_core.matchsynth.ball_model import K

BASE = np.array([0.36, 0.36, 0.07, 0.005, 0.11, 0.045, 0.045, 0.005])   # ≈ T20 league mix
BASE = BASE / BASE.sum()
STAR, RABBIT, STRIKE_BOWLER, WEAK_VS_LEFT = 1, 2, 101, 3


def true_mult(batter: int, bowler: int, btype: int) -> np.ndarray:
    m = np.ones(K)
    if batter == STAR:
        m[[4, 5]] *= 1.8; m[6] *= 0.6
    if batter == RABBIT:
        m[[4, 5]] *= 0.5; m[6] *= 2.0
    if bowler == STRIKE_BOWLER:
        m[6] *= 2.0; m[0] *= 1.2
    if batter == WEAK_VS_LEFT and btype == 1:
        m[6] *= 2.5; m[[4, 5]] *= 0.6
    return m


def synthetic_states(n_balls: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    batters = rng.integers(1, 21, n_balls)
    bowlers = rng.integers(101, 111, n_balls)
    btype = np.where(bowlers % 2 == 0, 1, 0)
    over = rng.integers(0, 20, n_balls)
    wkts = rng.integers(0, 10, n_balls)
    innings = rng.integers(1, 3, n_balls)
    outcome = np.empty(n_balls, dtype=np.int8)
    for i in range(n_balls):
        p = BASE * true_mult(batters[i], bowlers[i], btype[i])
        if over[i] >= 15:          # death overs: more boundaries and wickets
            p = p * np.array([0.8, 0.9, 1, 1, 1.5, 1.8, 1.4, 1])
        outcome[i] = rng.choice(K, p=p / p.sum())
    return pd.DataFrame({
        "match_id": rng.integers(1, 400, n_balls), "format": "T20", "innings": innings, "over": over,
        "wkts": wkts, "pressure": np.where(innings == 2, rng.integers(1, 7, n_balls), 0),
        "striker_id": batters, "bowler_id": bowlers, "btype": btype, "outcome": outcome,
    })
