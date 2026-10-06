"""CricVeda v2 prediction maths: quantile models and derived scores."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from cricveda_core.features.pipeline import infer_player_team
from cricveda_core.predictions import derive
from cricveda_core.predictions.quantile import QUANTILES, QuantileModels, evaluate, train_quantile_models

FEATURES = ["fp_ewm5", "fp_last5_avg", "bat_runs_avg5", "bowl_wkts_avg5", "skill"]


def synthetic(n: int, seed: int) -> pd.DataFrame:
    """Targets drawn from known distributions so true P10/P90 are known."""
    rng = np.random.default_rng(seed)
    skill = rng.uniform(0, 1, n)
    runs = rng.gamma(2.0, 6 + 20 * skill)                 # skewed, like real scores
    wickets = rng.binomial(4, 0.15 + 0.3 * (1 - skill)).astype(float)
    points = runs + 25 * wickets + rng.normal(0, 4, n)
    df = pd.DataFrame({
        "skill": skill,
        "fp_ewm5": points + rng.normal(0, 8, n),
        "fp_last5_avg": points + rng.normal(0, 10, n),
        "bat_runs_avg5": runs + rng.normal(0, 8, n),
        "bowl_wkts_avg5": wickets + rng.normal(0, 0.7, n),
        "target_runs": runs, "target_wickets": wickets, "target_points": points,
    })
    df.loc[df.index[: n // 10], "target_wickets"] = np.nan   # some players don't bowl
    return df


@pytest.fixture(scope="module")
def trained():
    train, val, test = synthetic(4000, 1), synthetic(800, 2), synthetic(1500, 3)
    return train_quantile_models(train, val, FEATURES, "t1"), test


def test_quantiles_are_ordered_and_non_negative(trained):
    qm, test = trained
    for target, q in qm.predict(test).items():
        assert q.shape == (len(test), len(QUANTILES))
        assert (np.diff(q, axis=1) >= 0).all(), target
        assert (q >= 0).all()
    wk = qm.predict(test)["wickets"]
    assert (wk <= 10).all() and (wk == np.round(wk)).all()


def test_p10_p90_interval_covers_about_80_percent(trained):
    qm, test = trained
    report = evaluate(qm, test)
    for target in ("runs", "points"):
        assert 0.70 <= report[target]["coverage_p10_p90"] <= 0.90, (target, report[target])
    # a small whole-number count can't hit exactly 80%; it must not fall short of it
    assert report["wickets"]["coverage_p10_p90"] >= 0.75
    assert report["wickets"]["n"] == len(test) - len(test) // 10  # NaN targets skipped


def test_save_load_round_trip(trained, tmp_path):
    qm, test = trained
    qm.save(tmp_path)
    qm.save(tmp_path, name="latest")
    loaded = QuantileModels.load(tmp_path, "latest")
    assert loaded.version == "t1"
    np.testing.assert_allclose(loaded.predict(test)["points"], qm.predict(test)["points"], rtol=1e-5)
    assert loaded.reference["points_p50"] == qm.reference["points_p50"]


def test_percentile():
    ref = list(np.linspace(0, 100, 101))
    assert derive.percentile(50, ref) == pytest.approx(0.5)
    assert derive.percentile(-5, ref) == 0.0
    assert derive.percentile(500, ref) == 1.0
    assert derive.percentile(float("nan"), ref) == 0.5
    assert derive.percentile(3, [3.0] * 101) == 0.5


def test_form_trend_and_metric():
    ref = list(np.linspace(0, 100, 101))
    assert derive.form(87, 2.5, ref) == (0.87, "rising")
    assert derive.form(40, -3, ref)[1] == "falling"
    assert derive.form(40, 0.4, ref)[1] == "steady"
    assert derive.primary_metric("BAT") == "runs"
    assert derive.primary_metric("wk") == "runs"
    assert derive.primary_metric("BOWL") == "wickets"
    assert derive.primary_metric("AR") == "fantasy_points"
    assert derive.primary_metric(None) == "fantasy_points"


def test_composite_and_tiers():
    assert derive.composite_score(1, 1, 1) == 1.0
    assert derive.composite_score(0, 0, 0) == 0.0
    assert [derive.tier(c) for c in (0.85, 0.6, 0.45, 0.2, 0.05)] == ["S", "A", "B", "C", "D"]


def test_confidence_rises_with_history_and_falls_for_projected_xi():
    novice = derive.confidence(2, 10, 30, 80, xi_confirmed=True)
    veteran = derive.confidence(80, 10, 30, 80, xi_confirmed=True)
    assert veteran > novice
    assert derive.confidence(80, 10, 30, 80, xi_confirmed=False) < veteran
    assert derive.confidence(80, 28, 30, 32, True) > derive.confidence(80, 0, 30, 150, True)
    assert 0.30 <= derive.confidence(0, 0, 0, 500, False) <= 0.97


def test_captain_values_sum_to_two_and_favour_stars():
    q = np.array([[10, 30, 60]] * 20 + [[40, 80, 140], [35, 75, 130]], dtype=float)
    cv = derive.captain_values(q, n_sims=5000)
    assert cv.sum() == pytest.approx(2.0)
    assert cv[20] > 0.5 and cv[21] > 0.4
    assert cv[:20].max() < cv[21]
    assert derive.captain_values(np.empty((0, 3))).size == 0
    assert list(derive.captain_values(np.array([[1, 2, 3.0]]))) == [1.0]


def test_infer_player_team_from_innings_and_toss():
    d = pd.DataFrame({
        "match_id": [1, 1, 1, 1],
        "innings": [1, 1, 2, 2],
        "striker_id": [10, 10, 20, 20],
        "bowler_id": [21, 21, 11, 11],
    })
    # CSK won the toss and fielded → MI batted first
    assert infer_player_team(10, 1, "MI", "CSK", "CSK", "field", d) == "MI"
    assert infer_player_team(21, 1, "MI", "CSK", "CSK", "field", d) == "CSK"
    assert infer_player_team(20, 1, "MI", "CSK", "CSK", "field", d) == "CSK"
    assert infer_player_team(11, 1, "MI", "CSK", "CSK", "field", d) == "MI"
    # MI won the toss and batted → same sides
    assert infer_player_team(20, 1, "MI", "CSK", "MI", "bat", d) == "CSK"
    # no toss info / no deliveries → team1 fallback
    assert infer_player_team(10, 1, "MI", "CSK", None, None, d) == "MI"
    assert infer_player_team(99, 1, "MI", "CSK", "CSK", "field", d) == "MI"
