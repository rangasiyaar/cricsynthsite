"""cricdata — Cricsheet ingest.

    cricdata download --kind all|recent --dest data/raw
    cricdata build    --zip data/raw/all_json.zip --people data/raw/people.csv --out data/parquet
    cricdata attributes --out data/parquet                               (batting hand / bowling style)
    cricdata audit    --parquet data/parquet --report data/audit/coverage
    cricdata publish  --parquet data/parquet --project P --dataset cricket --bucket P-data
    cricdata ingest   --project P --dataset cricket --bucket P-data      (all of the above; the Cloud Run job)
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import click

from cricdata.build import TABLES

ALL_TABLES = [*TABLES, "players"]


@click.group()
def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


@main.command()
@click.option("--kind", type=click.Choice(["all", "recent"]), default="all")
@click.option("--dest", type=click.Path(path_type=Path), default=Path("data/raw"))
def download(kind: str, dest: Path) -> None:
    from cricdata.download import fetch
    for k in (kind, "people", "names"):
        fetch(k, dest)


@main.command()
@click.option("--zip", "zip_path", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--people", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--names", type=click.Path(path_type=Path), default=None)
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/parquet"))
@click.option("--limit", type=int, default=None, help="Only the first N matches (for a quick test).")
def build(zip_path: Path, people: Path, names: Path | None, out: Path, limit: int | None) -> None:
    from cricdata.build import build as run_build, build_players
    counts = run_build(zip_path, out, limit=limit)
    counts["players"] = build_players(people, names, out)
    click.echo(json.dumps(counts, indent=2))


@main.command()
@click.option("--rda", type=click.Path(path_type=Path), default=None,
              help="player_meta.rda (downloaded to data/raw if omitted)")
@click.option("--overrides", type=click.Path(path_type=Path), default=None,
              help="CSV of player_id + attribute columns that win over the dataset")
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/parquet"))
def attributes(rda: Path | None, overrides: Path | None, out: Path) -> None:
    """Batting hand + bowling style per player → <out>/attributes/attributes.parquet."""
    from cricdata.attributes import build_attributes
    from cricdata.download import fetch
    rda = rda if rda and rda.exists() else fetch("player_meta", Path("data/raw"))
    click.echo(json.dumps(build_attributes(rda, out, overrides), indent=2))


@main.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), default=Path("data/parquet"))
@click.option("--report", type=click.Path(path_type=Path), default=Path("data/audit/coverage"))
def audit(parquet: Path, report: Path) -> None:
    from cricdata.audit import audit as run_audit, write_report
    r = run_audit(parquet)
    write_report(r, report)
    click.echo(f"{r['matches']:,} matches · {r['deliveries']:,} balls → {report}.md")


@main.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), default=Path("data/parquet"))
@click.option("--project", required=True)
@click.option("--dataset", default="cricket")
@click.option("--bucket", required=True)
def publish(parquet: Path, project: str, dataset: str, bucket: str) -> None:
    from cricdata.bigquery import load_tables, upload_dir
    upload_dir(parquet, bucket, "parquet/latest")
    click.echo(json.dumps(load_tables(project, dataset, bucket, "parquet/latest", ALL_TABLES), indent=2))


@main.command()
@click.option("--project", required=True)
@click.option("--dataset", default="cricket")
@click.option("--bucket", required=True)
@click.option("--work", type=click.Path(path_type=Path), default=Path("/tmp/cricdata"))
def ingest(project: str, dataset: str, bucket: str, work: Path) -> None:
    """Full weekly rebuild: download → build → audit → publish. Idempotent."""
    from cricdata.audit import audit as run_audit, write_report
    from cricdata.bigquery import load_tables, upload_dir
    from cricdata.build import build as run_build, build_players
    from cricdata.download import fetch

    raw, out = work / "raw", work / "parquet"
    zip_path = fetch("all", raw)
    people, names = fetch("people", raw), fetch("names", raw)
    counts = run_build(zip_path, out)
    counts["players"] = build_players(people, names, out)
    report = run_audit(out)
    write_report(report, work / "audit" / "coverage")
    upload_dir(work / "audit", bucket, "audit/latest", pattern="coverage.*")
    upload_dir(out, bucket, "parquet/latest")
    loaded = load_tables(project, dataset, bucket, "parquet/latest", ALL_TABLES)
    click.echo(json.dumps({"parsed": counts, "loaded": loaded}, indent=2))
