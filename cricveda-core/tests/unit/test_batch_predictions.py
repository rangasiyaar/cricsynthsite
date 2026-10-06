"""Batch prediction job: variants, derived fields and row shape (no Supabase)."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from cricveda_core.models.train import PLAYER_FP_FEATURES
from cricveda_core.predictions.batch import (
    BATTING_ROLES, POSITION_FIRST_OVER, VARIANT_POSITIONS, SquadPlayer, predict_fixture,
)
from cricveda_core.predictions.quantile import train_quantile_models


def _feature_frame(n: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame(rng.normal(20, 8, (n, len(PLAYER_FP_FEATURES))), columns=PLAYER_FP_FEATURES)
    df["matches_total"] = rng.integers(0, 120, n)
    df["batting_position_avg"] = rng.uniform(0, 18, n)
    skill = (df["fp_ewm5"] - 20) / 8
    # batting earlier → more runs, so position variants should move the runs range
    df["target_runs"] = np.maximum(0, rng.gamma(2, 8 + 3 * skill.clip(-2, 2) + 2) * (1.6 - df["batting_position_avg"] / 18))
    df["target_wickets"] = rng.binomial(4, 0.25, n).astype(float)
    df["target_points"] = df["target_runs"] + 25 * df["target_wickets"] + rng.normal(0, 5, n)
    return df


@pytest.fixture(scope="module")
def models():
    return train_quantile_models(_feature_frame(3000, 1), _feature_frame(600, 2), PLAYER_FP_FEATURES, "vtest")


class FakePipeline:
    """Returns a deterministic feature row per player; records calls."""

    def __init__(self):
        self.calls = []

    def build_inference_matrix(self, player_ids, player_teams, team1, team2, match_date,
                               venue_id, league_id, toss_winner=None, toss_decision=None):
        self.calls.append({"venue_id": venue_id, "toss_winner": toss_winner})
        X = _feature_frame(len(player_ids), 99)[PLAYER_FP_FEATURES]
        X.index = player_ids
        return X


def _squad():
    roles = ["BAT", "BAT", "BAT", "WK", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL"]
    squad = []
    for t, team in enumerate(("MI", "CSK")):
        for i, role in enumerate(roles):
            squad.append(SquadPlayer(player_id=100 * (t + 1) + i, team=team, role=role,
                                     batting_order=i + 1, is_playing_xi=True, is_confirmed=(team == "MI")))
    squad.append(SquadPlayer(999, "MI", "BOWL", None, is_playing_xi=False, is_confirmed=False))
    return squad


FIXTURE = {"upcoming_id": 7, "slug": "ipl-2026-m042", "match_date": "2026-04-20", "team1": "MI",
           "team2": "CSK", "venue_id": 3, "league_id": "ipl", "toss_winner": "CSK", "toss_decision": "field"}


def test_rows_cover_every_variant(models):
    pipe = FakePipeline()
    rows = predict_fixture(pipe, models, FIXTURE, _squad())
    batters = sum(1 for p in _squad() if p.is_playing_xi and p.role in BATTING_ROLES)
    expected = 2 * (22 + batters * len(VARIANT_POSITIONS))
    assert len(rows) == expected
    keys = {(r["player_id"], r["batting_position"], r["include_conditions"]) for r in rows}
    assert len(keys) == len(rows)                       # primary key is unique
    assert all(r["player_id"] != 999 for r in rows)     # bench not predicted
    # one build with conditions, one without
    assert pipe.calls == [{"venue_id": 3, "toss_winner": "CSK"}, {"venue_id": None, "toss_winner": None}]


def test_row_fields_are_valid(models):
    rows = predict_fixture(FakePipeline(), models, FIXTURE, _squad())
    for r in rows:
        assert r["runs_p10"] <= r["runs_p50"] <= r["runs_p90"]
        assert r["points_p10"] <= r["points_p50"] <= r["points_p90"]
        assert r["wickets_p10"] == int(r["wickets_p10"])
        assert r["tier"] in "SABCD" and 0 <= r["composite_score"] <= 1
        assert 0 <= r["form_score"] <= 1 and r["form_trend"] in ("rising", "steady", "falling")
        assert 0.30 <= r["confidence"] <= 0.97 and 0 <= r["captain_value"] <= 1
        assert r["model_version"] == "vtest"
        assert r["metric"] == {"BAT": "runs", "WK": "runs", "BOWL": "wickets", "AR": "fantasy_points"}[r["role"]]
        assert r["xi_status"] == ("confirmed" if r["team"] == "MI" else "projected")


def test_projected_captain_values_sum_to_two(models):
    rows = predict_fixture(FakePipeline(), models, FIXTURE, _squad())
    base = [r for r in rows if r["batting_position"] == 0 and r["include_conditions"]]
    assert len(base) == 22
    assert sum(r["captain_value"] for r in base) == pytest.approx(2.0, abs=0.05)


def test_batting_higher_moves_runs_up(models):
    rows = predict_fixture(FakePipeline(), models, FIXTURE, _squad())
    pid = 100  # MI opener
    at = {r["batting_position"]: r for r in rows if r["player_id"] == pid and r["include_conditions"]}
    assert set(at) == {0, *VARIANT_POSITIONS}
    assert at[1]["runs_p50"] >= at[7]["runs_p50"]


def test_no_xi_means_no_rows(models):
    squad = [SquadPlayer(1, "MI", "BAT", None, False, False)]
    assert predict_fixture(FakePipeline(), models, FIXTURE, squad) == []


def test_position_table_is_monotonic():
    overs = [POSITION_FIRST_OVER[p] for p in sorted(POSITION_FIRST_OVER)]
    assert overs == sorted(overs)
