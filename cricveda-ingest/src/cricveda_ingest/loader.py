"""Cricsheet YAML bulk loader.

Parses all YAML files for a league directory and loads them into Supabase.
Run via CLI:
    uv run python -m cricveda_ingest.loader --league t20i --data-dir ./data/cricsheet/t20s
"""
from __future__ import annotations

import logging
import sys
from itertools import count
from pathlib import Path
from typing import Iterator

import click
import yaml

from cricveda_core.domain.models import DeliveryRecord, LoadResult, MatchRecord

from .db import get_client

log = logging.getLogger(__name__)

# Expected deliveries in a full T20 match (2 innings × 20 overs × 6 balls)
FULL_T20_DELIVERIES = 120
LOW_BALL_THRESHOLD = 0.90

# Minimum expected for ODI (2 × 50 × 6)
FULL_ODI_DELIVERIES = 600

_delivery_counter = count(1)

RAIN_KEYWORDS = frozenset({
    "D/L method", "DLS", "rain", "reduced overs", "No result",
    "no result", "abandoned", "Abandoned",
})


# ============================================================
# Parsing
# ============================================================

def detect_rain_affected(match_info: dict) -> bool:
    outcome = match_info.get("outcome", {})
    method = outcome.get("method", "")
    result = outcome.get("result", "")
    eliminator = outcome.get("eliminator", "")
    return any(kw in text for kw in RAIN_KEYWORDS for text in (method, result, eliminator))


def _parse_delivery(
    delivery_data: dict,
    match_id: int,
    innings: int,
    over_num: int,
    ball_num: int,
) -> DeliveryRecord:
    over_ball = float(f"{over_num}.{ball_num}")
    runs = delivery_data.get("runs", {})
    wickets = delivery_data.get("wickets", [])
    extras = delivery_data.get("extras", {})

    wicket = wickets[0] if wickets else None
    extras_type = next(iter(extras), None) if extras else None
    runs_extras = sum(extras.values()) if extras else 0

    return DeliveryRecord(
        delivery_id=next(_delivery_counter),
        match_id=match_id,
        innings=innings,
        over_ball=over_ball,
        striker_name=delivery_data.get("batter", ""),
        bowler_name=delivery_data.get("bowler", ""),
        non_striker_name=delivery_data.get("non_striker", ""),
        runs_batter=runs.get("batter", 0),
        runs_extras=runs_extras,
        runs_total=runs.get("total", 0),
        wicket_type=wicket.get("kind") if wicket else None,
        wicket_player_name=wicket.get("player_out") if wicket else None,
        extras_type=extras_type,
    )


def parse_match_yaml(filepath: Path) -> tuple[MatchRecord, list[DeliveryRecord]]:
    """Parse a single Cricsheet YAML file."""
    with filepath.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    info = data.get("info", {})
    match_id = info.get("match_number") or hash(filepath.stem) & 0x7FFFFFFF

    # Determine league_id from filename directory convention
    league_id = filepath.parent.name

    teams = info.get("teams", ["Unknown", "Unknown"])
    team1, team2 = teams[0], teams[1] if len(teams) > 1 else "Unknown"

    dates = info.get("dates", [])
    match_date_str = dates[0] if dates else "2000-01-01"
    from datetime import date as dt_date
    match_date = dt_date.fromisoformat(str(match_date_str))

    venue_info = info.get("venue", "Unknown")
    city = info.get("city", "")

    toss = info.get("toss", {})
    outcome = info.get("outcome", {})
    winner = outcome.get("winner")

    rain = detect_rain_affected(info)

    match = MatchRecord(
        match_id=match_id,
        league_id=league_id,
        season=str(info.get("season", "")),
        match_date=match_date,
        venue_name=f"{venue_info}, {city}".strip(", "),
        team1=team1,
        team2=team2,
        toss_winner=toss.get("winner"),
        toss_decision=toss.get("decision"),
        winner=winner,
        rain_affected=rain,
    )

    deliveries: list[DeliveryRecord] = []
    innings_data = data.get("innings", [])
    for innings_idx, innings_block in enumerate(innings_data, start=1):
        overs = innings_block.get("overs", [])
        for over_block in overs:
            over_num = over_block.get("over", 0)
            for ball_num, delivery in enumerate(over_block.get("deliveries", []), start=1):
                try:
                    d = _parse_delivery(delivery, match_id, innings_idx, over_num, ball_num)
                    deliveries.append(d)
                except Exception as e:
                    log.warning("Delivery parse error in %s over %s.%s: %s", filepath.name, over_num, ball_num, e)

    # Flag low ball count
    expected = FULL_T20_DELIVERIES if info.get("match_type") == "T20" else FULL_ODI_DELIVERIES
    match.low_ball_count = len(deliveries) < expected * LOW_BALL_THRESHOLD

    return match, deliveries


# ============================================================
# Database loading
# ============================================================

def _upsert_match(match: MatchRecord) -> bool:
    """Insert match. Returns True if inserted, False if already exists."""
    client = get_client()
    existing = client.table("matches").select("match_id").eq("match_id", match.match_id).execute()
    if existing.data:
        log.warning("Duplicate match %s — skipping", match.match_id)
        return False

    client.table("matches").insert({
        "match_id": match.match_id,
        "league_id": match.league_id,
        "season": match.season,
        "match_date": str(match.match_date),
        "team1": match.team1,
        "team2": match.team2,
        "toss_winner": match.toss_winner,
        "toss_decision": match.toss_decision,
        "winner": match.winner,
        "rain_affected": match.rain_affected,
        "low_ball_count": match.low_ball_count,
    }).execute()
    return True


def _batch_insert_deliveries(deliveries: list[DeliveryRecord], batch_size: int = 1000) -> None:
    client = get_client()
    rows = [
        {
            "delivery_id": d.delivery_id,
            "match_id": d.match_id,
            "innings": d.innings,
            "over_ball": float(d.over_ball),
            "runs_batter": d.runs_batter,
            "runs_extras": d.runs_extras,
            "runs_total": d.runs_total,
            "wicket_type": d.wicket_type,
            "wicket_player_name": d.wicket_player_name,
            "extras_type": d.extras_type,
            "striker_name": d.striker_name,
            "bowler_name": d.bowler_name,
            "non_striker_name": d.non_striker_name,
        }
        for d in deliveries
    ]
    for i in range(0, len(rows), batch_size):
        client.table("deliveries").insert(rows[i : i + batch_size]).execute()


# ============================================================
# League loader
# ============================================================

def load_league(league_id: str, data_dir: Path, dry_run: bool = False) -> LoadResult:
    """Load all YAML files for a league directory."""
    result = LoadResult()
    yaml_files = sorted(data_dir.glob("*.yaml")) + sorted(data_dir.glob("*.yml"))

    if not yaml_files:
        log.warning("No YAML files found in %s", data_dir)
        return result

    for filepath in yaml_files:
        try:
            match, deliveries = parse_match_yaml(filepath)
        except Exception as e:
            log.error("Failed to parse %s: %s", filepath.name, e)
            result.files_skipped += 1
            result.errors.append(f"{filepath.name}: {e}")
            continue

        if dry_run:
            log.info("[dry-run] Would load match %s with %d deliveries", match.match_id, len(deliveries))
            result.matches_loaded += 1
            result.deliveries_loaded += len(deliveries)
            continue

        try:
            inserted = _upsert_match(match)
            if not inserted:
                result.files_skipped += 1
                continue
            _batch_insert_deliveries(deliveries)
            result.matches_loaded += 1
            result.deliveries_loaded += len(deliveries)
            log.info("Loaded match %s (%d deliveries)", match.match_id, len(deliveries))
        except Exception as e:
            log.error("DB error for match %s: %s", match.match_id, e)
            result.files_skipped += 1
            result.errors.append(f"match {match.match_id}: {e}")

    return result


# ============================================================
# CLI entry point
# ============================================================

@click.command()
@click.option("--league", required=True, help="League ID (e.g. t20i, ipl, odi)")
@click.option(
    "--data-dir",
    required=True,
    type=click.Path(exists=True, file_okay=False, path_type=Path),
    help="Path to directory containing Cricsheet YAML files",
)
@click.option("--dry-run", is_flag=True, default=False, help="Parse only, do not write to DB")
def main(league: str, data_dir: Path, dry_run: bool) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = load_league(league, data_dir, dry_run=dry_run)
    click.echo(f"\nResults for league '{league}':")
    click.echo(f"  Matches loaded:    {result.matches_loaded}")
    click.echo(f"  Deliveries loaded: {result.deliveries_loaded}")
    click.echo(f"  Files skipped:     {result.files_skipped}")
    if result.errors:
        click.echo(f"  Errors ({len(result.errors)}):")
        for err in result.errors[:10]:
            click.echo(f"    - {err}")
    sys.exit(1 if result.errors else 0)


if __name__ == "__main__":
    main()
