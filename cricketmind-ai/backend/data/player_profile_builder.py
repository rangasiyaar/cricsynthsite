"""CricVeda AI 1.0 — Player Profile Builder (Sportmonks-only)

Builds PlayerProfile objects from Sportmonks squad/lineup data.
No external dependencies other than Sportmonks.
"""

from typing import List, Optional
from models.player import (
    PlayerProfile,
    BattingStats,
    BowlingStats,
    FieldingStats,
    RecentPerformance,
    VenueStats,
)
from utils.logger import get_logger

logger = get_logger(__name__)


class PlayerProfileBuilder:
    """Builds player profiles from Sportmonks data."""

    def build_profiles_for_match(
        self,
        match_id: str,
        format_type: str = "t20",
        venue: str = "",
        sportmonks_lineups: Optional[List[dict]] = None,
    ) -> List[PlayerProfile]:
        """Build profiles from Sportmonks lineup/squad data.

        Args:
            match_id: Sportmonks fixture ID.
            format_type: t20, odi, test.
            venue: Venue name for context.
            sportmonks_lineups: [{teamName, players: [{name, id, role, ...}]}]
        """
        if not sportmonks_lineups:
            logger.warning("No lineup/squad data for match %s", match_id)
            return []

        profiles = []
        for team_data in sportmonks_lineups:
            team_name = team_data.get("teamName", "Unknown")
            players = team_data.get("players", [])

            for p in players:
                profile = PlayerProfile(
                    player_id=str(p.get("id", "")),
                    name=p.get("name", "Unknown"),
                    team=team_name,
                    role=p.get("role", "Unknown") or "Unknown",
                    batting_style=p.get("batting_style") or "",
                    bowling_style=p.get("bowling_style") or "",
                    image_url=p.get("image") or "",
                )
                profiles.append(profile)

        logger.info("Built %d player profiles for match %s", len(profiles), match_id)
        return profiles
