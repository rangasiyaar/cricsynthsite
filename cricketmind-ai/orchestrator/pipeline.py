"""CricketMind AI — Main Prediction Pipeline

The central orchestration module that coordinates:
1. Data fetching from ESPN public API (primary) or CricData (fallback)
2. Player profile building from ESPN rosters
3. Multi-agent prediction pipeline
4. Result parsing and storage
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from data.espn_client import ESPNClient
from data.player_profile_builder import PlayerProfileBuilder
from data.cricsheet_loader import CricsheetLoader
from orchestrator.crew_config import create_prediction_crew
from models.prediction import MatchPrediction
from utils.config import PREDICTIONS_DIR, CRICDATA_API_KEY
from utils.helpers import save_json, format_match_id
from utils.logger import get_logger

logger = get_logger(__name__)


def _format_player_summary(profiles: list) -> str:
    """Format player profiles into a text summary for the agents."""
    lines = []
    current_team = ""

    for p in profiles:
        if p.team != current_team:
            lines.append(f"\n{'='*60}")
            lines.append(f"TEAM: {p.team}")
            lines.append(f"{'='*60}")
            current_team = p.team

        lines.append(f"\n--- {p.name} ---")
        lines.append(f"  Role: {p.role} | Bat: {p.batting_style} | Bowl: {p.bowling_style}")
        lines.append(f"  Batting: {p.batting.matches} matches, {p.batting.runs} runs, "
                      f"Avg {p.batting.average}, SR {p.batting.strike_rate}")
        lines.append(f"  50s: {p.batting.fifties}, 100s: {p.batting.hundreds}")
        lines.append(f"  Bowling: {p.bowling.wickets} wickets, "
                      f"Avg {p.bowling.average}, Econ {p.bowling.economy}")
        lines.append(f"  Fielding: {p.fielding.catches} catches, "
                      f"{p.fielding.stumpings} stumpings")

        if p.recent_form:
            recent = p.recent_form[-5:]
            scores = [f"{r.runs}r/{r.wickets}w" for r in recent]
            lines.append(f"  Recent Form (last {len(recent)}): {', '.join(scores)}")

        lines.append(f"  Form Rating: {p.form_rating}/10")

        if p.venue_stats:
            lines.append(f"  Venue: Bat Avg {p.venue_stats.batting_avg}, "
                          f"Bowl Avg {p.venue_stats.bowling_avg}")

    return "\n".join(lines)


def _format_match_context(match_info: dict, venue_stats: dict = None) -> str:
    """Format match context into a text summary for the agents."""
    lines = [
        f"Match: {match_info.get('name', 'Unknown')}",
        f"Format: {match_info.get('matchType', 'Unknown')}",
        f"Venue: {match_info.get('venue', 'Unknown')}",
        f"Date: {match_info.get('date', 'Unknown')}",
        f"Status: {match_info.get('status', 'Unknown')}",
    ]

    teams = match_info.get("teams", [])
    if teams:
        lines.append(f"Teams: {' vs '.join(teams)}")

    # Toss info from ESPN
    toss = match_info.get("toss", "")
    if toss:
        lines.append(f"Toss: {toss}")

    if venue_stats:
        lines.append("\nVenue History:")
        lines.append(f"  Matches at venue: {venue_stats.get('matches', 'N/A')}")
        lines.append(f"  Avg 1st Innings: {venue_stats.get('avg_first_innings', 'N/A')}")
        lines.append(f"  Avg 2nd Innings: {venue_stats.get('avg_second_innings', 'N/A')}")
        lines.append(f"  Highest Total: {venue_stats.get('highest_total', 'N/A')}")
        lines.append(f"  Lowest Total: {venue_stats.get('lowest_total', 'N/A')}")

    return "\n".join(lines)


def run_prediction(
    match_id: str,
    format_type: str = "t20",
    league_id: str = "8039",
) -> Optional[dict]:
    """Run the full prediction pipeline for a match.

    Args:
        match_id: ESPN event ID (or CricData match ID for legacy calls).
        format_type: Cricket format (t20, odi, test).
        league_id: ESPN league ID for API calls.

    Returns:
        Prediction result as dict, or None on failure.
    """
    logger.info("=" * 60)
    logger.info("Starting prediction pipeline for match: %s", match_id)
    logger.info("=" * 60)

    try:
        # Step 1: Get match info from ESPN
        logger.info("Step 1: Fetching match info from ESPN...")
        espn = ESPNClient()
        match_info = espn.get_match_detail(match_id, league_id=league_id)

        if not match_info:
            logger.warning("ESPN match detail empty, pipeline cannot proceed")
            return None

        match_name = match_info.get("name", "Unknown Match")
        venue = match_info.get("venue", "Unknown Venue")
        match_date = match_info.get("date", "")
        match_format = match_info.get("matchType", format_type).upper()

        logger.info("Match: %s at %s on %s", match_name, venue, match_date)

        # Step 2: Get rosters from ESPN and build player profiles
        logger.info("Step 2: Fetching rosters from ESPN & building profiles...")
        espn_rosters = espn.get_rosters(match_id, league_id=league_id)

        # Set up optional CricData client for enrichment
        cricdata = None
        if CRICDATA_API_KEY and CRICDATA_API_KEY != "your_cricdata_api_key_here":
            from data.cricdata_client import CricDataClient
            cricdata = CricDataClient()
            logger.info("CricData API key found — will use for enrichment")
        else:
            logger.info("No CricData API key — using ESPN + Cricsheet only")

        builder = PlayerProfileBuilder(cricdata=cricdata, espn_client=espn)
        profiles = builder.build_profiles_for_match(
            match_id,
            format_type=format_type,
            venue=venue,
            espn_rosters=espn_rosters if espn_rosters else None,
        )

        if not profiles:
            logger.error("No player profiles built for match %s", match_id)
            raise RuntimeError(
                f"Squad/roster data unavailable for '{match_name}'. "
                "ESPN may not have roster data for this match yet. "
                "Try selecting a match closer to its start time."
            )

        logger.info("Built %d player profiles", len(profiles))

        # Step 3: Get venue stats
        logger.info("Step 3: Fetching venue statistics...")
        cricsheet = CricsheetLoader()
        venue_stats = {}
        try:
            venue_stats = cricsheet.get_venue_stats(venue, format_type)
        except Exception as e:
            logger.warning("Venue stats failed: %s", e)

        # Step 4: Format data for agents
        logger.info("Step 4: Formatting data for AI agents...")
        player_summary = _format_player_summary(profiles)
        match_context = _format_match_context(match_info, venue_stats)

        # Step 5: Run CrewAI pipeline
        logger.info("Step 5: Running CrewAI multi-agent pipeline...")
        generated_match_id = format_match_id(
            match_info.get("teams", ["X", "Y"])[0] if match_info.get("teams") else "X",
            match_info.get("teams", ["X", "Y"])[1] if len(match_info.get("teams", [])) > 1 else "Y",
            match_date,
        )

        crew = create_prediction_crew(
            player_data_summary=player_summary,
            match_context=match_context,
            match_id=generated_match_id,
            match_name=match_name,
            match_format=match_format,
            venue=venue,
            date=match_date,
        )

        result = crew.kickoff()

        # Step 6: Parse result
        logger.info("Step 6: Parsing prediction result...")
        prediction = _parse_crew_result(result, generated_match_id, match_name)

        # Step 7: Save prediction
        if prediction:
            output_path = PREDICTIONS_DIR / f"{generated_match_id}.json"
            save_json(prediction, output_path)
            logger.info("Prediction saved to %s", output_path)

        logger.info("=" * 60)
        logger.info("Pipeline complete for: %s", match_name)
        logger.info("=" * 60)

        return prediction

    except RuntimeError:
        raise  # Let descriptive errors propagate to UI
    except Exception as e:
        logger.error("Pipeline failed for match %s: %s", match_id, e, exc_info=True)
        raise RuntimeError(f"Pipeline error: {e}") from e


def _parse_crew_result(result, match_id: str, match_name: str) -> Optional[dict]:
    """Parse the CrewAI output into a structured prediction dict."""
    try:
        raw_output = str(result)

        json_start = raw_output.find("{")
        json_end = raw_output.rfind("}") + 1

        if json_start >= 0 and json_end > json_start:
            json_str = raw_output[json_start:json_end]
            prediction = json.loads(json_str)

            prediction["prediction_generated_at"] = datetime.now(timezone.utc).isoformat()

            return prediction
        else:
            logger.warning("Could not find JSON in crew output")
            logger.debug("Raw output: %s", raw_output[:500])
            return None

    except json.JSONDecodeError as e:
        logger.error("Failed to parse JSON from crew output: %s", e)
        return None
    except Exception as e:
        logger.error("Unexpected error parsing crew result: %s", e)
        return None
