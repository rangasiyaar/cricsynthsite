"""CricVeda AI 1.0 — Match Data Model"""

from typing import List, Optional
from pydantic import BaseModel, Field


class MatchInfo(BaseModel):
    """Match metadata."""
    match_id: str = ""
    name: str = ""  # e.g., "India vs Australia"
    match_type: str = ""  # T20, ODI, Test
    status: str = ""  # upcoming, live, completed
    venue: str = ""
    city: str = ""
    date: str = ""
    date_time_gmt: str = ""
    teams: List[str] = Field(default_factory=list)
    team_info: List[dict] = Field(default_factory=list)
    series_id: str = ""
    series_name: str = ""


class MatchContext(BaseModel):
    """Contextual factors for a match."""
    pitch_type: str = ""  # Batting-friendly, Bowling-friendly, Balanced, Spin-friendly, Pace-friendly
    avg_first_innings_score: int = 0
    avg_second_innings_score: int = 0
    highest_total: int = 0
    lowest_total: int = 0
    weather: str = ""
    temperature: str = ""
    humidity: str = ""
    wind: str = ""
    dew_factor: bool = False
    day_night: bool = False
    toss_bat_first_win_pct: float = 50.0
    toss_chase_win_pct: float = 50.0
    venue_notes: str = ""
