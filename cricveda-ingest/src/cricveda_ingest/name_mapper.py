"""Three-tier player name resolution pipeline.

Resolves Cricsheet player name strings to ESPNcricinfo player IDs:
  Tier 1: dwillis community CSV (cricsheet_to_espn.csv)
  Tier 2: RapidFuzz fuzzy matching at 85% threshold (league + era scoped)
  Tier 3: manual_overrides.csv (hand-verified)

If all three fail, the name is logged as unresolved and player_id stays NULL.

Usage:
    uv run python -m cricveda_ingest.name_mapper --match-id 12345
    uv run python -m cricveda_ingest.name_mapper --all-unresolved
"""
from __future__ import annotations

import csv
import logging
from datetime import date, timedelta
from pathlib import Path

import click
from rapidfuzz import fuzz, process

from cricveda_core.domain.models import MatchResolutionStats, ResolutionResult

from .db import get_client

log = logging.getLogger(__name__)

MAPPINGS_DIR = Path(__file__).parent.parent.parent.parent.parent / "data" / "mappings"
DWILLIS_CSV = MAPPINGS_DIR / "cricsheet_to_espn.csv"
OVERRIDES_CSV = MAPPINGS_DIR / "manual_overrides.csv"

FUZZY_THRESHOLD = 85.0
ERA_WINDOW_YEARS = 5


# ============================================================
# Mapping file loaders
# ============================================================

def load_dwillis_map(csv_path: Path | None = None) -> dict[str, int]:
    """Load dwillis cricsheet_to_espn.csv → {cricsheet_name: player_id}."""
    path = csv_path or DWILLIS_CSV
    mapping: dict[str, int] = {}
    try:
        with path.open() as f:
            for row in csv.DictReader(f):
                name = row.get("cricsheet_name") or row.get("name", "")
                pid_str = row.get("player_id") or row.get("espn_id", "")
                if name and pid_str:
                    try:
                        mapping[name.strip()] = int(pid_str.strip())
                    except ValueError:
                        pass
    except FileNotFoundError:
        log.warning("dwillis CSV not found at %s — download from https://github.com/dwillis/cricket-player-ids", path)
    log.info("Loaded %d entries from dwillis CSV", len(mapping))
    return mapping


def load_manual_overrides(csv_path: Path | None = None) -> dict[str, int]:
    """Load manual_overrides.csv → {cricsheet_name: player_id}."""
    path = csv_path or OVERRIDES_CSV
    overrides: dict[str, int] = {}
    try:
        with path.open() as f:
            for row in csv.DictReader(f):
                if row.get("cricsheet_name", "").startswith("#"):
                    continue
                name = row.get("cricsheet_name", "").strip()
                pid_str = row.get("player_id", "").strip()
                if name and pid_str:
                    try:
                        overrides[name] = int(pid_str)
                    except ValueError:
                        pass
    except FileNotFoundError:
        log.debug("manual_overrides.csv not found — skipping")
    return overrides


# ============================================================
# Candidate pool (league + era scoped)
# ============================================================

def load_candidate_pool(
    league_id: str,
    match_date: date,
    era_years: int = ERA_WINDOW_YEARS,
) -> list[tuple[str, int]]:
    """
    Return [(player_name, player_id)] for players who appeared in this league
    within era_years of the match date.
    """
    client = get_client()
    cutoff_early = date(match_date.year - era_years, 1, 1)
    cutoff_late = date(match_date.year + era_years, 12, 31)

    rows = (
        client.table("deliveries")
        .select("striker_name, striker_id, matches!inner(league_id, match_date)")
        .eq("matches.league_id", league_id)
        .gte("matches.match_date", str(cutoff_early))
        .lte("matches.match_date", str(cutoff_late))
        .not_.is_("striker_id", "null")
        .limit(5000)
        .execute()
    )

    seen: dict[int, str] = {}
    for r in rows.data:
        if r.get("striker_id") and r.get("striker_name"):
            seen[r["striker_id"]] = r["striker_name"]

    return list(seen.items())  # [(name, id)]  — swapped for fuzzy matching


# ============================================================
# Core resolution logic
# ============================================================

def resolve_name(
    name: str,
    league_id: str,
    match_date: date,
    dwillis_map: dict[str, int],
    manual_overrides: dict[str, int],
    candidate_pool: list[tuple[str, int]] | None = None,
) -> ResolutionResult:
    # Tier 1: dwillis CSV
    if name in dwillis_map:
        return ResolutionResult(player_id=dwillis_map[name], method="dwillis", confidence=1.0)

    # Tier 2: fuzzy match
    pool = candidate_pool
    if pool is None:
        pool = load_candidate_pool(league_id, match_date)

    if pool:
        candidate_names = [p[0] for p in pool]  # name is first in tuple
        candidate_ids = {p[0]: p[1] for p in pool}

        matches = process.extract(
            name,
            candidate_names,
            scorer=fuzz.token_sort_ratio,
            limit=2,
        )

        if matches and matches[0][1] >= FUZZY_THRESHOLD:
            best_name, best_score, _ = matches[0]
            if len(matches) > 1 and (best_score - matches[1][1]) < 5:
                log.warning(
                    "Ambiguous fuzzy match for %r: %r (%.1f) vs %r (%.1f)",
                    name, best_name, best_score, matches[1][0], matches[1][1],
                )
            player_id = candidate_ids[best_name]
            return ResolutionResult(player_id=player_id, method="fuzzy", confidence=best_score / 100)

    # Tier 3: manual override
    if name in manual_overrides:
        return ResolutionResult(player_id=manual_overrides[name], method="manual", confidence=1.0)

    log.debug("Unresolved: %r (league=%s, date=%s)", name, league_id, match_date)
    return ResolutionResult(player_id=None, method="unresolved")


# ============================================================
# Match-level resolution
# ============================================================

def resolve_match(
    match_id: int,
    dwillis_map: dict[str, int],
    manual_overrides: dict[str, int],
) -> MatchResolutionStats:
    client = get_client()
    stats = MatchResolutionStats(match_id=match_id)

    # Load match metadata
    match_rows = (
        client.table("matches")
        .select("league_id, match_date")
        .eq("match_id", match_id)
        .execute()
    )
    if not match_rows.data:
        log.error("Match %s not found", match_id)
        return stats

    league_id = match_rows.data[0]["league_id"]
    match_date = date.fromisoformat(match_rows.data[0]["match_date"])

    # Pre-load candidate pool once for the whole match
    candidate_pool = load_candidate_pool(league_id, match_date)

    # Load unresolved deliveries for this match
    deliveries = (
        client.table("deliveries")
        .select("delivery_id, striker_name, bowler_name, non_striker_name, wicket_player_name")
        .eq("match_id", match_id)
        .is_("striker_id", "null")
        .execute()
    )

    # Track per-name resolutions to avoid re-querying
    name_cache: dict[str, ResolutionResult] = {}
    # Track resolved player_ids to detect impossible assignments (same player as striker + bowler)
    used_ids: dict[str, set[int]] = {}  # delivery_id → {player_ids in that delivery}

    def cached_resolve(name: str) -> ResolutionResult:
        if name not in name_cache:
            name_cache[name] = resolve_name(
                name, league_id, match_date, dwillis_map, manual_overrides, candidate_pool
            )
        return name_cache[name]

    def count_method(r: ResolutionResult) -> None:
        if r.method == "dwillis":
            stats.resolved_dwillis += 1
        elif r.method == "fuzzy":
            stats.resolved_fuzzy += 1
        elif r.method == "manual":
            stats.resolved_manual += 1
        else:
            stats.unresolved += 1

    for row in deliveries.data:
        delivery_id = row["delivery_id"]
        names_to_resolve = {
            "striker_id": row.get("striker_name") or "",
            "bowler_id": row.get("bowler_name") or "",
            "non_striker_id": row.get("non_striker_name") or "",
            "wicket_player_id": row.get("wicket_player_name") or "",
        }

        updates: dict = {}
        delivery_player_ids: set[int] = set()

        for fk_col, name in names_to_resolve.items():
            if not name:
                continue
            stats.total_names += 1
            result = cached_resolve(name)
            count_method(result)

            if result.player_id is not None:
                # Sanity check: striker and bowler must not be the same player
                if fk_col in ("striker_id", "bowler_id") and result.player_id in delivery_player_ids:
                    log.warning(
                        "Delivery %s: player %s assigned as both striker and bowler — skipping",
                        delivery_id, result.player_id,
                    )
                    continue
                delivery_player_ids.add(result.player_id)
                updates[fk_col] = result.player_id

        if updates:
            client.table("deliveries").update(updates).eq("delivery_id", delivery_id).execute()

    return stats


# ============================================================
# Batch runner
# ============================================================

def resolve_all_unresolved(dwillis_map: dict[str, int], manual_overrides: dict[str, int]) -> None:
    client = get_client()
    # Find all match_ids that have any unresolved striker_id
    rows = (
        client.table("deliveries")
        .select("match_id")
        .is_("striker_id", "null")
        .execute()
    )
    match_ids = list({r["match_id"] for r in rows.data})
    log.info("Found %d matches with unresolved deliveries", len(match_ids))

    totals = MatchResolutionStats(match_id=-1)
    for i, match_id in enumerate(match_ids, start=1):
        s = resolve_match(match_id, dwillis_map, manual_overrides)
        totals.total_names += s.total_names
        totals.resolved_dwillis += s.resolved_dwillis
        totals.resolved_fuzzy += s.resolved_fuzzy
        totals.resolved_manual += s.resolved_manual
        totals.unresolved += s.unresolved
        if i % 100 == 0:
            resolved = totals.total_names - totals.unresolved
            rate = resolved / max(totals.total_names, 1) * 100
            log.info("Processed %d/%d matches — resolution rate %.1f%%", i, len(match_ids), rate)

    resolved = totals.total_names - totals.unresolved
    rate = resolved / max(totals.total_names, 1) * 100
    log.info("\nFinal resolution stats:")
    log.info("  Total names:     %d", totals.total_names)
    log.info("  Via dwillis CSV: %d", totals.resolved_dwillis)
    log.info("  Via fuzzy match: %d", totals.resolved_fuzzy)
    log.info("  Via manual:      %d", totals.resolved_manual)
    log.info("  Unresolved:      %d", totals.unresolved)
    log.info("  Resolution rate: %.1f%%", rate)


# ============================================================
# CLI
# ============================================================

@click.command()
@click.option("--match-id", type=int, help="Resolve names for a single match")
@click.option("--all-unresolved", is_flag=True, default=False, help="Resolve all matches with NULL striker_id")
def main(match_id: int | None, all_unresolved: bool) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    dwillis = load_dwillis_map()
    overrides = load_manual_overrides()

    if match_id:
        s = resolve_match(match_id, dwillis, overrides)
        click.echo(f"Match {match_id}:")
        click.echo(f"  Total names:  {s.total_names}")
        click.echo(f"  dwillis:      {s.resolved_dwillis}")
        click.echo(f"  fuzzy:        {s.resolved_fuzzy}")
        click.echo(f"  manual:       {s.resolved_manual}")
        click.echo(f"  unresolved:   {s.unresolved}")
    elif all_unresolved:
        resolve_all_unresolved(dwillis, overrides)
    else:
        click.echo("Specify --match-id or --all-unresolved")


if __name__ == "__main__":
    main()
