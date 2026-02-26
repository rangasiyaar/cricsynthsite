"""CricVeda AI 1.0 — Prediction Pipeline (Sportmonks-only)

Orchestrates: Sportmonks data → Player profiles → CrewAI agents → Prediction
"""

import json
from datetime import datetime, timezone
from typing import Optional

from data.sportmonks_client import SportmonksClient
from data.player_profile_builder import PlayerProfileBuilder
from orchestrator.crew_config import create_prediction_crew
from utils.config import PREDICTIONS_DIR
from utils.helpers import save_json, format_match_id
from utils.logger import get_logger

logger = get_logger(__name__)


def _format_player_summary(profiles: list) -> str:
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
        lines.append(f"  Batting: {p.batting.matches}m, {p.batting.runs}r, Avg {p.batting.average}, SR {p.batting.strike_rate}")
        lines.append(f"  Bowling: {p.bowling.wickets}w, Avg {p.bowling.average}, Econ {p.bowling.economy}")
        if p.recent_form:
            scores = [f"{r.runs}r/{r.wickets}w" for r in p.recent_form[-5:]]
            lines.append(f"  Recent: {', '.join(scores)}")
        lines.append(f"  Form: {p.form_rating}/10")
    return "\n".join(lines)


def _format_match_context(match_info: dict) -> str:
    lines = [
        f"Match: {match_info.get('name', 'Unknown')}",
        f"Format: {match_info.get('matchType', 'Unknown')}",
        f"Venue: {match_info.get('venue', 'Unknown')}",
        f"Date: {match_info.get('date', 'Unknown')}",
        f"Status: {match_info.get('status', 'Unknown')}",
        f"Round: {match_info.get('round', '')}",
    ]
    teams = match_info.get("teams", [])
    if teams:
        lines.append(f"Teams: {' vs '.join(teams)}")
    toss = match_info.get("toss", "")
    if toss:
        lines.append(f"Toss: {toss}")
    return "\n".join(lines)


def run_prediction(match_id: str, format_type: str = "t20") -> Optional[dict]:
    """Run full prediction pipeline for a Sportmonks fixture."""
    logger.info("=" * 60)
    logger.info("Pipeline start for fixture: %s", match_id)
    logger.info("=" * 60)

    try:
        sm = SportmonksClient()

        # Step 1: Match info
        logger.info("Step 1: Fetching match info...")
        match_info = sm.get_fixture_detail(int(match_id))
        if not match_info:
            return None

        match_name = match_info.get("name", "Unknown")
        venue = match_info.get("venue", "Unknown")
        match_date = match_info.get("date", "")
        match_format = match_info.get("matchType", format_type).upper()
        logger.info("Match: %s at %s", match_name, venue)

        # Step 2: Lineups → Squad fallback
        logger.info("Step 2: Fetching lineups/squads...")
        lineups = sm.get_fixture_lineups(int(match_id))
        if not lineups:
            logger.info("No lineups — falling back to season squad...")
            lineups = sm.get_fixture_squads(int(match_id))

        # Step 3: Build profiles
        logger.info("Step 3: Building player profiles...")
        builder = PlayerProfileBuilder()
        profiles = builder.build_profiles_for_match(
            match_id, format_type=format_type, venue=venue,
            sportmonks_lineups=lineups,
        )

        if not profiles:
            raise RuntimeError(
                f"No player data available for '{match_name}'. "
                "Lineups/squads may not be available yet."
            )

        logger.info("Built %d profiles", len(profiles))

        # Step 4: Format for agents
        logger.info("Step 4: Formatting for AI agents...")
        player_summary = _format_player_summary(profiles)
        match_context = _format_match_context(match_info)

        # Step 5: Run CrewAI
        logger.info("Step 5: Running CrewAI pipeline...")
        gen_id = format_match_id(
            match_info.get("teams", ["X", "Y"])[0],
            match_info.get("teams", ["X", "Y"])[-1],
            match_date,
        )

        crew = create_prediction_crew(
            player_data_summary=player_summary,
            match_context=match_context,
            match_id=gen_id,
            match_name=match_name,
            match_format=match_format,
            venue=venue,
            date=match_date,
        )
        result = crew.kickoff()

        # Step 6: Parse
        logger.info("Step 6: Parsing result...")
        prediction = _parse_result(result, gen_id)

        if prediction:
            path = PREDICTIONS_DIR / f"{gen_id}.json"
            save_json(prediction, path)
            logger.info("Saved to %s", path)

        return prediction

    except RuntimeError:
        raise
    except Exception as e:
        logger.error("Pipeline failed: %s", e, exc_info=True)
        raise RuntimeError(f"Pipeline error: {e}") from e


def _parse_result(result, match_id: str) -> Optional[dict]:
    try:
        raw = str(result)
        i = raw.find("{")
        j = raw.rfind("}") + 1
        if i >= 0 and j > i:
            pred = json.loads(raw[i:j])
            pred["prediction_generated_at"] = datetime.now(timezone.utc).isoformat()
            return pred
        return None
    except (json.JSONDecodeError, Exception) as e:
        logger.error("Parse failed: %s", e)
        return None
