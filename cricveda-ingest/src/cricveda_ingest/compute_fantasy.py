"""Fantasy points computation pipeline.

Reads resolved ball-by-ball deliveries from Supabase and writes Dream11
fantasy points per player per match into the fantasy_points table.

Usage:
    uv run python -m cricveda_ingest.compute_fantasy --match-id 12345
    uv run python -m cricveda_ingest.compute_fantasy --all-missing
"""
from __future__ import annotations

import logging

import click

from cricveda_core.domain.models import PlayerRole
from cricveda_core.domain.scoring import aggregate_match_stats, compute_player_fantasy_points

from .db import get_client

log = logging.getLogger(__name__)


def _get_player_roles(player_ids: list[int]) -> dict[int, PlayerRole]:
    """Fetch primary_role for a list of player_ids."""
    if not player_ids:
        return {}
    client = get_client()
    rows = (
        client.table("player_meta")
        .select("player_id, primary_role")
        .in_("player_id", player_ids)
        .execute()
    )
    roles: dict[int, PlayerRole] = {}
    for r in rows.data:
        role_str = r.get("primary_role")
        if role_str:
            try:
                roles[r["player_id"]] = PlayerRole(role_str)
            except ValueError:
                pass
    return roles


def compute_for_match(match_id: int) -> int:
    """Compute and store fantasy points for one match. Returns player count."""
    client = get_client()

    # Fetch match metadata (for rain_affected flag)
    match_rows = client.table("matches").select("rain_affected").eq("match_id", match_id).execute()
    if not match_rows.data:
        log.error("Match %s not found", match_id)
        return 0
    rain_affected: bool = match_rows.data[0].get("rain_affected", False)

    # Fetch all resolved deliveries for this match
    delivery_rows = (
        client.table("deliveries")
        .select(
            "delivery_id, innings, over_ball, striker_id, bowler_id, non_striker_id, "
            "wicket_player_id, runs_batter, runs_extras, runs_total, "
            "wicket_type, extras_type"
        )
        .eq("match_id", match_id)
        .not_.is_("striker_id", "null")   # only resolved deliveries
        .execute()
    )

    if not delivery_rows.data:
        log.warning("Match %s has no resolved deliveries — skipping", match_id)
        return 0

    deliveries = delivery_rows.data

    # Collect all unique player IDs to fetch roles
    all_pids: set[int] = set()
    for d in deliveries:
        for col in ("striker_id", "bowler_id", "non_striker_id", "wicket_player_id"):
            if d.get(col):
                all_pids.add(d[col])

    player_roles = _get_player_roles(list(all_pids))

    # Aggregate stats and compute points
    player_stats = aggregate_match_stats(match_id, deliveries, player_roles)

    rows_to_insert: list[dict] = []
    for pid, stats in player_stats.items():
        bat, bowl, field, total, exclude = compute_player_fantasy_points(stats, rain_affected)
        rows_to_insert.append({
            "player_id": pid,
            "match_id": match_id,
            "batting_points": round(bat, 2),
            "bowling_points": round(bowl, 2),
            "fielding_points": round(field, 2),
            "total_points": round(total, 2),
            "training_exclude": exclude,
        })

    if rows_to_insert:
        # Upsert — in case this match is being recomputed
        client.table("fantasy_points").upsert(rows_to_insert, on_conflict="player_id,match_id").execute()

    log.info("Match %s: computed points for %d players (rain=%s)", match_id, len(rows_to_insert), rain_affected)
    return len(rows_to_insert)


def compute_all_missing() -> None:
    """Compute fantasy points for every match that has no entries in fantasy_points."""
    client = get_client()

    # All match IDs that have resolved deliveries but no fantasy_points entries
    all_match_ids_raw = (
        client.table("deliveries")
        .select("match_id")
        .not_.is_("striker_id", "null")
        .execute()
    )
    all_match_ids = {r["match_id"] for r in all_match_ids_raw.data}

    scored_raw = client.table("fantasy_points").select("match_id").execute()
    scored_ids = {r["match_id"] for r in scored_raw.data}

    missing = sorted(all_match_ids - scored_ids)
    log.info("Found %d matches needing fantasy points computation", len(missing))

    total_players = 0
    for i, match_id in enumerate(missing, start=1):
        n = compute_for_match(match_id)
        total_players += n
        if i % 100 == 0:
            log.info("Progress: %d/%d matches processed", i, len(missing))

    log.info("Done. Computed points for %d player-match records across %d matches.", total_players, len(missing))


# ============================================================
# CLI
# ============================================================

@click.command()
@click.option("--match-id", type=int, help="Compute fantasy points for a single match")
@click.option("--all-missing", is_flag=True, default=False, help="Process all matches without fantasy_points entries")
def main(match_id: int | None, all_missing: bool) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if match_id:
        n = compute_for_match(match_id)
        click.echo(f"Computed points for {n} players in match {match_id}.")
    elif all_missing:
        compute_all_missing()
    else:
        click.echo("Specify --match-id or --all-missing")


if __name__ == "__main__":
    main()
