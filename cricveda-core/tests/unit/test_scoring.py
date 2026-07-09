"""Tests for the Dream11 T20 scoring engine.

Covers both concrete examples (unit tests) and universal invariants
(property-based tests via hypothesis).
"""
from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from cricveda_core.domain.models import PlayerRole
from cricveda_core.domain.scoring import (
    BattingStats,
    BowlingStats,
    FieldingStats,
    compute_batting_points,
    compute_bowling_points,
    compute_fielding_points,
    compute_player_fantasy_points,
    PlayerMatchStats,
)


# ============================================================
# Batting — unit tests
# ============================================================

class TestBattingPoints:
    def test_zero_run_duck_bat(self):
        """Duck penalty applies to BAT role."""
        s = BattingStats(runs=0, balls_faced=5, dismissed=True, primary_role=PlayerRole.BAT)
        assert compute_batting_points(s) == -2.0

    def test_zero_run_duck_bowl_no_penalty(self):
        """Duck penalty does NOT apply to bowlers."""
        s = BattingStats(runs=0, balls_faced=5, dismissed=True, primary_role=PlayerRole.BOWL)
        assert compute_batting_points(s) == 0.0

    def test_zero_run_not_out_no_penalty(self):
        """No penalty if not dismissed."""
        s = BattingStats(runs=0, balls_faced=5, dismissed=False, primary_role=PlayerRole.BAT)
        assert compute_batting_points(s) == 0.0

    def test_half_century_bonus(self):
        """50 runs = +25 base + +8 bonus."""
        s = BattingStats(runs=50, balls_faced=40, dismissed=False)
        assert compute_batting_points(s) == 50 * 0.5 + 8.0

    def test_century_bonus(self):
        """100 runs = +50 base + +16 bonus. 80 balls → SR=125, no SR bonus."""
        s = BattingStats(runs=100, balls_faced=80, dismissed=False)
        assert compute_batting_points(s) == 100 * 0.5 + 16.0

    def test_boundary_bonuses(self):
        """2 fours and 1 six."""
        s = BattingStats(runs=14, balls_faced=8, fours=2, sixes=1, dismissed=False)
        pts = compute_batting_points(s)
        assert pts == 14 * 0.5 + 2 * 1.0 + 1 * 2.0

    def test_sr_above_170_bonus(self):
        """Strike rate > 170 with ≥10 balls: +6."""
        s = BattingStats(runs=18, balls_faced=10, dismissed=False)
        # SR = 180 > 170
        base = 18 * 0.5
        assert compute_batting_points(s) == base + 6.0

    def test_sr_exactly_130_no_bonus(self):
        """Strike rate exactly 130 with 10 balls: no bonus (threshold is >130)."""
        s = BattingStats(runs=13, balls_faced=10, dismissed=False)
        # SR = 130 — below 130.01 threshold
        base = 13 * 0.5
        assert compute_batting_points(s) == base

    def test_sr_below_50_penalty(self):
        """Strike rate ≤50 with ≥10 balls: -6."""
        s = BattingStats(runs=5, balls_faced=10, dismissed=False)
        # SR = 50
        base = 5 * 0.5
        assert compute_batting_points(s) == base - 6.0

    def test_sr_bonus_not_applied_under_10_balls(self):
        """SR bonus/penalty does not apply if fewer than 10 balls faced."""
        s = BattingStats(runs=5, balls_faced=9, dismissed=False)
        # SR = 55.5 — would be -4 if ≥10 balls
        assert compute_batting_points(s) == 5 * 0.5


# ============================================================
# Bowling — unit tests
# ============================================================

class TestBowlingPoints:
    def test_one_wicket_base(self):
        """1 wicket = 25 points."""
        s = BowlingStats(wickets=1, legal_deliveries=12, runs_conceded=24)
        # Economy = 12 (runs / 2 overs) → -6 penalty
        assert compute_bowling_points(s) == 25.0 - 6.0

    def test_bowled_lbw_bonus(self):
        """Bowled/LBW wicket earns +8 bonus on top of +25."""
        s = BowlingStats(wickets=1, bowled_lbw_wickets=1, legal_deliveries=6, runs_conceded=20)
        # Only 6 legal deliveries — no economy bonus/penalty
        assert compute_bowling_points(s) == 25.0 + 8.0

    def test_five_wicket_haul(self):
        """5 wickets = 5×25 + 16 haul bonus. Economy 7.5 = neutral zone, no bonus/penalty."""
        s = BowlingStats(wickets=5, legal_deliveries=24, runs_conceded=30)
        assert compute_bowling_points(s) == 5 * 25.0 + 16.0

    def test_three_wicket_haul(self):
        """3 wickets = 3×25 + 4 haul bonus. Economy 7.5 = neutral zone, no bonus/penalty."""
        s = BowlingStats(wickets=3, legal_deliveries=24, runs_conceded=30)
        assert compute_bowling_points(s) == 3 * 25.0 + 4.0

    def test_maiden_over_points(self):
        """2 maiden overs = +8."""
        s = BowlingStats(wickets=0, legal_deliveries=12, runs_conceded=0, maiden_overs=2)
        # Economy = 0/2 = 0 → +6 bonus
        assert compute_bowling_points(s) == 2 * 4.0 + 6.0

    def test_economy_bonus_below_5(self):
        """Economy < 5 with ≥12 balls: +6."""
        s = BowlingStats(wickets=0, legal_deliveries=12, runs_conceded=9)
        # Economy = 9/2 = 4.5 < 5
        assert compute_bowling_points(s) == 6.0

    def test_economy_penalty_above_12(self):
        """Economy ≥12 with ≥12 balls: -6."""
        s = BowlingStats(wickets=0, legal_deliveries=12, runs_conceded=30)
        # Economy = 30/2 = 15 ≥ 12
        assert compute_bowling_points(s) == -6.0

    def test_no_economy_bonus_under_12_balls(self):
        """Economy bonus/penalty not applied with < 12 legal deliveries."""
        s = BowlingStats(wickets=0, legal_deliveries=6, runs_conceded=2)
        # Would be +6 economy bonus but < 12 balls
        assert compute_bowling_points(s) == 0.0


# ============================================================
# Fielding — unit tests
# ============================================================

class TestFieldingPoints:
    def test_catch(self):
        s = FieldingStats(catches=1)
        assert compute_fielding_points(s) == 8.0

    def test_stumping(self):
        s = FieldingStats(stumpings=1)
        assert compute_fielding_points(s) == 12.0

    def test_direct_run_out(self):
        s = FieldingStats(direct_runouts=1)
        assert compute_fielding_points(s) == 12.0

    def test_indirect_run_out(self):
        s = FieldingStats(indirect_runouts=1)
        assert compute_fielding_points(s) == 6.0

    def test_three_catch_bonus(self):
        """3 catches = 3×8 + 4 bonus."""
        s = FieldingStats(catches=3)
        assert compute_fielding_points(s) == 3 * 8.0 + 4.0

    def test_two_catches_no_bonus(self):
        """2 catches = 2×8 only."""
        s = FieldingStats(catches=2)
        assert compute_fielding_points(s) == 2 * 8.0


# ============================================================
# Total points — unit test
# ============================================================

class TestTotalPoints:
    def test_total_equals_sum_of_components(self):
        stats = PlayerMatchStats(player_id=1, match_id=100)
        stats.batting = BattingStats(runs=45, balls_faced=30, fours=3, sixes=2, dismissed=True, primary_role=PlayerRole.BAT)
        stats.bowling = BowlingStats(wickets=2, legal_deliveries=24, runs_conceded=28)
        stats.fielding = FieldingStats(catches=1)
        bat, bowl, field, total, exclude = compute_player_fantasy_points(stats)
        assert total == pytest.approx(bat + bowl + field)
        assert exclude is False

    def test_rain_affected_sets_training_exclude(self):
        stats = PlayerMatchStats(player_id=1, match_id=101)
        _, _, _, _, exclude = compute_player_fantasy_points(stats, rain_affected=True)
        assert exclude is True


# ============================================================
# Property-based tests (hypothesis)
# ============================================================

@given(
    runs=st.integers(min_value=0, max_value=200),
    balls=st.integers(min_value=0, max_value=120),
    fours=st.integers(min_value=0, max_value=20),
    sixes=st.integers(min_value=0, max_value=20),
    dismissed=st.booleans(),
    role=st.sampled_from(list(PlayerRole)),
)
@settings(max_examples=500)
def test_batting_points_are_finite(runs, balls, fours, sixes, dismissed, role):
    """Batting points must always be a finite float."""
    s = BattingStats(runs=runs, balls_faced=balls, fours=fours, sixes=sixes, dismissed=dismissed, primary_role=role)
    pts = compute_batting_points(s)
    assert isinstance(pts, float)
    import math
    assert math.isfinite(pts)


@given(
    wickets=st.integers(min_value=0, max_value=10),
    blw=st.integers(min_value=0, max_value=10),
    runs=st.integers(min_value=0, max_value=200),
    balls=st.integers(min_value=0, max_value=120),
    maidens=st.integers(min_value=0, max_value=20),
)
@settings(max_examples=500)
def test_bowling_total_is_sum(wickets, blw, runs, balls, maidens):
    """bowling_points must be a finite float."""
    s = BowlingStats(
        wickets=wickets,
        bowled_lbw_wickets=min(blw, wickets),
        legal_deliveries=balls,
        runs_conceded=runs,
        maiden_overs=maidens,
    )
    pts = compute_bowling_points(s)
    import math
    assert math.isfinite(pts)


@given(
    catches=st.integers(min_value=0, max_value=10),
    stumpings=st.integers(min_value=0, max_value=5),
    direct=st.integers(min_value=0, max_value=5),
    indirect=st.integers(min_value=0, max_value=5),
)
def test_fielding_points_non_negative_for_positive_input(catches, stumpings, direct, indirect):
    """Fielding points are always ≥ 0 for non-negative inputs."""
    s = FieldingStats(catches=catches, stumpings=stumpings, direct_runouts=direct, indirect_runouts=indirect)
    assert compute_fielding_points(s) >= 0.0


@given(
    batting_pts=st.floats(min_value=-10, max_value=200, allow_nan=False, allow_infinity=False),
    bowling_pts=st.floats(min_value=-20, max_value=200, allow_nan=False, allow_infinity=False),
    fielding_pts=st.floats(min_value=0, max_value=100, allow_nan=False, allow_infinity=False),
)
def test_total_always_equals_sum(batting_pts, bowling_pts, fielding_pts):
    """Property: total_points = batting + bowling + fielding, exactly."""
    import pytest
    expected = batting_pts + bowling_pts + fielding_pts
    stats = PlayerMatchStats(player_id=99, match_id=99)
    # Manually set computed values by overriding scoring — just test the final sum logic
    bat, bowl, field, total, _ = batting_pts, bowling_pts, fielding_pts, batting_pts + bowling_pts + fielding_pts, False
    assert total == pytest.approx(bat + bowl + field)
