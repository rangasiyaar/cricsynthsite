"""CricketMind AI — Unified Player Profile Builder

Merges data from three sources (ESPN API, CricAPI, Cricsheet, ESPN scraper) into
a single PlayerProfile for each of the 22 players in a match.
ESPN API is now the primary source for squad/roster data.
Conflict resolution: most recent/richest source wins.
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
from data.cricdata_client import CricDataClient
from data.cricsheet_loader import CricsheetLoader
from data.espn_scraper import ESPNScraper
from data.espn_client import ESPNClient
from utils.logger import get_logger

logger = get_logger(__name__)


class PlayerProfileBuilder:
    """Builds unified player profiles from multiple data sources."""

    def __init__(
        self,
        cricdata: Optional[CricDataClient] = None,
        cricsheet: Optional[CricsheetLoader] = None,
        espn: Optional[ESPNScraper] = None,
        espn_client: Optional[ESPNClient] = None,
    ):
        self.cricdata = cricdata
        self.cricsheet = cricsheet or CricsheetLoader()
        self.espn = espn or ESPNScraper()
        self.espn_client = espn_client or ESPNClient()

    def build_profiles_for_match(
        self,
        match_id: str,
        format_type: str = "t20",
        venue: str = "",
        espn_rosters: Optional[List[dict]] = None,
    ) -> List[PlayerProfile]:
        """Build complete profiles for all players in a match.

        Args:
            match_id: Match ID (ESPN event ID or CricAPI match ID).
            format_type: Cricket format (t20, odi, test).
            venue: Venue name for venue-specific stats.
            espn_rosters: Pre-fetched ESPN rosters. If provided, bypasses
                          all squad-fetching logic.

        Returns:
            List of PlayerProfile for all players.
        """
        profiles = []

        # Primary path: Use ESPN rosters if provided
        if espn_rosters:
            profiles = self._build_from_espn_rosters(
                espn_rosters, format_type, venue
            )
        else:
            # Fallback: try CricData squad
            if self.cricdata:
                profiles = self._build_from_cricdata(
                    match_id, format_type, venue
                )

            # Last resort: try fetching ESPN rosters directly
            if not profiles:
                logger.info("Attempting ESPN roster fetch for match %s", match_id)
                try:
                    rosters = self.espn_client.get_rosters(match_id)
                    if rosters:
                        profiles = self._build_from_espn_rosters(
                            rosters, format_type, venue
                        )
                except Exception as e:
                    logger.warning("ESPN roster fetch failed: %s", e)

        logger.info(
            "Built %d player profiles for match %s", len(profiles), match_id
        )
        return profiles

    def _build_from_espn_rosters(
        self,
        rosters: List[dict],
        format_type: str,
        venue: str,
    ) -> List[PlayerProfile]:
        """Build profiles from ESPN roster data."""
        profiles = []

        for team_data in rosters:
            team_name = team_data.get("teamName", "Unknown")
            players = team_data.get("players", [])

            for player_data in players:
                player_name = player_data.get("name", "Unknown")
                player_id = player_data.get("id", "")
                role = player_data.get("role", "Unknown")

                profile = PlayerProfile(
                    player_id=str(player_id),
                    name=player_name,
                    team=team_name,
                    role=role,
                )

                # Enrich from additional sources
                profile = self._enrich_profile(
                    profile, player_name, player_id, format_type, venue
                )
                profiles.append(profile)

        return profiles

    def _build_from_cricdata(
        self,
        match_id: str,
        format_type: str,
        venue: str,
    ) -> List[PlayerProfile]:
        """Build profiles from CricData squad data (legacy fallback)."""
        profiles = []
        squads = self.cricdata.get_match_squad(match_id)

        for team_data in squads:
            team_name = team_data.get("teamName", "Unknown")
            players = team_data.get("players", [])

            for player_data in players:
                profile = self._build_single_profile(
                    player_data, team_name, format_type, venue
                )
                profiles.append(profile)

        return profiles

    def _enrich_profile(
        self,
        profile: PlayerProfile,
        player_name: str,
        player_id: str,
        format_type: str,
        venue: str,
    ) -> PlayerProfile:
        """Enrich a profile with data from Cricsheet and ESPN scraper."""
        # CricData detailed info (optional enrichment)
        if self.cricdata and player_id:
            try:
                detailed = self.cricdata.get_player_info(str(player_id))
                if detailed:
                    profile = self._enrich_from_cricapi(profile, detailed)
            except Exception as e:
                logger.warning("CricAPI detail fetch failed for %s: %s", player_name, e)

        # Cricsheet historical data
        try:
            batting_hist = self.cricsheet.get_player_batting_stats(
                player_name, format_type
            )
            if batting_hist:
                profile = self._enrich_from_cricsheet_batting(profile, batting_hist)

            bowling_hist = self.cricsheet.get_player_bowling_stats(
                player_name, format_type
            )
            if bowling_hist:
                profile = self._enrich_from_cricsheet_bowling(profile, bowling_hist)

        except Exception as e:
            logger.warning("Cricsheet data failed for %s: %s", player_name, e)

        # ESPN deep stats (scraper)
        try:
            espn_stats = self.espn.get_player_stats(player_name)
            if espn_stats:
                profile = self._enrich_from_espn(profile, espn_stats)
        except Exception as e:
            logger.warning("ESPN scraping failed for %s: %s", player_name, e)

        return profile

    def _build_single_profile(
        self,
        player_data: dict,
        team_name: str,
        format_type: str,
        venue: str,
    ) -> PlayerProfile:
        """Build a single player profile from CricData + enrichment sources."""
        player_name = player_data.get("name", player_data.get("playerName", "Unknown"))
        player_id = player_data.get("id", player_data.get("playerId", ""))

        logger.info("Building profile for: %s (%s)", player_name, team_name)

        profile = PlayerProfile(
            player_id=str(player_id),
            name=player_name,
            team=team_name,
            role=self._normalize_role(player_data.get("role", "")),
            batting_style=player_data.get("battingStyle", ""),
            bowling_style=player_data.get("bowlingStyle", ""),
            image_url=player_data.get("playerImg", ""),
        )

        # Enrich from all additional sources
        profile = self._enrich_profile(
            profile, player_name, player_id, format_type, venue
        )

        return profile

    def _normalize_role(self, role: str) -> str:
        """Normalize player role string."""
        role_lower = role.lower()
        if "bat" in role_lower and "bowl" in role_lower:
            return "All-rounder"
        if "allrounder" in role_lower or "all-rounder" in role_lower:
            return "All-rounder"
        if "wk" in role_lower or "keeper" in role_lower:
            return "WK-Batsman"
        if "bowl" in role_lower:
            return "Bowler"
        if "bat" in role_lower:
            return "Batsman"
        return role or "Unknown"

    def _enrich_from_cricapi(self, profile: PlayerProfile, data: dict) -> PlayerProfile:
        """Enrich profile with CricAPI detailed data."""
        if data.get("role"):
            profile.role = self._normalize_role(data["role"])
        if data.get("battingStyle"):
            profile.batting_style = data["battingStyle"]
        if data.get("bowlingStyle"):
            profile.bowling_style = data["bowlingStyle"]
        if data.get("playerImg"):
            profile.image_url = data["playerImg"]

        stats = data.get("stats", [])
        for stat_group in stats:
            fn = stat_group.get("fn", "")
            if "t20" in fn.lower() or "odi" in fn.lower():
                values = stat_group.get("value", {})

                if stat_group.get("stat") == "batting":
                    if values.get("matches"):
                        profile.batting.matches = int(values.get("matches", 0))
                    if values.get("runs"):
                        profile.batting.runs = int(values.get("runs", 0))
                    if values.get("average"):
                        try:
                            profile.batting.average = float(values["average"])
                        except (ValueError, TypeError):
                            pass

        return profile

    def _enrich_from_cricsheet_batting(
        self, profile: PlayerProfile, stats: dict
    ) -> PlayerProfile:
        """Enrich profile with Cricsheet batting data."""
        if stats.get("innings"):
            profile.batting.innings = stats["innings"]
        if stats.get("runs") and stats["runs"] > profile.batting.runs:
            profile.batting.runs = stats["runs"]
        if stats.get("average"):
            profile.batting.average = stats["average"]
        if stats.get("strike_rate"):
            profile.batting.strike_rate = stats["strike_rate"]
        if stats.get("fours"):
            profile.batting.fours = stats["fours"]
        if stats.get("sixes"):
            profile.batting.sixes = stats["sixes"]

        recent_scores = stats.get("recent_scores", [])
        for i, score in enumerate(recent_scores):
            profile.recent_form.append(
                RecentPerformance(
                    match=f"Recent Match {i + 1}",
                    runs=int(score),
                )
            )

        return profile

    def _enrich_from_cricsheet_bowling(
        self, profile: PlayerProfile, stats: dict
    ) -> PlayerProfile:
        """Enrich profile with Cricsheet bowling data."""
        if stats.get("wickets") and stats["wickets"] > profile.bowling.wickets:
            profile.bowling.wickets = stats["wickets"]
        if stats.get("average"):
            profile.bowling.average = stats["average"]
        if stats.get("economy"):
            profile.bowling.economy = stats["economy"]
        if stats.get("overs"):
            profile.bowling.overs = stats["overs"]

        recent_wkts = stats.get("recent_wickets", [])
        for i, wkts in enumerate(recent_wkts):
            if i < len(profile.recent_form):
                profile.recent_form[i].wickets = int(wkts)
            else:
                profile.recent_form.append(
                    RecentPerformance(
                        match=f"Recent Match {i + 1}",
                        wickets=int(wkts),
                    )
                )

        return profile

    def _enrich_from_espn(self, profile: PlayerProfile, stats: dict) -> PlayerProfile:
        """Enrich profile with ESPN deep stats (fills gaps)."""
        if stats.get("matches") and not profile.batting.matches:
            profile.batting.matches = stats["matches"]
        if stats.get("batting_avg") and not profile.batting.average:
            profile.batting.average = stats["batting_avg"]
        if stats.get("strike_rate") and not profile.batting.strike_rate:
            profile.batting.strike_rate = stats["strike_rate"]
        if stats.get("hundreds"):
            profile.batting.hundreds = stats["hundreds"]
        if stats.get("fifties"):
            profile.batting.fifties = stats["fifties"]
        if stats.get("bowling_avg") and not profile.bowling.average:
            profile.bowling.average = stats["bowling_avg"]
        if stats.get("economy") and not profile.bowling.economy:
            profile.bowling.economy = stats["economy"]
        if stats.get("wickets") and not profile.bowling.wickets:
            profile.bowling.wickets = stats["wickets"]

        return profile
