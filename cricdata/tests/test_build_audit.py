"""Zip → Parquet → audit, end to end on the fixture matches."""
from __future__ import annotations

import pyarrow.parquet as pq

import make_fixtures as fx
from cricdata.audit import audit, write_report
from cricdata.build import build, build_players, read_table
from cricdata.schema import SCHEMAS


def test_build_writes_every_table(tmp_path):
    z = fx.write_zip(tmp_path / "all_json.zip")
    out = tmp_path / "parquet"
    counts = build(z, out, chunk_matches=2)
    assert counts["matches"] == 5 and counts["matches_failed"] == 0      # bad json skipped, not counted
    assert counts["deliveries"] == 11 + 5 + 3 + 1
    for t in ("matches", "match_players", "innings", "deliveries", "wickets"):
        tbl = read_table(out, t)
        assert tbl.schema.names == SCHEMAS[t].names, t
    assert len(list((out / "matches").glob("*.parquet"))) == 3          # chunks of 2 matches
    m = read_table(out, "matches").to_pylist()
    assert [r["match_id"] for r in m] == ["1001", "1002", "1003", "1004", "1005"]


def test_players_register(tmp_path):
    people, names = fx.write_register(tmp_path)
    n = build_players(people, names, tmp_path / "parquet")
    rows = pq.read_table(tmp_path / "parquet" / "players").to_pylist()
    assert n == len(fx.REG) == len(rows)
    a = next(r for r in rows if r["player_id"] == "aaaa0001")
    assert a["aliases"] == ["Aaron Batter"] and a["key_cricinfo"] == "0"


def test_limit(tmp_path):
    z = fx.write_zip(tmp_path / "all_json.zip")
    assert build(z, tmp_path / "p", limit=2)["matches"] == 2


def test_audit(tmp_path):
    z = fx.write_zip(tmp_path / "all_json.zip")
    out = tmp_path / "parquet"
    build(z, out)
    r = audit(out)
    assert r["matches"] == 5 and r["deliveries"] == 20
    assert r["matches_without_balls"] == 1                                # the no-result
    assert r["deliveries_with_batter_id_pct"] == 100.0
    ipl = next(c for c in r["competitions"] if c["competition"] == "Indian Premier League")
    assert ipl["balls"] == 11 and ipl["seasons"] == ["2024", "2024"]
    assert {"format": "HUNDRED", "gender": "male", "matches": 1} in r["by_format"]
    write_report(r, tmp_path / "audit" / "coverage")
    md = (tmp_path / "audit" / "coverage.md").read_text()
    assert "Indian Premier League" in md and "| HUNDRED | male | 1 |" in md
