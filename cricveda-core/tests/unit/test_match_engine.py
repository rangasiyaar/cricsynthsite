"""MatchSynth simulation engine."""
from __future__ import annotations

import time

import numpy as np

from cricveda_core.matchsynth.ball_model import BOWLER_TYPES, FORMATS, K, N_PRESSURE, BallModel
from cricveda_core.matchsynth.engine import (
    QUOTA, InningsStart, batting_weaknesses, build_side, pressure_phase, quantiles, simulate_innings,
    simulate_match,
)

from .matchsynth_fixtures import BASE


def flat_model(batter_mult=None, vs_type=None) -> BallModel:
    """League-average context everywhere, optional per-batter multipliers."""
    ctx = {f: np.broadcast_to(BASE, (2, o, 10, K)).copy() for f, o in FORMATS.items()}
    m = BallModel(context=ctx, chase=np.ones((N_PRESSURE, K)), version="flat")
    m.batter = batter_mult or {}
    m.batter_vs_type = vs_type or {}
    return m


ROLES = {**{i: "BAT" for i in range(1, 6)}, 6: "AR", 7: "AR", **{i: "BOWL" for i in range(8, 12)}}


def side(model, name, offset=0, fmt="T20"):
    order = [offset + i for i in range(1, 12)]
    roles = {offset + k: v for k, v in ROLES.items()}
    types = {offset + i: (1 if i % 2 else 0) for i in range(6, 12)}
    return build_side(model, fmt, name, order, roles, types)


def test_innings_obeys_cricket_rules():
    m = flat_model()
    rng = np.random.default_rng(1)
    a, b = side(m, "A"), side(m, "B", 100)
    r = simulate_innings(m, "T20", 1, a, b, 3000, rng)
    assert (r.legal_balls <= 120).all() and (r.wickets <= 10).all()
    assert ((r.legal_balls == 120) | (r.wickets == 10)).all()      # innings always completes
    assert (r.bowler_overs <= QUOTA["T20"]).all()
    assert r.max_consecutive == 1                                  # nobody bowls two in a row
    assert (r.phase_runs.sum(axis=1) == r.runs).all()
    assert 120 < np.median(r.runs) < 200                           # ~1.2 runs/ball league mix


def test_chase_stops_at_target():
    m = flat_model()
    a, b = side(m, "A"), side(m, "B", 100)
    res = simulate_match(m, "T20", a, b, 3000, seed=2)
    won_chasing = res.second.runs > res.first.runs
    assert won_chasing.any()
    assert (res.second.runs[won_chasing] <= res.first.runs[won_chasing] + 7).all()   # max 6 off last ball (+extra)
    wins = res.first_wins
    assert set(np.unique(wins)) <= {0.0, 0.5, 1.0}
    assert 0.35 < wins.mean() < 0.65                               # equal sides ≈ coin flip


def test_stronger_batting_side_wins_more():
    strong = np.ones(K); strong[[4, 5]] = 1.6; strong[6] = 0.7
    m = flat_model({i: strong for i in range(1, 12)})
    res = simulate_match(m, "T20", side(m, "A"), side(m, "B", 100), 4000, seed=3)
    assert res.first_wins.mean() > 0.7
    res2 = simulate_match(m, "T20", side(m, "B", 100), side(m, "A"), 4000, seed=3)
    assert res2.first_wins.mean() < 0.3


def test_seeded_runs_are_reproducible():
    m = flat_model()
    a, b = side(m, "A"), side(m, "B", 100)
    r1 = simulate_match(m, "T20", a, b, 500, seed=9)
    r2 = simulate_match(m, "T20", a, b, 500, seed=9)
    assert (r1.first.runs == r2.first.runs).all() and (r1.second.runs == r2.second.runs).all()


def test_scenario_starts_mid_innings():
    m = flat_model()
    a, b = side(m, "A"), side(m, "B", 100)
    start = InningsStart(runs=150, wickets=3, legal_balls=90, bowler_overs={108: 4, 109: 3}, last_bowler=109)
    r = simulate_innings(m, "T20", 1, a, b, 2000, np.random.default_rng(4), start=start)
    assert (r.runs >= 150).all() and (r.wickets >= 3).all()
    i108 = b.bowlers.index(108)
    assert (r.bowler_overs[:, i108] == 4).all()                    # already bowled out: no more overs


def test_known_first_total_only_simulates_chase():
    m = flat_model()
    res = simulate_match(m, "T20", side(m, "A"), side(m, "B", 100), 2000, seed=5, known_first_total=250)
    assert (res.first.runs == 250).all()
    assert res.first_wins.mean() > 0.9


def test_excluded_bowler_never_bowls():
    m = flat_model()
    a, b = side(m, "A"), side(m, "B", 100)
    r = simulate_innings(m, "T20", 1, a, b, 1000, np.random.default_rng(6), excluded_bowlers={108})
    assert (r.bowler_overs[:, b.bowlers.index(108)] == 0).all()


def test_odi_format():
    m = flat_model()
    r = simulate_innings(m, "ODI", 1, side(m, "A", fmt="ODI"), side(m, "B", 100, fmt="ODI"), 500, np.random.default_rng(7))
    assert (r.legal_balls <= 300).all() and (r.bowler_overs <= 10).all()


def test_weakness_finds_left_arm_pace_problem():
    vs = np.ones((len(BOWLER_TYPES), K)); vs[1, 6] = 2.5; vs[1, [4, 5]] = 0.6
    m = flat_model(vs_type={i: vs for i in range(1, 6)})
    tags = [w["tag"] for w in batting_weaknesses(m, "T20", side(m, "A"))]
    assert tags and all(t.startswith("left_arm_pace_") for t in tags)
    assert batting_weaknesses(flat_model(), "T20", side(flat_model(), "A")) == []


def test_summaries():
    assert quantiles(np.arange(101)) == {"p10": 10, "median": 50, "p90": 90}
    m = flat_model()
    res = simulate_match(m, "T20", side(m, "A"), side(m, "B", 100), 2000, seed=8)
    assert pressure_phase(res) in {"overs_1_6", "overs_7_15", "overs_16_20"}


def test_ten_thousand_iterations_is_fast():
    m = flat_model()
    a, b = side(m, "A"), side(m, "B", 100)
    t = time.perf_counter()
    simulate_match(m, "T20", a, b, 10000, seed=1)
    elapsed = time.perf_counter() - t
    print(f"10k T20 simulations: {elapsed:.2f}s")
    assert elapsed < 10
