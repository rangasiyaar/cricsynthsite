"""Outcome classes and situation buckets — shared by fitting and simulation.

Every bucket here is backed by a Pattern Lab finding on 6M real balls:
  set       batter balls faced: ball 1 is safest (0.82x wickets), risk peaks around balls 4–13
  chase     required rate: 10+ an over 1.34x wickets, under 6 an over 0.83x
  milestone 40s are safer (0.94x), just after 50 riskier (1.11x)
  streak    six after six 1.68x, boundary after boundary 1.16x (wicket after six: no effect)
  dots      boundary less likely after a dot streak (0.87x)
  spell     wides 1.15x in a spell's first over
  free hit  bowler wickets impossible
Folklore that tested as myth (wicket after a six, first ball of a spell, collapses, …) is left out.
"""
from __future__ import annotations

import numpy as np

# Outcome classes
OUTCOMES = ("0", "1", "2", "3", "4", "6", "W", "WD", "NB", "BYE")
K = len(OUTCOMES)
DOT, ONE, TWO, THREE, FOUR, SIX, WKT, WIDE, NOBALL, BYE = range(K)
BAT_RUNS = np.array([0, 1, 2, 3, 4, 6, 0, 0, 0, 0], dtype=np.int16)    # runs off the bat
LEGAL = np.array([1, 1, 1, 1, 1, 1, 1, 0, 0, 1], dtype=bool)
BATTING_CLASSES = np.array([DOT, ONE, TWO, THREE, FOUR, SIX])

FAMILIES = {"T20": "short", "T10": "short", "HUNDRED": "short", "OD": "od"}
FAMILY_LIST = ("short", "od")
# overs (or 5-ball sets) per innings, powerplay length, max overs per bowler, balls per over
FORMAT_RULES = {
    "T20": {"overs": 20, "pp": 6, "quota": 4, "bpo": 6},
    "T10": {"overs": 10, "pp": 2, "quota": 2, "bpo": 6},
    "HUNDRED": {"overs": 20, "pp": 5, "quota": 4, "bpo": 5},     # 5-ball sets; 20 balls a bowler
    "OD": {"overs": 50, "pp": 10, "quota": 10, "bpo": 6},
}

BOWLING_KINDS = ("unknown", "pace_right", "pace_left", "off_spin", "leg_spin", "left_arm_orthodox",
                 "left_arm_wrist", "slow")
HANDS = ("unknown", "right", "left")


def bowling_kind_index(arm: str | None, kind: str | None) -> int:
    if kind == "pace":
        return BOWLING_KINDS.index("pace_left" if arm == "left" else "pace_right")
    return BOWLING_KINDS.index(kind) if kind in BOWLING_KINDS else 0


def hand_index(hand: str | None) -> int:
    return HANDS.index(hand) if hand in HANDS else 0


# ── buckets (numpy, vectorised; the SQL in fit.py mirrors these exactly) ──────

SET_EDGES = np.array([1, 2, 3, 4, 7, 13, 21, 36])          # balls faced → 0..8
N_SET = len(SET_EDGES) + 1


def set_bucket(balls_faced):
    return np.searchsorted(SET_EDGES, balls_faced, side="right")


CHASE_EDGES = np.array([6.0, 8.0, 10.0, 12.0, 15.0])        # required runs per over → 1..6 ; 0 = 1st innings
N_CHASE = len(CHASE_EDGES) + 2


def chase_bucket(innings_no, runs_needed, balls_left, bpo=6):
    rrr = 6.0 * runs_needed / np.maximum(balls_left, 1)
    b = np.searchsorted(CHASE_EDGES, rrr, side="right") + 1
    return np.where(np.asarray(innings_no) == 2, b, 0)


MILE_EDGES = np.array([30, 40, 50, 56, 90, 100, 106])      # batter runs → 0..7
N_MILE = len(MILE_EDGES) + 1


def milestone_bucket(runs):
    return np.searchsorted(MILE_EDGES, runs, side="right")


# batter's previous ball: 0 none (first ball) · 1 dot · 2 ones–threes · 3 four · 4 six
N_STREAK = 5


def streak_bucket(prev_runs, prev_boundary):
    prev_runs = np.asarray(prev_runs)
    out = np.where(prev_runs == 0, 1, 2)
    out = np.where(prev_boundary & (prev_runs == 4), 3, out)
    out = np.where(prev_boundary & (prev_runs == 6), 4, out)
    return np.where(prev_runs < 0, 0, out)                    # -1 encodes "no previous ball"


DOT_EDGES = np.array([1, 3, 5])                              # innings dot streak → 0..3
N_DOTS = len(DOT_EDGES) + 1


def dots_bucket(dots):
    return np.searchsorted(DOT_EDGES, dots, side="right")
