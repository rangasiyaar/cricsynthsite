"""MatchSynth ball-outcome model."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from cricveda_core.matchsynth.ball_model import (
    EXTRA, WICKET, BallModel, bowler_type, build_ball_states, encode_outcome, pressure_bucket,
)
from .matchsynth_fixtures import RABBIT, STAR, STRIKE_BOWLER, WEAK_VS_LEFT, synthetic_states


@pytest.fixture(scope="module")
def model():
    return BallModel.fit(synthetic_states(60000, 1), version="t")


def test_recovers_player_effects(model):
    boundary = lambda m: m[4] + m[5]
    assert boundary(model.batter[STAR]) > 1.3 > boundary(model.batter[RABBIT])
    assert model.batter[RABBIT][WICKET] > 1.5 > model.batter[STAR][WICKET]
    assert model.bowler[STRIKE_BOWLER][WICKET] > 1.5
    weak = model.batter_vs_type[WEAK_VS_LEFT]
    assert weak[1][WICKET] > 1.5 * weak[0][WICKET]          # left-arm pace (type 1) v right-arm


def test_beats_context_only_on_unseen_balls(model):
    report = model.evaluate(synthetic_states(15000, 2))
    assert report["log_loss"] < report["context_only_log_loss"]
    # only 4 of 30 synthetic players have real effects, so the achievable gain is ~0.5%
    assert report["improvement_pct"] > 0.2


def test_unknown_players_get_league_average(model):
    t = model.match_tables([9999], [8888], [5])
    np.testing.assert_allclose(t, np.ones_like(t))


def test_save_load_round_trip(model, tmp_path):
    model.metrics = {"x": 1}
    model.save(tmp_path / "m.npz")
    back = BallModel.load(tmp_path / "m.npz")
    assert back.version == "t" and back.metrics == {"x": 1}
    np.testing.assert_allclose(back.batter[STAR], model.batter[STAR])
    np.testing.assert_allclose(back.context["T20"], model.context["T20"])
    assert back.bowler_usage.keys() == model.bowler_usage.keys()


def test_encode_outcome():
    runs = pd.Series([0, 1, 4, 6, 5, 1, 2, 0])
    extras = pd.Series([None, None, None, None, None, "wides", "legbyes", None])
    wkts = pd.Series([None, None, None, None, None, None, None, "caught"])
    assert encode_outcome(runs, extras, wkts).tolist() == [0, 1, 4, 5, 4, EXTRA, 2, WICKET]


def test_pressure_and_bowler_type():
    b = pressure_bucket(np.array([10, 60, 30, 5]), np.array([60, 30, 12, 0]), np.array([2, 2, 2, 1]))
    assert b.tolist() == [1, 6, 6, 0]
    assert bowler_type("Left-arm-fast") == 1 and bowler_type("slow-left-arm") == 4 and bowler_type(None) == 5


def test_build_ball_states_tracks_wickets_and_chase():
    deliveries = pd.DataFrame({
        "delivery_id": range(1, 7), "match_id": 1,
        "innings": [1, 1, 1, 2, 2, 2], "over_ball": [0.1, 0.2, 0.3, 0.1, 0.2, 0.3],
        "striker_id": [1, 1, 2, 3, 3, 3], "bowler_id": [11, 11, 11, 21, 21, 21],
        "runs_total": [4, 0, 1, 1, 1, 6], "extras_type": [None] * 6,
        "wicket_type": [None, "bowled", None, None, None, None],
    })
    matches = pd.DataFrame({"match_id": [1], "league_id": ["ipl"]})
    leagues = pd.DataFrame({"league_id": ["ipl"], "format": ["T20"]})
    s = build_ball_states(deliveries, matches, leagues, {11: "left-arm-fast"})
    assert s["wkts"].tolist() == [0, 0, 1, 0, 0, 0]
    assert s.loc[0, "btype"] == 1 and s.loc[3, "btype"] == 5
    # chasing 6: needs 6 off 120 at the first ball of innings 2 → lowest pressure bucket
    assert s.loc[3, "pressure"] == 1 and s.loc[0, "pressure"] == 0
