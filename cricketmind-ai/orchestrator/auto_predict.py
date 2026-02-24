"""CricketMind AI — Auto-Predict System

Automatically detects upcoming matches and triggers predictions.
Designed to be run as a daily cron job via GitHub Actions.
"""

import sys
from datetime import datetime, timezone, timedelta

from data.sportmonks_client import SportmonksClient
from orchestrator.pipeline import run_prediction
from utils.config import PREDICTIONS_DIR
from utils.logger import get_logger
from utils.helpers import format_match_id

logger = get_logger(__name__)


def detect_and_predict(hours_ahead: int = 24) -> int:
    """Detect upcoming matches and run predictions for each.

    Args:
        hours_ahead: Look for matches starting within this many hours.

    Returns:
        Number of predictions generated.
    """
    logger.info("=" * 60)
    logger.info("CricketMind AI — Auto-Prediction Run")
    logger.info("Looking for matches in the next %d hours...", hours_ahead)
    logger.info("=" * 60)

    client = SportmonksClient()
    upcoming = client.get_upcoming_fixtures()

    if not upcoming:
        logger.info("No upcoming matches found.")
        return 0

    predictions_made = 0

    for match in upcoming:
        match_id = match.get("id", "")
        match_name = match.get("name", "Unknown")
        match_type = match.get("matchType", "unknown").lower()
        date_str = match.get("date", "")
        teams = match.get("teams", [])

        logger.info("Found match: %s (%s) on %s", match_name, match_type, date_str)

        # Check if prediction already exists
        if teams and len(teams) >= 2:
            gen_id = format_match_id(teams[0], teams[1], date_str)
            existing = PREDICTIONS_DIR / f"{gen_id}.json"
            if existing.exists():
                logger.info("  → Prediction already exists, skipping: %s", gen_id)
                continue

        # Determine format type for data processing
        format_map = {
            "t20": "t20", "t20i": "t20", "odi": "odi",
            "test": "test", "ipl": "ipl",
        }
        format_type = format_map.get(match_type, "t20")

        # Run prediction
        logger.info("  → Running prediction for: %s", match_name)
        try:
            result = run_prediction(match_id, format_type=format_type)
            if result:
                predictions_made += 1
                logger.info("  ✓ Prediction generated for: %s", match_name)
            else:
                logger.warning("  ✗ Prediction failed for: %s", match_name)
        except Exception as e:
            logger.error("  ✗ Error predicting %s: %s", match_name, e)

    logger.info("=" * 60)
    logger.info("Auto-prediction complete. Generated %d predictions.", predictions_made)
    logger.info("=" * 60)

    return predictions_made


if __name__ == "__main__":
    hours = int(sys.argv[1]) if len(sys.argv) > 1 else 24
    count = detect_and_predict(hours_ahead=hours)
    sys.exit(0 if count >= 0 else 1)
