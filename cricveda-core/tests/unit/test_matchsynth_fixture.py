"""MatchSynth fixture-level services."""
from __future__ import annotations

import numpy as np
import pytest

from cricveda_core.matchsynth.ball_model import K
from cricveda_core.matchsynth.fixture import (
    SquadRow, auction_value, opposition_report, scenario, simulate_fixture, toss_key_from_fixture, xi_status,
)

from .test_match_engine import flat_model

ROLES = ["BAT"] * 5 + ["AR", "AR"] + ["BOWL"] * 4
FIXTURE = {"upcoming_id": 1, "slug": "ipl-2026-m042", "team1": "MI", "team2": "CSK", "format": "T20"}


def squad(confirmed_away=False):
    rows = []
    for t, team in enumerate(("MI", "CSK")):
        for i, role in enumerate(ROLES):
            rows.append(SquadRow(100 * (t + 1) + i, team, i + 1, True, team == "MI" or confirmed_away, role,
                                 "left-arm-fast" if i % 2 else "right-arm-off-break"))
    rows.append(SquadRow(999, "MI", None, False, False, "BOWL", None))
    return rows


def test_full_match_summary_shape():
    out = simulate_fixture(flat_model(), FIXTURE, squad(), iterations=2000, toss_key="home_bowl")
    assert set(out["win_probability"]) == {"MI", "CSK"}
    assert out["win_probability"]["MI"] + out["win_probability"]["CSK"] == pytest.approx(1.0, abs=0.011)
    assert out["first_innings"]["batting"] == "CSK" and out["second_innings"]["batting"] == "MI"
    t = out["first_innings"]["total"]
    assert t["p10"] <= t["median"] <= t["p90"]
    assert out["pressure_phase"].startswith("overs_")
    assert out["xi"] == {"MI": "confirmed", "CSK": "projected"}
    assert isinstance(out["opposition_weakness"], list)


def test_unknown_toss_splits_batting_order():
    out = simulate_fixture(flat_model(), FIXTURE, squad(), iterations=2000)
    assert out["toss"] is None and out["iterations"] == 2000
    assert set(out["first_innings"]["by_team"]) == {"MI", "CSK"}


def test_toss_from_fixture():
    assert toss_key_from_fixture({**FIXTURE, "toss_winner": "CSK", "toss_decision": "field"}) == "away_bowl"
    assert toss_key_from_fixture({**FIXTURE, "toss_winner": "MI", "toss_decision": "bat"}) == "home_bat"
    assert toss_key_from_fixture(FIXTURE) is None


def test_scenarios():
    m = flat_model()
    easy = scenario(m, FIXTURE, squad(), innings=2, batting="home", runs=150, wickets=1, balls=96,
                    first_innings_total=160, iterations=2000)
    assert easy["win_probability"]["MI"] > 0.9 and easy["projected_total"]["median"] >= 150
    hard = scenario(m, FIXTURE, squad(), innings=2, batting="home", runs=60, wickets=8, balls=108,
                    first_innings_total=200, iterations=2000)
    assert hard["win_probability"]["MI"] < 0.05
    first = scenario(m, FIXTURE, squad(), innings=1, batting="away", runs=100, wickets=2, balls=72, iterations=2000)
    assert first["projected_total"]["p10"] >= 100
    with pytest.raises(ValueError):
        scenario(m, FIXTURE, squad(), innings=2, batting="home", runs=0, wickets=0, balls=0)


def test_opposition_report_and_xi_status():
    vs = np.ones((6, K)); vs[1, 6] = 2.5
    m = flat_model(vs_type={200 + i: vs for i in range(7)})
    rep = opposition_report(m, FIXTURE, squad(), "away")
    assert rep["team"] == "CSK" and rep["weaknesses"][0]["bowler_type"] == "left_arm_pace"
    assert rep["weaknesses"][0]["our_bowlers"]           # MI's left-arm pacers
    assert xi_status(squad(), "CSK") == "projected" and xi_status(squad(True), "CSK") == "confirmed"
    assert xi_status(squad(), "RCB") == "unknown"


def test_auction_value_star_adds_wins():
    star = np.ones(K); star[[4, 5]] = 2.5; star[6] = 0.4
    m = flat_model({100: star})
    out = auction_value(m, FIXTURE, squad(), 100, iterations=8000, crore_per_win=2.0)
    assert out["win_probability_added"] > 0.02
    assert out["estimated_value_cr"] == pytest.approx(out["season_wins_added"] * 2.0, abs=0.02)
    assert auction_value(m, FIXTURE, squad(), 100, iterations=2000)["estimated_value_cr"] is None
    with pytest.raises(ValueError):
        auction_value(m, FIXTURE, squad(), 999)      # bench player


def test_presimulation_due_logic():
    from cricveda_core.matchsynth.batch import complete_xis, is_due
    fx = {**FIXTURE, "updated_at": "2026-10-06T10:00:00+00:00"}
    assert is_due(fx, None, "v1")
    assert is_due(fx, {"model_version": "v0", "generated_at": "2026-10-06T11:00:00+00:00"}, "v1")   # new model
    assert is_due(fx, {"model_version": "v1", "generated_at": "2026-10-06T09:00:00+00:00"}, "v1")   # squad changed
    assert not is_due(fx, {"model_version": "v1", "generated_at": "2026-10-06T11:00:00+00:00"}, "v1")
    assert complete_xis(FIXTURE, squad())
    assert not complete_xis(FIXTURE, [p for p in squad() if p.player_id != 205])
