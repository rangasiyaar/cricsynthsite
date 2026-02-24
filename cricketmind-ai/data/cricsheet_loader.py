"""CricketMind AI — Cricsheet Historical Data Loader

Downloads and processes ball-by-ball CSV data from Cricsheet.org
to compute historical player statistics including:
  - Recent form (last N matches)
  - Venue-specific performance
  - Opposition-specific performance
"""

import os
import io
import zipfile
from pathlib import Path
from typing import Optional, List, Dict

import pandas as pd
import requests

from utils.config import CACHE_DIR
from utils.logger import get_logger

logger = get_logger(__name__)

# Cricsheet download URLs
CRICSHEET_URLS = {
    "t20": "https://cricsheet.org/downloads/t20s_csv2.zip",
    "odi": "https://cricsheet.org/downloads/odis_csv2.zip",
    "test": "https://cricsheet.org/downloads/tests_csv2.zip",
    "ipl": "https://cricsheet.org/downloads/ipl_csv2.zip",
    "bbl": "https://cricsheet.org/downloads/bbl_csv2.zip",
    "psl": "https://cricsheet.org/downloads/psl_csv2.zip",
    "cpl": "https://cricsheet.org/downloads/cpl_csv2.zip",
}


class CricsheetLoader:
    """Loads and processes Cricsheet CSV data."""

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._data_cache: Dict[str, pd.DataFrame] = {}

    def download_data(self, format_type: str = "t20") -> Path:
        """Download and extract Cricsheet CSV data for a format.

        Args:
            format_type: One of 't20', 'odi', 'test', 'ipl', 'bbl', 'psl', 'cpl'.

        Returns:
            Path to the extracted CSV directory.
        """
        url = CRICSHEET_URLS.get(format_type.lower())
        if not url:
            raise ValueError(f"Unknown format: {format_type}")

        extract_dir = self.cache_dir / format_type
        marker = extract_dir / ".downloaded"

        if marker.exists():
            logger.info("Cricsheet %s data already cached at %s", format_type, extract_dir)
            return extract_dir

        logger.info("Downloading Cricsheet %s data from %s ...", format_type, url)
        try:
            resp = requests.get(url, timeout=120, stream=True)
            resp.raise_for_status()

            extract_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
                zf.extractall(extract_dir)

            marker.touch()
            logger.info("Cricsheet %s data extracted to %s", format_type, extract_dir)
            return extract_dir
        except Exception as e:
            logger.error("Failed to download Cricsheet %s data: %s", format_type, e)
            return extract_dir

    def load_deliveries(self, format_type: str = "t20") -> pd.DataFrame:
        """Load deliveries CSV into a DataFrame (with caching).

        Returns:
            DataFrame with ball-by-ball data.
        """
        if format_type in self._data_cache:
            return self._data_cache[format_type]

        data_dir = self.download_data(format_type)

        # Find the deliveries CSV in extracted files
        csv_files = list(data_dir.rglob("*deliveries*.csv"))
        if not csv_files:
            # Try all CSVs
            csv_files = list(data_dir.rglob("*.csv"))

        if not csv_files:
            logger.warning("No CSV files found in %s", data_dir)
            return pd.DataFrame()

        # Use the largest CSV (likely the main deliveries file)
        main_csv = max(csv_files, key=lambda f: f.stat().st_size)
        logger.info("Loading Cricsheet data from %s ...", main_csv.name)

        try:
            df = pd.read_csv(main_csv, low_memory=False)
            self._data_cache[format_type] = df
            logger.info("Loaded %d deliveries for %s format", len(df), format_type)
            return df
        except Exception as e:
            logger.error("Failed to load CSV %s: %s", main_csv, e)
            return pd.DataFrame()

    def get_player_batting_stats(
        self, player_name: str, format_type: str = "t20", last_n: int = 5
    ) -> dict:
        """Compute batting stats for a player from historical data.

        Args:
            player_name: Player name to look up.
            format_type: Cricket format.
            last_n: Number of recent matches for form calculation.

        Returns:
            Dict with batting stats.
        """
        df = self.load_deliveries(format_type)
        if df.empty:
            return {}

        # Filter for this player as striker
        striker_col = "striker" if "striker" in df.columns else "batsman"
        player_df = df[df[striker_col].str.contains(player_name, case=False, na=False)]

        if player_df.empty:
            return {}

        # Aggregate by match
        match_col = "match_id" if "match_id" in df.columns else df.columns[0]
        match_stats = (
            player_df.groupby(match_col)
            .agg(
                runs=("runs_off_bat", "sum"),
                balls=("runs_off_bat", "count"),
                fours=(
                    "runs_off_bat",
                    lambda x: (x == 4).sum(),
                ),
                sixes=(
                    "runs_off_bat",
                    lambda x: (x == 6).sum(),
                ),
            )
            .reset_index()
        )

        total_runs = int(match_stats["runs"].sum())
        total_innings = len(match_stats)
        avg = round(total_runs / max(total_innings, 1), 2)
        total_balls = int(match_stats["balls"].sum())
        sr = round((total_runs / max(total_balls, 1)) * 100, 2)

        # Recent form
        recent = match_stats.tail(last_n)
        recent_scores = recent["runs"].tolist()

        return {
            "innings": total_innings,
            "runs": total_runs,
            "average": avg,
            "strike_rate": sr,
            "fours": int(match_stats["fours"].sum()),
            "sixes": int(match_stats["sixes"].sum()),
            "recent_scores": recent_scores,
        }

    def get_player_bowling_stats(
        self, player_name: str, format_type: str = "t20", last_n: int = 5
    ) -> dict:
        """Compute bowling stats for a player from historical data."""
        df = self.load_deliveries(format_type)
        if df.empty:
            return {}

        bowler_col = "bowler" if "bowler" in df.columns else None
        if bowler_col is None:
            return {}

        player_df = df[df[bowler_col].str.contains(player_name, case=False, na=False)]
        if player_df.empty:
            return {}

        # Count wickets (wicket_type column exists and is not empty)
        wicket_col = None
        for col in ["wicket_type", "player_dismissed"]:
            if col in df.columns:
                wicket_col = col
                break

        match_col = "match_id" if "match_id" in df.columns else df.columns[0]

        if wicket_col:
            match_stats = (
                player_df.groupby(match_col)
                .agg(
                    balls=("runs_off_bat", "count"),
                    runs_conceded=("runs_off_bat", "sum"),
                    wickets=(wicket_col, lambda x: x.notna().sum()),
                )
                .reset_index()
            )
        else:
            match_stats = (
                player_df.groupby(match_col)
                .agg(
                    balls=("runs_off_bat", "count"),
                    runs_conceded=("runs_off_bat", "sum"),
                )
                .reset_index()
            )
            match_stats["wickets"] = 0

        total_wickets = int(match_stats["wickets"].sum())
        total_balls = int(match_stats["balls"].sum())
        total_runs_conceded = int(match_stats["runs_conceded"].sum())
        overs = total_balls / 6
        economy = round(total_runs_conceded / max(overs, 0.1), 2)
        avg = round(total_runs_conceded / max(total_wickets, 1), 2)

        recent = match_stats.tail(last_n)
        recent_wickets = recent["wickets"].tolist()

        return {
            "innings": len(match_stats),
            "wickets": total_wickets,
            "average": avg,
            "economy": economy,
            "overs": round(overs, 1),
            "recent_wickets": recent_wickets,
        }

    def get_venue_stats(
        self, venue: str, format_type: str = "t20"
    ) -> dict:
        """Compute venue-level statistics."""
        df = self.load_deliveries(format_type)
        if df.empty:
            return {}

        venue_col = "venue" if "venue" in df.columns else None
        if venue_col is None:
            return {}

        venue_df = df[df[venue_col].str.contains(venue, case=False, na=False)]
        if venue_df.empty:
            return {}

        match_col = "match_id" if "match_id" in df.columns else df.columns[0]
        innings_col = "innings" if "innings" in df.columns else None

        # Total runs per match-innings
        if innings_col:
            innings_totals = (
                venue_df.groupby([match_col, innings_col])["runs_off_bat"]
                .sum()
                .reset_index()
            )
            first_inn = innings_totals[innings_totals[innings_col] == 1]["runs_off_bat"]
            second_inn = innings_totals[innings_totals[innings_col] == 2]["runs_off_bat"]

            return {
                "matches": venue_df[match_col].nunique(),
                "avg_first_innings": int(first_inn.mean()) if len(first_inn) else 0,
                "avg_second_innings": int(second_inn.mean()) if len(second_inn) else 0,
                "highest_total": int(innings_totals["runs_off_bat"].max()),
                "lowest_total": int(innings_totals["runs_off_bat"].min()),
            }

        return {"matches": venue_df[match_col].nunique()}
