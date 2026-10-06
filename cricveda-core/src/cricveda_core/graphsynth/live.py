"""Live match state → win-probability / projection snapshots.

Any source produces the same `MatchState`:

    customer   a broadcaster pushes their own scoring feed (POST /v2/graphics/state);
               their snapshots are private to their account
    admin      manual scoring from the admin panel; public
    feed       a paid data provider, plugged in later as a `LiveFeed` (see below); public

Each state is turned into a snapshot by MatchSynth (simulate the rest of the
match from that state), and the series of snapshots is the live worm.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from cricveda_core.matchsynth.ball_model import FORMATS, BallModel
from cricveda_core.matchsynth.fixture import SquadRow, scenario

LIVE_ITERATIONS = 2000          # per update: fast enough to run every ball on a small server
PUBLIC_SCOPE = "public"


@dataclass(frozen=True)
class MatchState:
    innings: int                      # 1 or 2
    batting: str                      # "home" | "away" — side at the crease
    runs: int
    wickets: int
    legal_balls: int
    first_innings_total: int | None = None

    def validate(self, fmt: str) -> None:
        max_balls = FORMATS[fmt] * 6
        if self.innings not in (1, 2):
            raise ValueError("innings must be 1 or 2")
        if self.batting not in ("home", "away"):
            raise ValueError("batting must be 'home' or 'away'")
        if not 0 <= self.wickets <= 10:
            raise ValueError("wickets must be 0–10")
        if not 0 <= self.legal_balls <= max_balls:
            raise ValueError(f"overs must be between 0 and {FORMATS[fmt]}")
        if self.runs < 0:
            raise ValueError("runs can't be negative")
        if self.innings == 2 and self.first_innings_total is None:
            raise ValueError("first_innings_total is required in the 2nd innings")


def snapshot(model: BallModel, fixture: dict, squad: list[SquadRow], state: MatchState,
             iterations: int = LIVE_ITERATIONS, seed: int = 0) -> dict:
    """Home side's win probability and the batting side's projected total from `state`."""
    fmt = (fixture.get("format") or "T20").upper()
    state.validate(fmt)
    max_balls = FORMATS[fmt] * 6
    home_batting = state.batting == "home"
    innings_over = state.wickets >= 10 or state.legal_balls >= max_balls

    if state.innings == 2 and (innings_over or state.runs > state.first_innings_total):
        # Chase finished: the result is known.
        if state.runs > state.first_innings_total:
            batting_win = 1.0
        elif state.runs == state.first_innings_total:
            batting_win = 0.5
        else:
            batting_win = 0.0
        final = {"p10": state.runs, "median": state.runs, "p90": state.runs}
    elif state.innings == 1 and innings_over:
        # 1st innings done: simulate the whole chase.
        chasing = "away" if home_batting else "home"
        r = scenario(model, fixture, squad, innings=2, batting=chasing, runs=0, wickets=0, balls=0,
                     first_innings_total=state.runs, iterations=iterations, seed=seed)
        names = {"home": fixture["team1"], "away": fixture["team2"]}
        batting_win = 1 - r["win_probability"][names[chasing]]
        final = {"p10": state.runs, "median": state.runs, "p90": state.runs}
    else:
        r = scenario(model, fixture, squad, innings=state.innings, batting=state.batting, runs=state.runs,
                     wickets=state.wickets, balls=state.legal_balls,
                     first_innings_total=state.first_innings_total, iterations=iterations, seed=seed)
        batting_name = fixture["team1"] if home_batting else fixture["team2"]
        batting_win = r["win_probability"][batting_name]
        final = r["projected_total"]

    home_win = batting_win if home_batting else 1 - batting_win
    return {
        "innings": state.innings,
        "batting": state.batting,
        "runs": state.runs,
        "wickets": state.wickets,
        "legal_balls": state.legal_balls,
        "first_innings_total": state.first_innings_total,
        "win_prob_home": round(float(home_win), 3),
        "proj_p10": int(final["p10"]),
        "proj_p50": int(final["median"]),
        "proj_p90": int(final["p90"]),
        "model_version": model.version,
    }


class LiveFeed(Protocol):
    """Adapter for a paid live-data provider.

    Implement `current_state` for the provider's API, register it in FEEDS,
    and run a poller during matches that calls it and stores `snapshot(...)`
    with scope PUBLIC_SCOPE and source "feed". Nothing else changes: the
    graphics endpoints already read public snapshots.
    """

    name: str

    def current_state(self, fixture: dict) -> MatchState | None:
        """Latest state for the fixture, or None if it hasn't started / isn't covered."""
        ...


FEEDS: dict[str, LiveFeed] = {}
