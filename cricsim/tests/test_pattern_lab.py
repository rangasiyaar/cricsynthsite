"""Pattern Lab finds planted effects and calls the rest myths — on synthetic Cricsheet data."""
from __future__ import annotations

import duckdb
import pytest

from cricdata.build import build
from cricsim.patterns.catalog import CATALOG
from cricsim.patterns.features import build_balls
from cricsim.patterns.lab import hazard_curves, run_patterns, write_report
from cricsim.patterns.stats import benjamini_hochberg, mantel_haenszel

from .synthetic_matches import PLANT_AFTER_SIX, PLANT_LEFT_ARM_PACE, PLANT_NEW_BATTER, attributes, write_zip


@pytest.fixture(scope="module")
def lab(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("lab")
    out = tmp / "parquet"
    build(write_zip(tmp / "all_json.zip"), out)
    con = duckdb.connect()
    n = build_balls(con, out)
    return con, n, {r["id"]: r for r in run_patterns(con, split_year=2021)}, out


def test_features(lab):
    con, n, _, _ = lab
    assert n > 300_000
    # spells: bowler 0 bowls overs 0, 2 (same spell) then 15, 18 → a new spell at 15
    spells = con.execute("""SELECT DISTINCT "over", spell_start, spell_over FROM balls
                            WHERE match_id = '1' AND innings_no = 1 AND bowler = 'B6' ORDER BY 1""").fetchall()
    assert spells[:2] == [(0, True, 1), (2, False, 2)]
    assert (15, True, 1) in spells
    # streak columns behave: a ball right after a non-dot has dots_before = 0
    bad = con.execute("""SELECT count(*) FROM balls b WHERE is_legal AND dots_before > 0
                         AND batter_balls_before = 0 AND team_wickets_before = 0 AND legal_balls_before = 0""").fetchone()[0]
    assert bad == 0
    assert con.execute("SELECT max(part_balls) FROM balls").fetchone()[0] > 30


def test_planted_effects_are_found(lab):
    _, _, r, _ = lab
    six = r["after_six_batter"]
    assert six["verdict"] == "real", six
    assert 1.6 < six["full"]["rr"] < 2.5          # planted 2.0
    newb = r["new_batter_first5"]
    assert newb["verdict"] == "real", newb
    assert 1.3 < newb["full"]["rr"] < 2.0         # planted 1.6 (diluted a little by the 5–29 comparison)


def test_unplanted_effects_are_not_real(lab):
    _, _, r, _ = lab
    for pid in ("dots_3", "first_ball_of_over", "last_ball_of_over", "wickets_in_pairs"):
        assert r[pid]["verdict"] in ("myth", "inconclusive", "weak"), (pid, r[pid])
    assert r["dots_3"]["verdict"] == "myth", r["dots_3"]
    assert r["left_arm_pace_rhb_early"]["verdict"] == "needs data"


def test_curves_and_report(lab, tmp_path):
    con, n, r, _ = lab
    curves = hazard_curves(con)
    faced = {row["value"]: row["o_e"] for row in curves["batter_balls_faced"]}
    # each point is relative to the situation average (which includes new batters), so compare
    # the first 5 balls with the next 5 — the planted step is 1.6x
    first5 = sum(faced[v] for v in range(5)) / 5
    next5 = sum(faced[v] for v in range(5, 10)) / 5
    assert first5 / next5 > 1.35
    write_report({"balls": n, "split_year": 2021, "verdicts": {}}, list(r.values()), curves, tmp_path / "report")
    md = (tmp_path / "report.md").read_text()
    assert "Batter out straight after hitting a six" in md and "✅ real" in md


def test_catalog_ids_unique():
    ids = [p.id for p in CATALOG]
    assert len(ids) == len(set(ids)) and len(ids) >= 30


def test_stats_helpers():
    e = mantel_haenszel([(20, 100, 100, 1000), (40, 100, 200, 1000)])     # both strata: exposed rate 2x
    assert e.rr == pytest.approx(2.0, rel=1e-6) and e.lo < 2 < e.hi and e.p < 1e-6
    assert e.expected_events == pytest.approx(30.0)
    assert benjamini_hochberg([0.01, 0.04, None, 0.03]) == [pytest.approx(0.03), pytest.approx(0.04), None,
                                                             pytest.approx(0.04)]


def test_matchups_with_attributes(lab, tmp_path):
    import pyarrow as pa
    import pyarrow.parquet as pq
    *_, out = lab
    path = tmp_path / "attributes.parquet"
    pq.write_table(pa.Table.from_pylist(attributes()), path)
    con2 = duckdb.connect()
    build_balls(con2, out, path)
    r = {x["id"]: x for x in run_patterns(con2, split_year=2021)}
    lap = r["left_arm_pace_rhb_early"]
    assert lap["verdict"] == "real", lap
    assert 1.4 < lap["full"]["rr"] < 2.3            # planted 1.8
    assert r["offspin_v_lhb"]["verdict"] in ("myth", "inconclusive", "weak"), r["offspin_v_lhb"]
