from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum


class BowlingStyle(str, Enum):
    RIGHT_ARM_FAST = "right-arm-fast"
    RIGHT_ARM_MEDIUM = "right-arm-medium"
    RIGHT_ARM_OFF_BREAK = "right-arm-off-break"
    RIGHT_ARM_LEG_BREAK = "right-arm-leg-break"
    LEFT_ARM_FAST = "left-arm-fast"
    SLOW_LEFT_ARM = "slow-left-arm"


class PlayerRole(str, Enum):
    BAT = "BAT"
    BOWL = "BOWL"
    AR = "AR"    # All-rounder
    WK = "WK"   # Wicket-keeper


class BattingHand(str, Enum):
    LEFT = "Left hand"
    RIGHT = "Right hand"


class ExtraType(str, Enum):
    WIDE = "wides"
    NO_BALL = "noballs"
    BYE = "byes"
    LEG_BYE = "legbyes"
    PENALTY = "penalty"


# Dismissal types where the bowler does NOT get credit for the wicket
NON_BOWLER_WICKETS = frozenset({
    "run out",
    "retired hurt",
    "retired not out",
    "obstructing the field",
})


@dataclass
class PlayerMeta:
    player_id: int
    name: str
    batting_hand: BattingHand | None = None
    bowling_style: BowlingStyle | None = None
    bowling_style_raw: str | None = None
    primary_role: PlayerRole | None = None
    nationality: str | None = None
    dob: date | None = None


@dataclass
class MatchRecord:
    match_id: int
    league_id: str
    season: str
    match_date: date
    venue_name: str
    team1: str
    team2: str
    toss_winner: str | None = None
    toss_decision: str | None = None
    winner: str | None = None
    rain_affected: bool = False
    low_ball_count: bool = False


@dataclass
class DeliveryRecord:
    delivery_id: int
    match_id: int
    innings: int           # 1 or 2
    over_ball: float       # e.g. 3.4 = over 3, ball 4
    striker_name: str
    bowler_name: str
    non_striker_name: str
    runs_batter: int = 0
    runs_extras: int = 0
    runs_total: int = 0
    wicket_type: str | None = None
    wicket_player_name: str | None = None
    extras_type: str | None = None
    # Populated after name resolution
    striker_id: int | None = None
    bowler_id: int | None = None
    non_striker_id: int | None = None
    wicket_player_id: int | None = None


@dataclass
class LoadResult:
    matches_loaded: int = 0
    deliveries_loaded: int = 0
    files_skipped: int = 0
    errors: list[str] = field(default_factory=list)


@dataclass
class PlayerFantasyPoints:
    player_id: int
    match_id: int
    batting_points: float = 0.0
    bowling_points: float = 0.0
    fielding_points: float = 0.0
    total_points: float = 0.0
    training_exclude: bool = False


@dataclass
class ResolutionResult:
    player_id: int | None
    method: str  # 'dwillis' | 'fuzzy' | 'manual' | 'unresolved'
    confidence: float | None = None


@dataclass
class MatchResolutionStats:
    match_id: int
    total_names: int = 0
    resolved_dwillis: int = 0
    resolved_fuzzy: int = 0
    resolved_manual: int = 0
    unresolved: int = 0


@dataclass
class LeagueConfig:
    league_id: str
    name: str
    format: str
    tier: int
    difficulty_multiplier: float
    format_similarity_weight: float
    season_start_month: int
    dream11_active: bool
    cricsheet_key: str
