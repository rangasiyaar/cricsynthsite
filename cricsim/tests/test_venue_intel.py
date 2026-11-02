"""Venue intelligence: ground history, conditions against all grounds, and the XI's record there."""
from __future__ import annotations

import json
from datetime import date

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from cricdata.build import build
from cricsim.venue_intel import Ground, intel

from .synthetic_world import pick_xi, write_world


@pytest.fixture(scope="module")
def parquet(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("venue")
    w, zp, ap = write_world(tmp, years=range(2021, 2025))
    out = tmp / "parquet"
    build(zp, out)
    (out / "attributes").mkdir()
    pq.write_table(pa.Table.from_pylist(json.loads(ap.read_text())), out / "attributes" / "attributes.parquet")
    return {"world": w, "parquet": out}


def _doc(w, vid):
    teams = []
    for name in ("Premier 0", "Premier 1"):
        teams.append({"name": name, "players": [{"id": p.pid, "name": p.name} for p in pick_xi(w["teams"][name])]})
    return {"match": {"id": "x", "venue_id": vid, "venue": "Premier Oval", "format": "T20", "gender": "male",
                      "date": "2025-01-10"}, "summary": {"teams": teams}}


def test_ground_history_and_conditions(parquet):
    con = duckdb.connect()
    vid = con.execute(f"SELECT venue_id FROM read_parquet('{parquet['parquet'].as_posix()}/matches/*.parquet') "
                      "GROUP BY 1 ORDER BY count(*) DESC LIMIT 1").fetchone()[0]
    v = intel(Ground(parquet["parquet"]), _doc(parquet["world"], vid), today=date(2025, 6, 1))
    h = v["history"]
    assert h["matches"] > 5 and h["first_innings"]["mean"] > 50
    assert 0 <= h["bat_first_won"] <= 1 and len(h["recent"]) == 8
    assert h["first_innings"]["low"]["runs"] <= h["first_innings"]["median"] <= h["first_innings"]["high"]["runs"]
    here, every = v["phases"]["here"], v["phases"]["all"]
    assert set(here) == {"powerplay", "middle", "death"} and every["middle"]["balls"] >= here["middle"]["balls"]
    assert set(v["bowling"]["here"]) == {"pace", "spin"}
    assert abs(sum(k["share_of_balls"] for k in v["bowling"]["here"].values()) - 1) < 0.01
    bats = v["players"]["batting"]
    assert bats and all(b["team"] in ("Premier 0", "Premier 1") for b in bats)
    assert bats == sorted(bats, key=lambda b: -b["runs"])


def test_no_ground_no_intel(parquet):
    assert intel(Ground(parquet["parquet"]), _doc(parquet["world"], None)) is None
