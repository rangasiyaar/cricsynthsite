"""CricketMind AI — Helper Utilities"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def save_json(data: Any, filepath: Path) -> None:
    """Save data to a JSON file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str, ensure_ascii=False)


def load_json(filepath: Path) -> Any:
    """Load data from a JSON file."""
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def utc_now() -> datetime:
    """Current UTC datetime."""
    return datetime.now(timezone.utc)


def format_match_id(team1: str, team2: str, date: str) -> str:
    """Generate a match ID like 'IND_vs_AUS_20260301'."""
    t1 = team1.strip().upper().replace(" ", "_")[:3]
    t2 = team2.strip().upper().replace(" ", "_")[:3]
    d = date.replace("-", "")[:8]
    return f"{t1}_vs_{t2}_{d}"


def confidence_emoji(confidence: str) -> str:
    """Map confidence level to emoji."""
    return {"High": "🟢", "Medium": "🟡", "Low": "🔴"}.get(confidence, "⚪")
