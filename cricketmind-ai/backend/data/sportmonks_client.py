"""CricVeda AI 1.0 — Sportmonks Cricket API Client

Sole data source for all cricket data: fixtures, squads, players, scoreboards.
Sportmonks Cricket API v2.0 (free tier: 180 calls/hr, 3 leagues).

Endpoints used:
  - GET /leagues
  - GET /fixtures (with filters + includes)
  - GET /fixtures/{id} (with batting, bowling, runs, scoreboards, lineup, venue, tosswon)
  - GET /teams/{id}/squad/{season_id}
  - GET /players/{id}?include=career
"""

import requests
from datetime import datetime
from typing import Optional, List
from utils.config import SPORTMONKS_API_KEY, SPORTMONKS_BASE_URL
from utils.logger import get_logger

logger = get_logger(__name__)


class SportmonksClient:
    """Sportmonks Cricket API v2.0 client."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or SPORTMONKS_API_KEY
        self.base = SPORTMONKS_BASE_URL
        self.session = requests.Session()

    def _get(self, endpoint: str, params: Optional[dict] = None, timeout: int = 20) -> dict:
        url = f"{self.base}/{endpoint}"
        query = {"api_token": self.api_key}
        if params:
            query.update(params)
        try:
            resp = self.session.get(url, params=query, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            logger.error("Sportmonks %s failed: %s", endpoint, e)
            return {"data": []}

    # ── Leagues ──────────────────────────────────────────────

    def get_leagues(self) -> List[dict]:
        data = self._get("leagues")
        return data.get("data", [])

    # ── Fixtures ─────────────────────────────────────────────

    def get_upcoming_fixtures(self) -> List[dict]:
        """Upcoming (Not Started) fixtures."""
        data = self._get("fixtures", {
            "filter[status]": "NS",
            "include": "localteam,visitorteam,venue,league",
            "sort": "starting_at",
        })
        return [self._norm(f) for f in data.get("data", [])]

    def get_live_fixtures(self) -> List[dict]:
        """Live fixtures (1st/2nd Innings, Innings Break, etc.)."""
        data = self._get("fixtures", {
            "filter[status]": "1st Innings,2nd Innings,Innings Break,Stump Day 1,Stump Day 2,Stump Day 3,Stump Day 4",
            "include": "localteam,visitorteam,venue,league,runs",
            "sort": "starting_at",
        })
        return [self._norm(f) for f in data.get("data", [])]

    def get_recent_fixtures(self, limit: int = 20) -> List[dict]:
        """Recent finished fixtures."""
        data = self._get("fixtures", {
            "filter[status]": "Finished",
            "include": "localteam,visitorteam,venue,league",
            "sort": "-starting_at",
            "per_page": str(limit),
        })
        return [self._norm(f) for f in data.get("data", [])]

    # ── Fixture Detail ───────────────────────────────────────

    def get_fixture_detail(self, fixture_id: int) -> dict:
        """Full fixture detail with all available data."""
        data = self._get(f"fixtures/{fixture_id}", {
            "include": "localteam,visitorteam,lineup,venue,tosswon,league,manofmatch,referee,firstumpire,secondumpire",
        })
        fix = data.get("data", {})
        if not fix:
            return {}

        detail = self._norm(fix)

        # Toss
        toss = fix.get("tosswon")
        elected = fix.get("elected", "")
        if toss and isinstance(toss, dict):
            tname = toss.get("name", "Unknown")
            detail["toss"] = f"{tname} elected to {elected}" if elected else f"{tname} won the toss"
        elif fix.get("toss_won_team_id") and elected:
            detail["toss"] = f"Elected to {elected}"

        # Match note (result text)
        detail["note"] = fix.get("note", "")

        # Round info
        detail["round"] = fix.get("round", "")

        # Man of the match
        mom = fix.get("manofmatch")
        if mom and isinstance(mom, dict):
            detail["man_of_match"] = mom.get("fullname", "")

        # Umpires
        u1 = fix.get("firstumpire", {})
        u2 = fix.get("secondumpire", {})
        ref = fix.get("referee", {})
        if u1 and isinstance(u1, dict):
            detail["umpire_1"] = u1.get("fullname", "")
        if u2 and isinstance(u2, dict):
            detail["umpire_2"] = u2.get("fullname", "")
        if ref and isinstance(ref, dict):
            detail["referee"] = ref.get("fullname", "")

        # Weather
        detail["weather"] = fix.get("weather_report", [])

        # Super over / follow on
        detail["super_over"] = fix.get("super_over", False)
        detail["follow_on"] = fix.get("follow_on", False)

        # DL data
        detail["localteam_dl"] = fix.get("localteam_dl_data", {})
        detail["visitorteam_dl"] = fix.get("visitorteam_dl_data", {})

        # Winner
        detail["winner_team_id"] = fix.get("winner_team_id")
        detail["draw_noresult"] = fix.get("draw_noresult")

        return detail

    def get_fixture_scorecard(self, fixture_id: int) -> dict:
        """Full scorecard: batting, bowling, runs for a fixture."""
        data = self._get(f"fixtures/{fixture_id}", {
            "include": "batting.batsman,batting.bowler,bowling.bowler,runs.team,localteam,visitorteam,scoreboards",
        })
        fix = data.get("data", {})
        if not fix:
            return {}

        result = self._norm(fix)
        result["batting"] = fix.get("batting", [])
        result["bowling"] = fix.get("bowling", [])
        result["runs"] = fix.get("runs", [])
        result["scoreboards"] = fix.get("scoreboards", [])
        return result

    # ── Lineups ──────────────────────────────────────────────

    def get_fixture_lineups(self, fixture_id: int) -> List[dict]:
        """Playing XI for a fixture (available near match time)."""
        data = self._get(f"fixtures/{fixture_id}", {
            "include": "localteam,visitorteam,lineup",
        })
        fix = data.get("data", {})
        if not fix:
            return []

        lineup = fix.get("lineup", [])
        if not lineup:
            return []

        local_id = fix.get("localteam_id")
        visitor_id = fix.get("visitorteam_id")
        local_name = fix.get("localteam", {}).get("name", "Team A")
        visitor_name = fix.get("visitorteam", {}).get("name", "Team B")

        local_p, visitor_p = [], []
        for p in lineup:
            pd = self._player_dict(p)
            if p.get("team_id") == local_id:
                local_p.append(pd)
            elif p.get("team_id") == visitor_id:
                visitor_p.append(pd)
            else:
                (local_p if len(local_p) <= len(visitor_p) else visitor_p).append(pd)

        result = []
        if local_p:
            result.append({"teamName": local_name, "players": local_p})
        if visitor_p:
            result.append({"teamName": visitor_name, "players": visitor_p})
        return result

    # ── Squads ───────────────────────────────────────────────

    def get_season_squad(self, team_id: int, season_id: int) -> List[dict]:
        """Season-specific squad for a team."""
        data = self._get(f"teams/{team_id}/squad/{season_id}", timeout=30)
        team_data = data.get("data", {})
        squad = team_data.get("squad", [])
        if not squad:
            return []

        seen = set()
        players = []
        for p in squad:
            pid = str(p.get("id", ""))
            if pid in seen:
                continue
            seen.add(pid)
            players.append({
                "name": p.get("fullname", "Unknown"),
                "id": pid,
                "role": self._norm_pos(p.get("position", {})),
                "position": self._pos_name(p.get("position", {})),
                "batting_style": p.get("battingstyle", ""),
                "bowling_style": p.get("bowlingstyle", ""),
                "image": p.get("image_path", ""),
                "dob": p.get("dateofbirth", ""),
                "country_id": p.get("country_id"),
            })
        return players

    def get_fixture_squads(self, fixture_id: int) -> List[dict]:
        """Get squads for both teams in a fixture."""
        data = self._get(f"fixtures/{fixture_id}", {
            "include": "localteam,visitorteam",
        })
        fix = data.get("data", {})
        if not fix:
            return []

        season_id = fix.get("season_id")
        local_id = fix.get("localteam_id")
        visitor_id = fix.get("visitorteam_id")
        local_name = fix.get("localteam", {}).get("name", "Team A")
        visitor_name = fix.get("visitorteam", {}).get("name", "Team B")

        result = []
        for tid, tname in [(local_id, local_name), (visitor_id, visitor_name)]:
            players = self.get_season_squad(tid, season_id)
            if players:
                result.append({"teamName": tname, "players": players})
                logger.info("Squad %s: %d players", tname, len(players))

        return result

    # ── Players ──────────────────────────────────────────────

    def get_player(self, player_id: int) -> dict:
        """Player detail with career stats."""
        data = self._get(f"players/{player_id}", {"include": "career"})
        return data.get("data", {})

    # ── Helpers ──────────────────────────────────────────────

    def _norm(self, fix: dict) -> dict:
        """Normalize fixture to standard dict."""
        local = fix.get("localteam", {}) or {}
        visitor = fix.get("visitorteam", {}) or {}
        venue = fix.get("venue", {}) or {}
        league = fix.get("league", {}) or {}

        local_name = local.get("name", "Unknown") if isinstance(local, dict) else "Unknown"
        visitor_name = visitor.get("name", "Unknown") if isinstance(visitor, dict) else "Unknown"
        venue_name = venue.get("name", "Unknown") if isinstance(venue, dict) else "Unknown"
        venue_city = venue.get("city", "") if isinstance(venue, dict) else ""
        league_name = league.get("name", "") if isinstance(league, dict) else ""

        local_img = local.get("image_path", "") if isinstance(local, dict) else ""
        visitor_img = visitor.get("image_path", "") if isinstance(visitor, dict) else ""

        raw_date = fix.get("starting_at", "")
        match_type = fix.get("type", "Unknown")
        fmt_map = {"T20I": "T20", "T20": "T20", "ODI": "ODI", "Test": "Test"}
        status = fix.get("status", "NS")
        status_map = {
            "NS": "Upcoming", "Finished": "Result",
            "1st Innings": "🔴 1st Innings", "2nd Innings": "🔴 2nd Innings",
            "Innings Break": "Innings Break",
            "Aban.": "Abandoned", "Cancl.": "Cancelled",
            "Stump Day 1": "Stumps Day 1", "Stump Day 2": "Stumps Day 2",
            "Stump Day 3": "Stumps Day 3", "Stump Day 4": "Stumps Day 4",
        }

        # Extract runs from include
        runs = fix.get("runs", [])
        local_score = ""
        visitor_score = ""
        if runs and isinstance(runs, list):
            for r in runs:
                team_id = r.get("team_id")
                score = f"{r.get('score', 0)}/{r.get('wickets', 0)}"
                overs = r.get("overs", "")
                if overs:
                    score += f" ({overs} ov)"
                if team_id == fix.get("localteam_id"):
                    local_score = score if not local_score else f"{local_score} & {score}"
                elif team_id == fix.get("visitorteam_id"):
                    visitor_score = score if not visitor_score else f"{visitor_score} & {score}"

        return {
            "id": str(fix.get("id", "")),
            "name": f"{local_name} vs {visitor_name}",
            "teams": [local_name, visitor_name],
            "team_images": [local_img, visitor_img],
            "matchType": fmt_map.get(match_type, match_type),
            "venue": venue_name,
            "venue_city": venue_city,
            "date": self._fmt_date(raw_date),
            "date_raw": raw_date,
            "status": status_map.get(status, status),
            "status_raw": status,
            "league_id": str(fix.get("league_id", "")),
            "league_name": league_name,
            "season_id": fix.get("season_id"),
            "localteam_id": fix.get("localteam_id"),
            "visitorteam_id": fix.get("visitorteam_id"),
            "local_score": local_score,
            "visitor_score": visitor_score,
        }

    def _player_dict(self, p: dict) -> dict:
        return {
            "name": p.get("fullname", "Unknown"),
            "id": str(p.get("id", "")),
            "role": self._norm_pos(p.get("position", {})),
            "position": self._pos_name(p.get("position", {})),
            "batting_style": p.get("battingstyle", ""),
            "bowling_style": p.get("bowlingstyle", ""),
            "image": p.get("image_path", ""),
        }

    @staticmethod
    def _fmt_date(iso: str) -> str:
        if not iso:
            return "TBD"
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return dt.strftime("%b %d, %Y · %H:%M UTC")
        except (ValueError, TypeError):
            return iso

    @staticmethod
    def _pos_name(pos) -> str:
        if isinstance(pos, dict):
            return pos.get("name", "Unknown")
        return str(pos) if pos else "Unknown"

    @staticmethod
    def _norm_pos(pos) -> str:
        name = ""
        if isinstance(pos, dict):
            name = pos.get("name", "").lower()
        elif isinstance(pos, str):
            name = pos.lower()
        if not name:
            return "Unknown"
        if "allrounder" in name or "all-rounder" in name:
            return "All-rounder"
        if "wicketkeeper" in name or "keeper" in name or "wk" in name:
            return "WK-Batsman"
        if "bowl" in name:
            return "Bowler"
        if "bat" in name:
            return "Batsman"
        return name.title()
