"""CricketMind AI — CricketData.org API Client

Wraps the free CricAPI (CricketData.org) for:
  - Fetching upcoming/recent matches
  - Getting squad/playing XI
  - Player info and basic stats
"""

import time
import requests
from typing import Optional, List
from utils.config import CRICDATA_API_KEY, CRICDATA_BASE_URL
from utils.logger import get_logger

logger = get_logger(__name__)


class CricDataClient:
    """Client for the CricketData.org (CricAPI v1) free API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or CRICDATA_API_KEY
        self.base_url = CRICDATA_BASE_URL
        self.session = requests.Session()
        self._last_request_time = 0.0

    def _request(self, endpoint: str, params: Optional[dict] = None) -> dict:
        """Make a rate-limited API request."""
        # Throttle: at least 100ms between requests
        elapsed = time.time() - self._last_request_time
        if elapsed < 0.1:
            time.sleep(0.1 - elapsed)

        url = f"{self.base_url}/{endpoint}"
        query = {"apikey": self.api_key}
        if params:
            query.update(params)

        try:
            resp = self.session.get(url, params=query, timeout=15)
            self._last_request_time = time.time()
            resp.raise_for_status()
            data = resp.json()

            if data.get("status") == "failure":
                logger.warning(
                    "CricAPI returned failure for %s: %s",
                    endpoint,
                    data.get("reason", "unknown"),
                )
                return {"status": "failure", "data": []}

            return data
        except requests.RequestException as e:
            logger.error("CricAPI request failed for %s: %s", endpoint, e)
            return {"status": "error", "data": []}

    # ----------------------------------------------------------------
    #  Match endpoints
    # ----------------------------------------------------------------

    def get_upcoming_matches(self, offset: int = 0) -> List[dict]:
        """Fetch upcoming cricket matches."""
        data = self._request("matches", {"offset": offset})
        matches = data.get("data", [])

        # Filter to upcoming only
        upcoming = [
            m
            for m in matches
            if m.get("matchStarted", False) is False
            or m.get("status", "").lower() in ("", "match not started")
        ]
        logger.info("Found %d upcoming matches (out of %d total)", len(upcoming), len(matches))
        return upcoming

    def get_current_matches(self) -> List[dict]:
        """Fetch currently live matches."""
        data = self._request("currentMatches")
        return data.get("data", [])

    def get_match_info(self, match_id: str) -> dict:
        """Fetch detailed info for a specific match."""
        data = self._request("match_info", {"id": match_id})
        return data.get("data", {})

    # ----------------------------------------------------------------
    #  Squad / Player endpoints
    # ----------------------------------------------------------------

    def get_match_squad(self, match_id: str) -> List[dict]:
        """Fetch squad (playing XI) for a match.

        Returns list of team dicts, each with 'teamName' and 'players'.
        """
        data = self._request("match_squad", {"id": match_id})
        squads = data.get("data", [])
        logger.info("Squad data retrieved for match %s: %d teams", match_id, len(squads))
        return squads

    def get_player_info(self, player_id: str) -> dict:
        """Fetch detailed player profile."""
        data = self._request("players_info", {"id": player_id})
        return data.get("data", {})

    # ----------------------------------------------------------------
    #  Series endpoints
    # ----------------------------------------------------------------

    def get_series_list(self) -> List[dict]:
        """Fetch list of current series."""
        data = self._request("series")
        return data.get("data", [])

    def get_series_info(self, series_id: str) -> dict:
        """Fetch info for a specific series."""
        data = self._request("series_info", {"id": series_id})
        return data.get("data", {})
