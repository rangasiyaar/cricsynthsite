"""CricketMind AI — ESPNcricinfo Stats Scraper

Scrapes deep career statistics from ESPNcricinfo as an enrichment
source for player profiles. Uses BeautifulSoup with polite rate limiting.
"""

import time
import requests
from bs4 import BeautifulSoup
from typing import Optional, Dict
from utils.config import ESPN_DELAY_SECONDS
from utils.logger import get_logger

logger = get_logger(__name__)

ESPN_BASE = "https://www.espncricinfo.com"
SEARCH_URL = f"{ESPN_BASE}/ci/content/player/search.html"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}


class ESPNScraper:
    """Scrapes player stats from ESPNcricinfo."""

    def __init__(self, delay: float = ESPN_DELAY_SECONDS):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self._last_request = 0.0

    def _throttled_get(self, url: str, params: Optional[dict] = None) -> Optional[requests.Response]:
        """Make a throttled GET request."""
        elapsed = time.time() - self._last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)

        try:
            resp = self.session.get(url, params=params, timeout=15)
            self._last_request = time.time()
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            logger.error("ESPN request failed for %s: %s", url, e)
            return None

    def search_player(self, player_name: str) -> Optional[str]:
        """Search for a player and return their ESPN profile URL.

        Args:
            player_name: Full name of the player.

        Returns:
            ESPN profile URL or None if not found.
        """
        resp = self._throttled_get(
            f"{ESPN_BASE}/ci/content/player/search.html",
            params={"search": player_name},
        )
        if not resp:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")

        # Look for player links in search results
        links = soup.find_all("a", href=True)
        for link in links:
            href = link.get("href", "")
            if "/player/" in href and player_name.split()[-1].lower() in href.lower():
                if href.startswith("/"):
                    return f"{ESPN_BASE}{href}"
                return href

        # Try the direct cricinfo player search API
        try:
            api_url = f"{ESPN_BASE}/ci/engine/match/search.json"
            resp2 = self._throttled_get(api_url, params={"search": player_name})
            if resp2:
                data = resp2.json()
                players = data.get("player", [])
                if players:
                    pid = players[0].get("object_id")
                    return f"{ESPN_BASE}/ci/content/player/{pid}.html"
        except Exception:
            pass

        logger.warning("Could not find ESPN profile for %s", player_name)
        return None

    def get_player_stats(self, player_name: str) -> Dict:
        """Scrape career stats for a player from ESPNcricinfo.

        Returns:
            Dict with batting_avg, bowling_avg, matches, etc.
            Empty dict if player not found or scraping fails.
        """
        profile_url = self.search_player(player_name)
        if not profile_url:
            return self._get_fallback_stats(player_name)

        resp = self._throttled_get(profile_url)
        if not resp:
            return {}

        soup = BeautifulSoup(resp.text, "html.parser")
        stats = {}

        try:
            # Try to extract stats tables
            tables = soup.find_all("table")
            for table in tables:
                rows = table.find_all("tr")
                for row in rows:
                    cells = row.find_all(["td", "th"])
                    if len(cells) >= 2:
                        label = cells[0].get_text(strip=True).lower()
                        value = cells[1].get_text(strip=True)

                        if "matches" in label or "mat" == label:
                            stats["matches"] = self._parse_int(value)
                        elif "runs" in label:
                            stats["runs"] = self._parse_int(value)
                        elif label in ("ave", "average", "bat ave"):
                            stats["batting_avg"] = self._parse_float(value)
                        elif label in ("sr", "strike rate"):
                            stats["strike_rate"] = self._parse_float(value)
                        elif label in ("wkts", "wickets"):
                            stats["wickets"] = self._parse_int(value)
                        elif label in ("bowl ave", "bowling ave"):
                            stats["bowling_avg"] = self._parse_float(value)
                        elif label in ("econ", "economy"):
                            stats["economy"] = self._parse_float(value)
                        elif "100s" in label or "hundreds" in label:
                            stats["hundreds"] = self._parse_int(value)
                        elif "50s" in label or "fifties" in label:
                            stats["fifties"] = self._parse_int(value)

        except Exception as e:
            logger.warning("Failed to parse ESPN stats for %s: %s", player_name, e)

        logger.info("Scraped ESPN stats for %s: %d data points", player_name, len(stats))
        return stats

    def _get_fallback_stats(self, player_name: str) -> Dict:
        """Try alternate search strategies."""
        # Try direct search with simplified name
        parts = player_name.strip().split()
        if len(parts) >= 2:
            # Try last name only
            simple = parts[-1]
            profile_url = self.search_player(simple)
            if profile_url:
                logger.info("Found %s via simplified search '%s'", player_name, simple)
                return self.get_player_stats(simple)
        return {}

    @staticmethod
    def _parse_int(value: str) -> int:
        """Safely parse integer from string."""
        try:
            return int(value.replace(",", "").replace("*", "").strip())
        except (ValueError, AttributeError):
            return 0

    @staticmethod
    def _parse_float(value: str) -> float:
        """Safely parse float from string."""
        try:
            return float(value.replace(",", "").replace("*", "").replace("-", "0").strip())
        except (ValueError, AttributeError):
            return 0.0
