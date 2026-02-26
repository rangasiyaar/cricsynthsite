"""CricVeda AI 1.0 — Prediction Output Model"""

from typing import List, Optional
from pydantic import BaseModel, Field


class PlayerPrediction(BaseModel):
    """Predicted performance for a single player."""
    rank: int = 0
    player_name: str
    team: str
    role: str = ""
    predicted_runs: int = 0
    predicted_wickets: int = 0
    predicted_catches: int = 0
    predicted_batting_points: float = 0.0
    predicted_bowling_points: float = 0.0
    predicted_fielding_points: float = 0.0
    total_predicted_fantasy_points: float = 0.0
    confidence: str = "Medium"  # High, Medium, Low
    form_rating: float = 5.0
    venue_advantage: bool = False
    key_reason: str = ""


class CaptainPick(BaseModel):
    """Captain or Vice-Captain recommendation."""
    player: str
    reason: str = ""


class ValuePick(BaseModel):
    """Value pick or risky pick."""
    player: str
    reason: str = ""


class MatchPrediction(BaseModel):
    """Complete prediction output for a match."""
    match_id: str
    match: str
    format: str = ""
    venue: str = ""
    date: str = ""
    prediction_generated_at: str = ""

    # Context
    pitch_assessment: str = ""
    weather: str = ""

    # Rankings
    rankings: List[PlayerPrediction] = Field(default_factory=list)

    # Picks
    captain_pick: Optional[CaptainPick] = None
    vice_captain_pick: Optional[CaptainPick] = None
    top_value_picks: List[ValuePick] = Field(default_factory=list)
    risky_picks: List[ValuePick] = Field(default_factory=list)
