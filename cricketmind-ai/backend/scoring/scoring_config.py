"""CricVeda AI 1.0 — Fantasy Points Scoring Configuration

All scoring rules are defined here as constants for easy adjustment
across different fantasy platforms.
"""

# ============================================================
#  BATTING POINTS
# ============================================================
POINTS_PER_RUN = 1
POINTS_BOUNDARY_FOUR = 1      # Bonus per boundary (4)
POINTS_BOUNDARY_SIX = 2       # Bonus per six
POINTS_MILESTONE_30 = 4       # 30-run bonus
POINTS_MILESTONE_50 = 8       # Half-century bonus
POINTS_MILESTONE_100 = 16     # Century bonus
POINTS_DUCK = -2              # Duck penalty (0 runs, out)

# ============================================================
#  BOWLING POINTS
# ============================================================
POINTS_PER_WICKET = 25
POINTS_3_WICKET_HAUL = 4      # 3-wicket haul bonus
POINTS_5_WICKET_HAUL = 8      # 5-wicket haul bonus
POINTS_MAIDEN_OVER = 12

# Economy rate bonuses/penalties (minimum 2 overs bowled)
ECONOMY_BRACKETS = [
    # (max_economy, points)
    (5.0, 6),      # Economy < 5
    (6.0, 4),      # Economy 5-6
    (7.0, 2),      # Economy 6-7
    (10.0, 0),     # Economy 7-10 (neutral)
    (11.0, -2),    # Economy 10-11
    (12.0, -4),    # Economy 11-12
    (float("inf"), -6),  # Economy > 12
]

# ============================================================
#  FIELDING POINTS
# ============================================================
POINTS_CATCH = 8
POINTS_STUMPING = 12
POINTS_DIRECT_RUNOUT = 12
POINTS_INDIRECT_RUNOUT = 6

# ============================================================
#  BONUS POINTS
# ============================================================
POINTS_MAN_OF_MATCH = 25
CAPTAIN_MULTIPLIER = 2.0
VICE_CAPTAIN_MULTIPLIER = 1.5
