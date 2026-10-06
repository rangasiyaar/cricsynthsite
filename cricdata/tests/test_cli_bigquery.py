"""CLI flow and BigQuery load settings (no Google account needed)."""
from __future__ import annotations

import json

import pytest
from click.testing import CliRunner

import make_fixtures as fx
from cricdata.cli import main


def test_build_and_audit_cli(tmp_path):
    z = fx.write_zip(tmp_path / "all_json.zip")
    people, names = fx.write_register(tmp_path)
    out = tmp_path / "parquet"
    r = CliRunner().invoke(main, ["build", "--zip", str(z), "--people", str(people), "--names", str(names),
                                  "--out", str(out)])
    assert r.exit_code == 0, r.output
    counts = json.loads(r.output[r.output.index("{"):])
    assert counts["matches"] == 5 and counts["players"] == len(fx.REG)
    r = CliRunner().invoke(main, ["audit", "--parquet", str(out), "--report", str(tmp_path / "a" / "coverage")])
    assert r.exit_code == 0 and "5 matches" in r.output
    assert (tmp_path / "a" / "coverage.json").exists()


def test_bigquery_load_settings():
    pytest.importorskip("google.cloud.bigquery")
    from google.cloud import bigquery

    from cricdata.bigquery import load_config
    cfg = load_config("deliveries")
    assert cfg.source_format == bigquery.SourceFormat.PARQUET
    assert cfg.write_disposition == bigquery.WriteDisposition.WRITE_TRUNCATE
    assert cfg.time_partitioning.field == "match_date" and cfg.time_partitioning.type_ == "MONTH"
    assert cfg.clustering_fields == ["format", "gender", "batter_id", "bowler_id"]
    assert cfg.parquet_options.enable_list_inference is True
    plain = load_config("players")
    assert plain.time_partitioning is None and plain.clustering_fields is None
