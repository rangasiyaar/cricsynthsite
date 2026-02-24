"""CricketMind AI — Player Data Model"""

from typing import Optional, List
from pydantic import BaseModel, Field


class RecentPerformance(BaseModel):
    """A single recent match performance."""
    match: str = ""
    runs: int = 0
    wickets: int = 0
    economy: Optional[float] = None
    strike_rate: Optional[float] = None
    date: str = ""


class BattingStats(BaseModel):
    """Career batting statistics."""
    matches: int = 0
    innings: int = 0
    runs: int = 0
    average: float = 0.0
    strike_rate: float = 0.0
    highest_score: int = 0
    fifties: int = 0
    hundreds: int = 0
    ducks: int = 0
    fours: int = 0
    sixes: int = 0


class BowlingStats(BaseModel):
    """Career bowling statistics."""
    matches: int = 0
    innings: int = 0
    overs: float = 0.0
    wickets: int = 0
    average: float = 0.0
    economy: float = 0.0
    strike_rate: float = 0.0
    best_figures: str = ""
    four_wickets: int = 0
    five_wickets: int = 0


class FieldingStats(BaseModel):
    """Career fielding statistics."""
    catches: int = 0
    stumpings: int = 0
    run_outs: int = 0


class VenueStats(BaseModel):
    """Player performance at a specific venue."""
    venue: str = ""
    batting_avg: float = 0.0
    bowling_avg: float = 0.0
    highest_score: int = 0
    best_bowling: str = ""
    matches_played: int = 0


class OppositionStats(BaseModel):
    """Player performance against a specific team."""
    opponent: str = ""
    batting_avg: float = 0.0
    bowling_avg: float = 0.0
    matches_played: int = 0


class PlayerProfile(BaseModel):
    """Complete unified player profile for prediction."""
    # Identity
    player_id: str = ""
    name: str
    team: str
    role: str = Field(
        default="Unknown",
        description="Batsman, Bowler, All-rounder, or WK-Batsman"
    )
    batting_style: str = ""  # RHB, LHB
    bowling_style: str = ""  # RF, LF, OB, LB, SLA, etc.
    image_url: str = ""

    # Career stats
    batting: BattingStats = BattingStats()
    bowling: BowlingStats = BowlingStats()
    fielding: FieldingStats = FieldingStats()

    # Recent form (last 5 matches)
    recent_form: List[RecentPerformance] = Field(default_factory=list)

    # Context-specific
    venue_stats: Optional[VenueStats] = None
    opposition_stats: Optional[OppositionStats] = None

    # Current year stats
    current_year_batting_avg: float = 0.0
    current_year_bowling_avg: float = 0.0
    current_year_matches: int = 0

    @property
    def form_rating(self) -> float:
        """Calculate a 1-10 form rating based on recent performances."""
        if not self.recent_form:
            return 5.0

        total = 0.0
        for perf in self.recent_form[-5:]:
            score = 0.0
            # Batting contribution
            score += min(perf.runs / 20, 3.0)  # Max 3 from batting
            # Bowling contribution
            score += min(perf.wickets * 1.5, 3.0)  # Max 3 from bowling
            # Strike rate bonus
            if perf.strike_rate and perf.strike_rate > 140:
                score += 0.5
            # Economy bonus
            if perf.economy and perf.economy < 7:
                score += 0.5
            total += score

        avg = total / len(self.recent_form[-5:])
        return round(min(max(avg * 1.5, 1.0), 10.0), 1)
