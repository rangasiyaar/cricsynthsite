"""Dream11 T20 lineup optimizer using linear programming.

Maximises predicted fantasy points subject to Dream11 constraints.

Dream11 T20 rules:
  - Exactly 11 players
  - Total credits ≤ 100
  - Role constraints: 1-4 WK, 3-6 BAT, 1-4 AR, 3-6 BOWL
  - Max 7 players from one team
  - Captain scores 2× points, Vice-Captain scores 1.5× points

Usage:
    from cricveda_core.dream_team.optimizer import build_dream_team
    lineup = build_dream_team(players)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import pulp

log = logging.getLogger(__name__)


@dataclass
class PlayerCandidate:
    player_id: int
    name: str
    team: str
    role: str           # BAT | BOWL | AR | WK
    predicted_points: float
    credits: float


@dataclass
class DreamTeamResult:
    players: list[PlayerCandidate]
    captain: PlayerCandidate
    vice_captain: PlayerCandidate
    total_credits_used: float
    projected_score: float


def build_dream_team(
    candidates: list[PlayerCandidate],
    credit_limit: float = 100.0,
    max_per_team: int = 7,
) -> DreamTeamResult | None:
    """
    Select the optimal Dream11 XI from a list of candidates.

    Returns None if no feasible solution exists.
    """
    n = len(candidates)
    if n < 11:
        log.error("Need at least 11 candidates, got %d", n)
        return None

    prob = pulp.LpProblem("dream11_optimizer", pulp.LpMaximize)

    # Decision variables: x[i] = 1 if player i is selected
    x = [pulp.LpVariable(f"x_{i}", cat="Binary") for i in range(n)]

    # Objective: maximise total predicted points
    prob += pulp.lpSum(candidates[i].predicted_points * x[i] for i in range(n))

    # Exactly 11 players
    prob += pulp.lpSum(x) == 11

    # Credit constraint
    prob += pulp.lpSum(candidates[i].credits * x[i] for i in range(n)) <= credit_limit

    # Role constraints
    wk_idx = [i for i, c in enumerate(candidates) if c.role == "WK"]
    bat_idx = [i for i, c in enumerate(candidates) if c.role == "BAT"]
    ar_idx = [i for i, c in enumerate(candidates) if c.role == "AR"]
    bowl_idx = [i for i, c in enumerate(candidates) if c.role == "BOWL"]

    prob += pulp.lpSum(x[i] for i in wk_idx) >= 1
    prob += pulp.lpSum(x[i] for i in wk_idx) <= 4
    prob += pulp.lpSum(x[i] for i in bat_idx) >= 3
    prob += pulp.lpSum(x[i] for i in bat_idx) <= 6
    prob += pulp.lpSum(x[i] for i in ar_idx) >= 1
    prob += pulp.lpSum(x[i] for i in ar_idx) <= 4
    prob += pulp.lpSum(x[i] for i in bowl_idx) >= 3
    prob += pulp.lpSum(x[i] for i in bowl_idx) <= 6

    # Max players per team
    teams = list({c.team for c in candidates})
    for team in teams:
        team_idx = [i for i, c in enumerate(candidates) if c.team == team]
        prob += pulp.lpSum(x[i] for i in team_idx) <= max_per_team

    # Solve (suppress output)
    solver = pulp.PULP_CBC_CMD(msg=0)
    status = prob.solve(solver)

    if pulp.LpStatus[status] != "Optimal":
        log.error("LP solver status: %s — no feasible lineup found", pulp.LpStatus[status])
        return None

    selected = [candidates[i] for i in range(n) if pulp.value(x[i]) == 1]

    # Captain = highest predicted points, Vice-Captain = second highest
    sorted_by_pts = sorted(selected, key=lambda c: c.predicted_points, reverse=True)
    captain = sorted_by_pts[0]
    vice_captain = sorted_by_pts[1]

    total_credits = sum(c.credits for c in selected)
    # Dream11 scoring: captain 2×, vc 1.5×, others 1×
    projected = sum(c.predicted_points for c in selected) + captain.predicted_points + vice_captain.predicted_points * 0.5

    return DreamTeamResult(
        players=selected,
        captain=captain,
        vice_captain=vice_captain,
        total_credits_used=total_credits,
        projected_score=projected,
    )


def format_lineup(result: DreamTeamResult) -> str:
    """Return a human-readable lineup string."""
    lines = [
        f"{'Player ID':<12} {'Role':<6} {'Team':<20} {'Credits':>7} {'Pred Pts':>9} {''}",
        "-" * 65,
    ]
    for p in sorted(result.players, key=lambda c: c.predicted_points, reverse=True):
        tag = ""
        if p.player_id == result.captain.player_id:
            tag = "(C)"
        elif p.player_id == result.vice_captain.player_id:
            tag = "(VC)"
        lines.append(
            f"{p.player_id:<12} {p.role:<6} {p.team:<20} {p.credits:>7.1f} {p.predicted_points:>9.1f} {tag}"
        )
    lines.append("-" * 65)
    lines.append(f"Total credits: {result.total_credits_used:.1f} / 100")
    lines.append(f"Projected score (with C/VC): {result.projected_score:.1f}")
    return "\n".join(lines)
