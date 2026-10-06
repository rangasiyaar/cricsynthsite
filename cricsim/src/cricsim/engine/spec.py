"""Inputs to a simulation: the match, and an optional user scenario."""
from __future__ import annotations

from dataclasses import dataclass, field

from cricsim.engine.states import FORMAT_RULES


@dataclass
class TeamSpec:
    name: str
    players: list[str]                          # Cricsheet ids, batting order (11)
    bowlers: list[str] | None = None            # who may bowl; default: anyone, weighted by history
    team_id: str | None = None


@dataclass
class MatchSpec:
    format: str                                 # T20 | T10 | HUNDRED | OD
    gender: str                                 # male | female
    teams: tuple[TeamSpec, TeamSpec]
    venue_id: str | None = None
    comp_key: str | None = None                 # e.g. "indian-premier-league"
    batting_first: int | None = None            # 0 / 1; None = unknown (toss): half the simulations each way
    overs: int | None = None                    # reduced-overs match
    attributes: dict[str, dict] = field(default_factory=dict)   # pid → {"hand": .., "kind": ..} for unknowns

    @property
    def rules(self) -> dict:
        r = dict(FORMAT_RULES[self.format])
        if self.overs:
            r["quota"] = max(1, -(-self.overs * r["quota"] // r["overs"]))
            r["pp"] = max(1, round(r["pp"] * self.overs / r["overs"]))
            r["overs"] = self.overs
        return r


@dataclass
class StartState:
    """Resume from a point in the match (Scenario Lab: 'what if it's 45/3 after 8 overs?')."""
    innings: int = 1                            # 1 or 2
    runs: int = 0
    wickets: int = 0
    balls: int = 0                              # legal balls bowled in this innings
    first_innings_total: int | None = None      # needed when innings == 2
    striker: str | None = None
    non_striker: str | None = None
    striker_score: tuple[int, int] = (0, 0)     # runs, balls
    non_striker_score: tuple[int, int] = (0, 0)
    out: list[str] = field(default_factory=list)          # batters already dismissed
    bowler_overs: dict[str, int] = field(default_factory=dict)


@dataclass
class Scenario:
    """User levers. Multipliers are relative to the model (1.0 = unchanged)."""
    start: StartState | None = None
    boundary_mult: float = 1.0                  # flat pitch / short boundaries > 1
    wicket_mult: float = 1.0                    # seaming / turning pitch > 1
    spin_wicket_mult: float = 1.0               # extra help for spinners
    pace_wicket_mult: float = 1.0
    dew: float = 0.0                            # 0..1: 2nd-innings spinners less effective, more boundaries
    extras_mult: float = 1.0
    player_form: dict[str, float] = field(default_factory=dict)   # pid → batting/bowling form multiplier (>1 = in form)
    exclude_bowlers: list[str] = field(default_factory=list)
    batting_order: dict[int, list[str]] = field(default_factory=dict)   # team index → new order
    target: int | None = None                   # override chase target
    conditions: bool = True                     # draw match-level pitch/weather variation (False = 'average day')
