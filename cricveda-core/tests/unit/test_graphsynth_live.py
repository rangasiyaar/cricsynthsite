"""Live match-state snapshots."""
from __future__ import annotations

import pytest

from cricveda_core.graphsynth.live import MatchState, snapshot

from .test_match_engine import flat_model
from .test_matchsynth_fixture import FIXTURE, squad


def snap(**kw):
    return snapshot(flat_model(), FIXTURE, squad(), MatchState(**kw), iterations=1500)


def test_in_progress_first_innings():
    s = snap(innings=1, batting="home", runs=80, wickets=1, legal_balls=60)
    assert 0 < s["win_prob_home"] < 1
    assert s["proj_p10"] >= 80 and s["proj_p10"] <= s["proj_p50"] <= s["proj_p90"]


def test_away_batting_flips_perspective():
    strong = snap(innings=2, batting="away", runs=150, wickets=1, legal_balls=96, first_innings_total=160)
    assert strong["win_prob_home"] < 0.15            # away needs 11 off 24 with 9 wickets left


def test_first_innings_complete_simulates_chase():
    s = snap(innings=1, batting="home", runs=260, wickets=4, legal_balls=120)
    assert s["win_prob_home"] > 0.9 and s["proj_p50"] == 260


def test_finished_chases():
    assert snap(innings=2, batting="home", runs=161, wickets=3, legal_balls=100, first_innings_total=160)["win_prob_home"] == 1.0
    assert snap(innings=2, batting="home", runs=150, wickets=10, legal_balls=100, first_innings_total=160)["win_prob_home"] == 0.0
    assert snap(innings=2, batting="away", runs=150, wickets=6, legal_balls=120, first_innings_total=160)["win_prob_home"] == 1.0
    assert snap(innings=2, batting="home", runs=160, wickets=6, legal_balls=120, first_innings_total=160)["win_prob_home"] == 0.5


@pytest.mark.parametrize("bad", [
    dict(innings=3, batting="home", runs=0, wickets=0, legal_balls=0),
    dict(innings=1, batting="both", runs=0, wickets=0, legal_balls=0),
    dict(innings=1, batting="home", runs=0, wickets=11, legal_balls=0),
    dict(innings=1, batting="home", runs=0, wickets=0, legal_balls=121),
    dict(innings=2, batting="home", runs=0, wickets=0, legal_balls=0),
])
def test_invalid_states(bad):
    with pytest.raises(ValueError):
        snap(**bad)
