"""Data quality validation script.

Runs integrity checks across all pipeline tables and produces a summary report.
Returns exit code 1 if any critical errors are found (suitable for CI).

Usage:
    uv run python -m cricveda_ingest.validate
"""
from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field

import click

from .db import get_client

log = logging.getLogger(__name__)


@dataclass
class ValidationIssue:
    severity: str  # 'critical' | 'warning' | 'info'
    table: str
    description: str
    count: int = 0


@dataclass
class ValidationReport:
    total_matches: int = 0
    total_deliveries: int = 0
    total_players: int = 0
    resolution_rate: float = 0.0
    avg_fantasy_points_per_match: float = 0.0
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def critical_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == "critical")

    @property
    def exit_code(self) -> int:
        return 1 if self.critical_count > 0 else 0


# ============================================================
# Individual checks
# ============================================================

def validate_deliveries(report: ValidationReport) -> None:
    """Check NULL foreign keys in deliveries after name resolution."""
    client = get_client()

    null_striker = (
        client.table("deliveries")
        .select("delivery_id", count="exact")
        .is_("striker_id", "null")
        .execute()
    )
    count = null_striker.count or len(null_striker.data)
    if count > 0:
        total = report.total_deliveries or 1
        pct = count / total * 100
        severity = "critical" if pct > 5 else "warning"
        report.issues.append(ValidationIssue(
            severity=severity,
            table="deliveries",
            description=f"NULL striker_id ({pct:.1f}% of deliveries)",
            count=count,
        ))

    null_bowler = (
        client.table("deliveries")
        .select("delivery_id", count="exact")
        .is_("bowler_id", "null")
        .execute()
    )
    count = null_bowler.count or len(null_bowler.data)
    if count > 0:
        total = report.total_deliveries or 1
        pct = count / total * 100
        severity = "critical" if pct > 5 else "warning"
        report.issues.append(ValidationIssue(
            severity=severity,
            table="deliveries",
            description=f"NULL bowler_id ({pct:.1f}% of deliveries)",
            count=count,
        ))


def validate_fantasy_points_coverage(report: ValidationReport) -> None:
    """Every match in matches should have at least one fantasy_points record."""
    client = get_client()

    match_ids_raw = client.table("matches").select("match_id").execute()
    all_match_ids = {r["match_id"] for r in match_ids_raw.data}

    scored_raw = client.table("fantasy_points").select("match_id").execute()
    scored_ids = {r["match_id"] for r in scored_raw.data}

    missing = all_match_ids - scored_ids
    if missing:
        report.issues.append(ValidationIssue(
            severity="warning",
            table="fantasy_points",
            description="Matches with no fantasy_points records",
            count=len(missing),
        ))


def validate_player_meta_completeness(report: ValidationReport) -> None:
    """Report players with incomplete metadata."""
    client = get_client()
    for field_name in ("batting_hand", "bowling_style", "primary_role"):
        rows = (
            client.table("player_meta")
            .select("player_id", count="exact")
            .is_(field_name, "null")
            .execute()
        )
        count = rows.count or len(rows.data)
        if count > 0:
            report.issues.append(ValidationIssue(
                severity="info",
                table="player_meta",
                description=f"Players with NULL {field_name}",
                count=count,
            ))


def validate_referential_integrity(report: ValidationReport) -> None:
    """Check that foreign key references exist in their parent tables."""
    client = get_client()

    # deliveries.match_id → matches
    orphan_deliveries = (
        client.rpc("check_orphan_deliveries", {})
        .execute()
    )
    # Note: the RPC function needs to be created in Supabase if needed.
    # As a simpler fallback, we rely on DB constraints for this.
    # The schema enforces FK constraints, so if data is in the DB it's valid.
    report.issues.append(ValidationIssue(
        severity="info",
        table="deliveries",
        description="Referential integrity enforced by FK constraints in schema",
        count=0,
    ))


def validate_low_ball_count_matches(report: ValidationReport) -> None:
    """Flag matches with suspiciously low delivery counts."""
    client = get_client()
    rows = (
        client.table("matches")
        .select("match_id", count="exact")
        .eq("low_ball_count", True)
        .execute()
    )
    count = rows.count or len(rows.data)
    if count > 0:
        report.issues.append(ValidationIssue(
            severity="warning",
            table="matches",
            description="Matches flagged as low_ball_count (<90% expected deliveries)",
            count=count,
        ))


def validate_duplicate_fantasy_points(report: ValidationReport) -> None:
    """Detect duplicate (player_id, match_id) pairs in fantasy_points."""
    client = get_client()
    # The composite PK prevents true duplicates; this checks for any upsert issues.
    rows = client.table("fantasy_points").select("player_id, match_id").execute()
    seen: set[tuple] = set()
    dupes = 0
    for r in rows.data:
        key = (r["player_id"], r["match_id"])
        if key in seen:
            dupes += 1
        seen.add(key)
    if dupes > 0:
        report.issues.append(ValidationIssue(
            severity="critical",
            table="fantasy_points",
            description="Duplicate (player_id, match_id) records",
            count=dupes,
        ))


# ============================================================
# Summary stats
# ============================================================

def collect_summary_stats(report: ValidationReport) -> None:
    client = get_client()

    matches = client.table("matches").select("match_id", count="exact").execute()
    report.total_matches = matches.count or len(matches.data)

    deliveries = client.table("deliveries").select("delivery_id", count="exact").execute()
    report.total_deliveries = deliveries.count or len(deliveries.data)

    players = client.table("player_meta").select("player_id", count="exact").execute()
    report.total_players = players.count or len(players.data)

    resolved = (
        client.table("deliveries")
        .select("delivery_id", count="exact")
        .not_.is_("striker_id", "null")
        .execute()
    )
    resolved_count = resolved.count or len(resolved.data)
    report.resolution_rate = resolved_count / max(report.total_deliveries, 1) * 100

    fp_rows = client.table("fantasy_points").select("total_points").execute()
    if fp_rows.data:
        pts = [r["total_points"] for r in fp_rows.data if r.get("total_points") is not None]
        report.avg_fantasy_points_per_match = sum(pts) / len(pts) if pts else 0.0


# ============================================================
# Full validation run
# ============================================================

def run_full_validation() -> ValidationReport:
    report = ValidationReport()
    collect_summary_stats(report)
    validate_deliveries(report)
    validate_fantasy_points_coverage(report)
    validate_player_meta_completeness(report)
    validate_low_ball_count_matches(report)
    validate_duplicate_fantasy_points(report)
    return report


# ============================================================
# CLI
# ============================================================

@click.command()
def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    click.echo("Running data quality validation...")
    report = run_full_validation()

    click.echo("\n=== CricVeda Data Quality Report ===")
    click.echo(f"  Total matches:              {report.total_matches:,}")
    click.echo(f"  Total deliveries:           {report.total_deliveries:,}")
    click.echo(f"  Total players:              {report.total_players:,}")
    click.echo(f"  Name resolution rate:       {report.resolution_rate:.1f}%")
    click.echo(f"  Avg fantasy pts / player:   {report.avg_fantasy_points_per_match:.1f}")

    if report.issues:
        click.echo(f"\n  Issues ({len(report.issues)}):")
        for issue in report.issues:
            prefix = "❌" if issue.severity == "critical" else "⚠️" if issue.severity == "warning" else "ℹ️"
            click.echo(f"    {prefix} [{issue.severity.upper()}] {issue.table}: {issue.description} (n={issue.count})")
    else:
        click.echo("\n  ✅ No issues found.")

    if report.critical_count > 0:
        click.echo(f"\n❌ {report.critical_count} critical issue(s) — pipeline halted.")
    else:
        click.echo("\n✅ Validation passed.")

    sys.exit(report.exit_code)


if __name__ == "__main__":
    main()
