"""CricketMind AI — ESPN Public API Client

Primary data source for match listings and squad/roster data.
Uses ESPN's free public JSON API (no API key required).

Endpoints:
  - /scoreboard → Match listings (upcoming, live, recent)
  - /summary?event={id} → Full match detail with rosters, toss, venue
"""

import requests
from typing import Optional, List, Dict
from utils.logger import get_logger

logger = get_logger(__name__)

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/cricket"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# League IDs for ESPN Cricket API
LEAGUE_IDS = {
    "international": "8039",
    "ipl": "8048",
    "bbl": "8044",
    "psl": "8038",
    "cpl": "8049",
    "t20_blast": "8051",
    "the_hundred": "8171",
    "sa20": "8198",
    "bpl": "8131",
    "lpl": "8173",
}


class ESPNClient:
    """Client for ESPN's public cricket JSON API.

    No API key required — fully free and unlimited.
    """

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    # ----------------------------------------------------------------
    #  Match Listings
    # ----------------------------------------------------------------

    def get_matches(self, league_id: str = "8039") -> List[dict]:
        """Fetch matches from the ESPN scoreboard.

        Args:
            league_id: ESPN league ID (default: 8039 = International).

        Returns:
            List of match dicts normalized to our internal format:
            {id, name, teams, matchType, venue, date, status}
        """
        url = f"{ESPN_BASE}/{league_id}/scoreboard"
        try:
            resp = self.session.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            logger.error("ESPN scoreboard request failed: %s", e)
            return []

        events = data.get("events", [])
        logger.info("ESPN scoreboard for league %s: %d events", league_id, len(events))

        matches = []
        for event in events:
            match = self._normalize_event(event, league_id)
            if match:
                matches.append(match)

        return matches

    def get_all_matches(self, league_ids: Optional[List[str]] = None) -> List[dict]:
        """Fetch matches across multiple leagues.

        Args:
            league_ids: List of ESPN league IDs. Defaults to all known leagues.

        Returns:
            Combined list of normalized match dicts.
        """
        if league_ids is None:
            league_ids = list(LEAGUE_IDS.values())

        all_matches = []
        for lid in league_ids:
            try:
                matches = self.get_matches(lid)
                all_matches.extend(matches)
            except Exception as e:
                logger.warning("Failed to fetch league %s: %s", lid, e)

        return all_matches

    # ----------------------------------------------------------------
    #  Match Detail & Rosters
    # ----------------------------------------------------------------

    def get_match_detail(self, event_id: str, league_id: str = "8039") -> dict:
        """Fetch full match detail including venue, toss, and format.

        Args:
            event_id: ESPN event ID.
            league_id: ESPN league ID.

        Returns:
            Match info dict: {id, name, teams, matchType, venue, date, status, toss}
        """
        url = f"{ESPN_BASE}/{league_id}/summary"
        try:
            resp = self.session.get(url, params={"event": event_id}, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            logger.error("ESPN match detail failed for %s: %s", event_id, e)
            return {}

        # Build match info from the summary response
        header = data.get("header", {})
        competitions = header.get("competitions", [])
        if not competitions:
            # Fallback: try from the event-level scoreboard data
            logger.warning("No competitions in summary for event %s", event_id)
            return {}

        comp = competitions[0]

        # Teams
        competitors = comp.get("competitors", [])
        teams = [c.get("team", {}).get("displayName", "Unknown") for c in competitors]

        # Venue
        venue_data = comp.get("venue", data.get("gameInfo", {}).get("venue", {}))
        venue_name = venue_data.get("fullName", venue_data.get("shortName", "Unknown"))

        # Date
        date_str = comp.get("date", header.get("date", ""))

        # Status
        status_obj = comp.get("status", {})
        status = status_obj.get("type", {}).get("description", "Unknown")

        # Match format from league or notes
        game_info = data.get("gameInfo", {})
        match_type = self._infer_format(header, game_info, league_id)

        # Toss info
        toss_info = self._extract_toss(data)

        match_info = {
            "id": str(event_id),
            "name": f"{teams[0]} vs {teams[1]}" if len(teams) >= 2 else "Unknown Match",
            "teams": teams,
            "matchType": match_type,
            "venue": venue_name,
            "date": date_str,
            "status": status,
        }

        if toss_info:
            match_info["toss"] = toss_info

        logger.info("ESPN match detail: %s at %s", match_info["name"], venue_name)
        return match_info

    def get_rosters(self, event_id: str, league_id: str = "8039") -> List[dict]:
        """Fetch team rosters/squads for a match.

        Args:
            event_id: ESPN event ID.
            league_id: ESPN league ID.

        Returns:
            List of team dicts, each with:
            {teamName, players: [{name, id, role, position}]}
        """
        url = f"{ESPN_BASE}/{league_id}/summary"
        try:
            resp = self.session.get(url, params={"event": event_id}, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            logger.error("ESPN roster fetch failed for %s: %s", event_id, e)
            return []

        rosters = data.get("rosters", [])
        if not rosters:
            # Fallback: try competitors from header → lineup/roster
            logger.info("No 'rosters' key, trying header competitors for %s", event_id)
            rosters = self._extract_rosters_from_header(data)

        result = []
        for team_roster in rosters:
            team_name = team_roster.get("team", {}).get("displayName", "Unknown")
            players_raw = team_roster.get("roster", [])

            players = []
            for p in players_raw:
                athlete = p.get("athlete", {})
                position = athlete.get("position", p.get("position", {}))
                position_name = ""
                if isinstance(position, dict):
                    position_name = position.get("name", position.get("abbreviation", ""))
                elif isinstance(position, str):
                    position_name = position

                players.append({
                    "name": athlete.get("displayName", athlete.get("fullName", "Unknown")),
                    "id": str(athlete.get("id", p.get("playerId", ""))),
                    "role": self._normalize_espn_position(position_name),
                    "position": position_name,
                })

            result.append({
                "teamName": team_name,
                "players": players,
            })

            logger.info("ESPN roster: %s — %d players", team_name, len(players))

        return result

    # ----------------------------------------------------------------
    #  Private Helpers
    # ----------------------------------------------------------------

    def _normalize_event(self, event: dict, league_id: str) -> Optional[dict]:
        """Normalize an ESPN event into our standard match dict."""
        competitions = event.get("competitions", [])
        if not competitions:
            return None

        comp = competitions[0]
        competitors = comp.get("competitors", [])
        teams = [c.get("team", {}).get("displayName", "Unknown") for c in competitors]

        venue = comp.get("venue", {})
        status = comp.get("status", {}).get("type", {}).get("description", "")

        # Gather all text hints for format detection
        event_name = event.get("name", "")
        comp_note = comp.get("note", "")
        season_name = event.get("season", {}).get("name", "")

        match_format = self._detect_format(
            event_name, comp_note, season_name, league_id
        )

        # Human-readable date
        raw_date = event.get("date", "")
        display_date = self._format_date(raw_date)

        # League display name
        league_name = self._league_display_name(league_id)

        return {
            "id": str(event.get("id", "")),
            "name": event.get("name", f"{' vs '.join(teams)}"),
            "teams": teams,
            "matchType": match_format,
            "venue": venue.get("fullName", venue.get("shortName", "Unknown")),
            "date": display_date,
            "date_raw": raw_date,
            "status": status,
            "league_id": league_id,
            "league": league_name,
        }

    def _detect_format(self, event_name: str, note: str, season: str, league_id: str) -> str:
        """Detect match format from all available text and league ID."""
        # Franchise T20 leagues are always T20
        t20_leagues = {"8048", "8044", "8038", "8049", "8051", "8198", "8131", "8173"}
        if league_id in t20_leagues:
            return "T20"
        if league_id == "8171":  # The Hundred
            return "T20"

        # For international & others — scan all text for format clues
        all_text = f"{event_name} {note} {season}".lower()

        # Order matters: check most specific first
        if "t20" in all_text or "twenty20" in all_text:
            return "T20"
        if "odi" in all_text or "one day" in all_text or "one-day" in all_text:
            return "ODI"
        if "test" in all_text:
            return "Test"

        return "Unknown"

    def _infer_format(self, header: dict, game_info: dict, league_id: str) -> str:
        """Infer match format from summary response data."""
        # Check header name / description
        name = header.get("name", header.get("description", ""))

        # Check game notes
        notes = game_info.get("notes", [])
        note_text = " ".join(str(n) for n in notes)

        season = header.get("season", {}).get("name", "")

        return self._detect_format(name, note_text, season, league_id)

    @staticmethod
    def _format_date(iso_date: str) -> str:
        """Convert ISO date string to human-readable format."""
        if not iso_date:
            return "TBD"
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
            return dt.strftime("%b %d, %Y %H:%M UTC")
        except (ValueError, TypeError):
            return iso_date

    @staticmethod
    def _league_display_name(league_id: str) -> str:
        """Map league ID to human display name."""
        names = {
            "8039": "International",
            "8048": "IPL",
            "8044": "BBL",
            "8038": "PSL",
            "8049": "CPL",
            "8051": "T20 Blast",
            "8171": "The Hundred",
            "8198": "SA20",
            "8131": "BPL",
            "8173": "LPL",
        }
        return names.get(league_id, league_id)

    def _extract_toss(self, data: dict) -> str:
        """Extract toss information from match data."""
        # Try gameInfo → toss
        game_info = data.get("gameInfo", {})
        toss = game_info.get("tpiWinner", "")
        toss_decision = game_info.get("tpiDecision", "")

        if toss and toss_decision:
            return f"{toss} won the toss and chose to {toss_decision}"

        # Try notes
        header = data.get("header", {})
        competitions = header.get("competitions", [])
        if competitions:
            notes = competitions[0].get("notes", [])
            for note in notes:
                text = note.get("text", note.get("headline", ""))
                if "toss" in text.lower():
                    return text

        return ""

    def _extract_rosters_from_header(self, data: dict) -> list:
        """Fallback: extract rosters from header competitors."""
        header = data.get("header", {})
        competitions = header.get("competitions", [])
        if not competitions:
            return []

        result = []
        for comp in competitions[:1]:
            for competitor in comp.get("competitors", []):
                team = competitor.get("team", {})
                lineup = competitor.get("lineup", [])
                roster = competitor.get("roster", [])
                players = lineup or roster

                if players:
                    formatted = []
                    for p in players:
                        athlete = p if "displayName" in p else p.get("athlete", p)
                        formatted.append({"athlete": athlete})

                    result.append({
                        "team": {"displayName": team.get("displayName", "Unknown")},
                        "roster": formatted,
                    })

        return result

    @staticmethod
    def _normalize_espn_position(position: str) -> str:
        """Map ESPN position names to our role format."""
        pos = position.lower()
        if not pos:
            return "Unknown"
        if "allrounder" in pos or "all-rounder" in pos or "all rounder" in pos:
            return "All-rounder"
        if "wicketkeeper" in pos or "keeper" in pos or "wk" in pos:
            return "WK-Batsman"
        if "bowl" in pos:
            return "Bowler"
        if "bat" in pos or "open" in pos or "top" in pos:
            return "Batsman"
        return position or "Unknown"
