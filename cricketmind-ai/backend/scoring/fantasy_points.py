"""CricVeda AI 1.0 — Fantasy Points Calculator

Computes fantasy points for a player's predicted performance
using the scoring rules defined in scoring_config.py.
"""

from scoring.scoring_config import (
    POINTS_PER_RUN,
    POINTS_BOUNDARY_FOUR,
    POINTS_BOUNDARY_SIX,
    POINTS_MILESTONE_30,
    POINTS_MILESTONE_50,
    POINTS_MILESTONE_100,
    POINTS_DUCK,
    POINTS_PER_WICKET,
    POINTS_3_WICKET_HAUL,
    POINTS_5_WICKET_HAUL,
    POINTS_MAIDEN_OVER,
    ECONOMY_BRACKETS,
    POINTS_CATCH,
    POINTS_STUMPING,
    POINTS_DIRECT_RUNOUT,
    POINTS_INDIRECT_RUNOUT,
    POINTS_MAN_OF_MATCH,
    CAPTAIN_MULTIPLIER,
    VICE_CAPTAIN_MULTIPLIER,
)


def calculate_batting_points(
    runs: int,
    fours: int = 0,
    sixes: int = 0,
    is_out: bool = False,
) -> float:
    """Calculate fantasy points from batting performance.

    Args:
        runs: Total runs scored.
        fours: Number of boundaries (4s).
        sixes: Number of sixes (6s).
        is_out: Whether the batsman was dismissed.

    Returns:
        Total batting fantasy points.
    """
    points = 0.0

    # Run points
    points += runs * POINTS_PER_RUN

    # Boundary bonuses
    points += fours * POINTS_BOUNDARY_FOUR
    points += sixes * POINTS_BOUNDARY_SIX

    # Milestone bonuses (cumulative — a century also gets 50 and 30 bonuses)
    if runs >= 100:
        points += POINTS_MILESTONE_100
    if runs >= 50:
        points += POINTS_MILESTONE_50
    if runs >= 30:
        points += POINTS_MILESTONE_30

    # Duck penalty
    if runs == 0 and is_out:
        points += POINTS_DUCK

    return points


def calculate_bowling_points(
    wickets: int,
    overs: float = 0.0,
    runs_conceded: int = 0,
    maidens: int = 0,
) -> float:
    """Calculate fantasy points from bowling performance.

    Args:
        wickets: Number of wickets taken.
        overs: Overs bowled (e.g. 3.4 for 3 overs 4 balls).
        runs_conceded: Runs given away.
        maidens: Number of maiden overs.

    Returns:
        Total bowling fantasy points.
    """
    points = 0.0

    # Wicket points
    points += wickets * POINTS_PER_WICKET

    # Haul bonuses
    if wickets >= 5:
        points += POINTS_5_WICKET_HAUL
    if wickets >= 3:
        points += POINTS_3_WICKET_HAUL

    # Maiden overs
    points += maidens * POINTS_MAIDEN_OVER

    # Economy rate bonus/penalty (minimum 2 overs)
    if overs >= 2.0:
        economy = runs_conceded / overs if overs > 0 else 0.0
        for max_eco, eco_points in ECONOMY_BRACKETS:
            if economy < max_eco:
                points += eco_points
                break

    return points


def calculate_fielding_points(
    catches: int = 0,
    stumpings: int = 0,
    direct_runouts: int = 0,
    indirect_runouts: int = 0,
) -> float:
    """Calculate fantasy points from fielding performance.

    Args:
        catches: Number of catches taken.
        stumpings: Number of stumpings.
        direct_runouts: Number of direct-hit run outs.
        indirect_runouts: Number of indirect run outs.

    Returns:
        Total fielding fantasy points.
    """
    points = 0.0
    points += catches * POINTS_CATCH
    points += stumpings * POINTS_STUMPING
    points += direct_runouts * POINTS_DIRECT_RUNOUT
    points += indirect_runouts * POINTS_INDIRECT_RUNOUT
    return points


def calculate_total_fantasy_points(
    runs: int = 0,
    fours: int = 0,
    sixes: int = 0,
    is_out: bool = False,
    wickets: int = 0,
    overs: float = 0.0,
    runs_conceded: int = 0,
    maidens: int = 0,
    catches: int = 0,
    stumpings: int = 0,
    direct_runouts: int = 0,
    indirect_runouts: int = 0,
    is_mom: bool = False,
    is_captain: bool = False,
    is_vice_captain: bool = False,
) -> dict:
    """Calculate complete fantasy points breakdown.

    Returns:
        Dictionary with batting_points, bowling_points, fielding_points,
        bonus_points, total_points (after captain/VC multiplier).
    """
    batting = calculate_batting_points(runs, fours, sixes, is_out)
    bowling = calculate_bowling_points(wickets, overs, runs_conceded, maidens)
    fielding = calculate_fielding_points(
        catches, stumpings, direct_runouts, indirect_runouts
    )
    bonus = POINTS_MAN_OF_MATCH if is_mom else 0.0

    subtotal = batting + bowling + fielding + bonus

    # Captain / Vice-Captain multiplier
    if is_captain:
        total = subtotal * CAPTAIN_MULTIPLIER
    elif is_vice_captain:
        total = subtotal * VICE_CAPTAIN_MULTIPLIER
    else:
        total = subtotal

    return {
        "batting_points": batting,
        "bowling_points": bowling,
        "fielding_points": fielding,
        "bonus_points": bonus,
        "subtotal": subtotal,
        "total_points": total,
    }
