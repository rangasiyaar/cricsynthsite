"""CricketMind AI — Database Manager

SQLite operations for storing and querying prediction history.
"""

import sqlite3
import json
from pathlib import Path
from typing import Optional, List
from datetime import datetime

from utils.config import DB_PATH
from utils.logger import get_logger

logger = get_logger(__name__)


class DBManager:
    """Manages SQLite database for predictions."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        """Initialize database tables."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id TEXT NOT NULL UNIQUE,
                    match_name TEXT NOT NULL,
                    format TEXT,
                    venue TEXT,
                    match_date TEXT,
                    prediction_data TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    accuracy_score REAL DEFAULT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS player_predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id TEXT NOT NULL,
                    player_name TEXT NOT NULL,
                    team TEXT,
                    rank INTEGER,
                    predicted_points REAL,
                    actual_points REAL DEFAULT NULL,
                    confidence TEXT,
                    FOREIGN KEY (match_id) REFERENCES predictions(match_id)
                )
            """)
            conn.commit()
            logger.info("Database initialized at %s", self.db_path)

    def save_prediction(self, prediction: dict) -> bool:
        """Save a match prediction to the database."""
        try:
            match_id = prediction.get("match_id", "")
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO predictions
                    (match_id, match_name, format, venue, match_date, prediction_data, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        match_id,
                        prediction.get("match", ""),
                        prediction.get("format", ""),
                        prediction.get("venue", ""),
                        prediction.get("date", ""),
                        json.dumps(prediction),
                        datetime.utcnow().isoformat(),
                    ),
                )

                # Save individual player predictions
                for player in prediction.get("rankings", []):
                    conn.execute(
                        """
                        INSERT INTO player_predictions
                        (match_id, player_name, team, rank, predicted_points, confidence)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            match_id,
                            player.get("player_name", ""),
                            player.get("team", ""),
                            player.get("rank", 0),
                            player.get("predicted_fantasy_points", 0),
                            player.get("confidence", "Medium"),
                        ),
                    )

                conn.commit()
                logger.info("Saved prediction for %s", match_id)
                return True

        except Exception as e:
            logger.error("Failed to save prediction: %s", e)
            return False

    def get_prediction(self, match_id: str) -> Optional[dict]:
        """Retrieve a prediction by match ID."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute(
                    "SELECT prediction_data FROM predictions WHERE match_id = ?",
                    (match_id,),
                )
                row = cursor.fetchone()
                if row:
                    return json.loads(row[0])
                return None
        except Exception as e:
            logger.error("Failed to get prediction: %s", e)
            return None

    def get_recent_predictions(self, limit: int = 10) -> List[dict]:
        """Get the most recent predictions."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.execute(
                    """
                    SELECT match_id, match_name, format, venue, match_date, created_at
                    FROM predictions
                    ORDER BY created_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                )
                return [
                    {
                        "match_id": row[0],
                        "match_name": row[1],
                        "format": row[2],
                        "venue": row[3],
                        "match_date": row[4],
                        "created_at": row[5],
                    }
                    for row in cursor.fetchall()
                ]
        except Exception as e:
            logger.error("Failed to get recent predictions: %s", e)
            return []
