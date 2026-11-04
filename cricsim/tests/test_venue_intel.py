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
                      "WHERE team1 LIKE 'Premier%' GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1").fetchone()[0]   # the Premier ground
    v = intel(Ground(parquet["parquet"]), _doc(parquet["world"], vid), today=date(2025, 6, 1))
    h = v["history"]
    assert h["matches"] > 5 and h["first_innings"]["mean"] > 50
    assert 0 <= h["bat_first_won"] <= 1 and len(h["recent"]) == 8
    assert h["first_innings"]["low"]["runs"] <= h["first_innings"]["median"] <= h["first_innings"]["high"]["runs"]
    hist = h["first_innings"]["hist"]
    assert abs(sum(b["p"] for b in hist) - 1) < 0.01 and hist[0]["x"] <= h["first_innings"]["low"]["runs"]
    here, every = v["phases"]["here"], v["phases"]["all"]
    assert set(here) == {"powerplay", "middle", "death"} and every["middle"]["balls"] >= here["middle"]["balls"]
    assert set(v["bowling"]["here"]) == {"pace", "spin"}
    assert abs(sum(k["share_of_balls"] for k in v["bowling"]["here"].values()) - 1) < 0.01
    bats = v["players"]["batting"]
    assert bats and all(b["team"] in ("Premier 0", "Premier 1") for b in bats)
    assert bats == sorted(bats, key=lambda b: -b["runs"])


def test_no_ground_no_intel(parquet):
    assert intel(Ground(parquet["parquet"]), _doc(parquet["world"], None)) is None


def test_fantasy_reads_form_and_ground_fit(parquet):
    from cricsim.grounds import build as profiles
    from cricsim.venue_intel import FantasyData, fantasy_reads
    con = duckdb.connect()
    vid = con.execute(f"SELECT venue_id FROM read_parquet('{parquet['parquet'].as_posix()}/matches/*.parquet') "
                      "WHERE team1 LIKE 'Premier%' GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1").fetchone()[0]
    g = Ground(parquet["parquet"])
    d = _doc(parquet["world"], vid)
    d["fantasy"] = {"players": {}}
    fd = FantasyData(g, {p["id"] for t in d["summary"]["teams"] for p in t["players"]}, date(2025, 1, 10))
    prof = profiles(g.con, g.p, "T20", "male", date(2019, 1, 1), date(2025, 1, 10), min_matches=3)
    assert vid in prof.values and 7 < prof.values[vid]["rpo"] < 10
    fd._prof[("T20", "male")] = prof
    r = fantasy_reads(fd, d)
    assert r["ground"]["id"] == vid and r["ground"]["matches"] > 5
    form = [p for p in r["players"] if "form" in p]
    assert form and all(len(p["form"]["runs"]) <= 5 and p["form"]["n"] >= 10 for p in form)
    assert all(p["team"] in ("Premier 0", "Premier 1") for p in r["players"])
    fit = [p for p in r["players"] if "fit" in p]
    assert all(p["fit"]["n"] >= 3 and p["fit"]["n_all"] >= p["fit"]["n"] for p in fit)
    # the fit is the gap to the player's usual level, pulled towards zero by the small-sample pseudo-count
    assert all(abs(p["fit"]["score"]) <= abs(p["fit"]["mean"] - p["fit"]["usual"]) + 0.11 for p in fit)


def test_similar_grounds_and_labels():
    import numpy as np
    from cricsim.grounds import FEATURES, Profiles
    vals = {"a": [2, 0, 0, 2, 0, 0, 0], "b": [1.8, 0, 0, 1.9, 0, 0, 0], "c": [-2, 0, 0, -2, 0, 0, 0], "d": [0, 0, 0, 0, 0, 0, 0]}
    p = Profiles("T20", "male", {k: k.upper() for k in vals}, {k: 10 for k in vals},
                 {k: dict(zip(FEATURES, v)) for k, v in vals.items()}, {})
    p.z = {k: np.array(v, float) for k, v in vals.items()}
    assert [v for v, _ in p.similar("a", 2)] == ["b", "d"]
    assert p.label("a") == "High-scoring, helps pace" and p.label("c") == "Low-scoring, helps spin"
    assert p.label("d") == "Plays close to average" and p.label("zz") is None


def test_ground_lab_report(parquet):
    from cricsim.ground_lab import run
    rep = run(parquet["parquet"], date(2024, 1, 1), "T20")
    assert "Form (last 5" in rep and "Record at this ground only" in rep and "player-matches" in rep
