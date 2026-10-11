import json
from datetime import datetime, timezone
from pathlib import Path

from cricsim.results import Roster, credited_bowler, over_number, run, score, started
from cricsim.scorecard import parse

DATA = Path(__file__).parent


def dist(q10, q50, q90):
    return {"mean": q50, "q": {"5": q10, "10": q10, "25": q50, "50": q50, "75": q50, "90": q90, "95": q90}}


def doc():
    """A small forecast for Pakistan v Sri Lanka in the published shape."""
    pak = ["p_far", "p_fak", "p_maaz", "p_has", "p_saim", "p_shad", "p_naf", "p_imr", "p_nas", "p_sal", "p_abr"]
    sl = ["s_udara", "s_sin", "s_kus", "s_kam", "s_sah", "s_sha", "s_cha", "s_mah", "s_esh", "s_bin", "s_nuw"]
    reg = {"p_far": "Sahibzada Farhan", "p_fak": "Fakhar Zaman", "p_maaz": "Maaz Sadaqat", "p_has": "Hassan Nawaz",
           "p_saim": "Saim Ayub", "p_shad": "Shadab Khan", "p_naf": "Khawaja Nafay", "p_imr": "Mohammad Imran",
           "p_nas": "Naseem Shah", "p_sal": "Salman Mirza", "p_abr": "Abrar Ahmed", "s_udara": "new:Lahiru Udara",
           "s_sin": "Sineth Jayawardena", "s_kus": "BKG Mendis", "s_kam": "PHKD Mendis", "s_sah": "SSD Arachchige",
           "s_sha": "MD Shanaka", "s_cha": "C Wickramasinghe", "s_mah": "M Theekshana", "s_esh": "E Malinga",
           "s_bin": "B Fernando", "s_nuw": "N Thushara"}

    def players(ids):
        return [{"id": i, "name": reg[i], "known": True, "profile": {},
                 "batting": {"runs": dist(2, 15, 45), "p_top_scorer": 0.3 if k == 0 else 0.05},
                 "bowling": {"p_bowls": 0.9, "wickets": dist(0, 1, 2), "runs": dist(20, 30, 40),
                             "p_best_bowler": 0.3 if k == 10 else 0.05}} for k, i in enumerate(ids)]

    def batting():
        return {"score": dist(140, 170, 200), "wickets": dist(5, 7, 9),
                "by_innings": [{"innings": 1, "score": dist(150, 175, 205), "n": 1},
                               {"innings": 2, "score": dist(130, 160, 185), "n": 1}],
                "phases": [{"phase": "Powerplay", "overs": [1, 6], "runs": dist(35, 48, 62), "wickets": dist(0, 1, 3)}],
                "extras": {"total": dist(3, 7, 12)},
                "fall_of_wickets": [{"wicket": k, "p": 0.9, "over": dist(k, 2 * k, 4 * k), "score": dist(10 * k, 20 * k, 40 * k)}
                                    for k in range(1, 11)]}
    return {"match": {"id": "m", "title": "Pakistan v Sri Lanka", "date": "2026-10-11",
                      "teams": [{"name": "Pakistan", "short": "PAK", "players": pak},
                                {"name": "Sri Lanka", "short": "SL", "players": sl}]},
            "summary": {"meta": {"rules": {"overs": 20, "pp": 6, "bpo": 6}},
                        "result": {"win": {"Pakistan": 0.62, "Sri Lanka": 0.38}, "margin_runs": dist(5, 20, 50),
                                   "margin_wickets": dist(2, 5, 8)},
                        "teams": [{"name": "Pakistan", "batting": batting(), "players": players(pak)},
                                  {"name": "Sri Lanka", "batting": batting(), "players": players(sl)}],
                        "matchups": [{"batter": "s_kus", "bowler": "p_imr", "p": 0.05}]}}


FIXTURE = {"teams": [{"players": ["Sahibzada Farhan", "Fakhar Zaman", "Maaz Sadaqat", "Hasan Nawaz", "Saim Ayub",
                                  "Shadab Khan", "Khawaja Nafay", "Muhammad Imran Randhawa", "Naseem Shah",
                                  "Mohammad Salman Mirza", "Abrar Ahmed"]},
                     {"players": ["Lahiru Udara", "Sineth Jayawardena", "Kusal Mendis", "Kamindu Mendis",
                                  "Sahan Arachchige", "Dasun Shanaka", "Chamindu Wickramasinghe", "Maheesh Theekshana",
                                  "Eshan Malinga", "Binura Fernando", "Nuwan Thushara"]}]}


def test_parse_pasted_scorecard():
    card = parse((DATA / "scorecard_pak_sl.txt").read_text())
    a, b = card["innings"]
    assert (a["team"], a["runs"], a["wickets"], b["team"], b["runs"], b["wickets"]) == ("Pakistan", 215, 3, "Sri Lanka", 133, 7)
    assert len(a["batting"]) == 4 and len(b["batting"]) == 9 and len(a["bowling"]) == 6 and len(b["fall_of_wickets"]) == 7
    assert a["powerplay_runs"] == 46 and b["extras"] == {"b": 1, "lb": 1, "w": 2, "nb": 0, "p": 0}
    assert card["winner"] == "Pakistan" and card["result"] == "Pakistan won by 82 runs"
    assert b["batting"][2] == {"name": "Kusal Mendis", "dismissal": "c Khawaja Nafay b Mohammad Imran Randhawa",
                               "runs": 9, "balls": 15, "fours": 0, "sixes": 0}


def test_helpers():
    assert [over_number(x) for x in ("6.5", "0.6", "19.6", "7", "14.0")] == [7, 1, 20, 7, 14]
    assert credited_bowler("c Khawaja Nafay b Salman Mirza") == "Salman Mirza"
    assert credited_bowler("lbw b Naseem Shah") == "Naseem Shah" and credited_bowler("b Abrar Ahmed") == "Abrar Ahmed"
    assert credited_bowler("run out (Nafay)") is None and credited_bowler("not out") is None


def test_names_resolve_across_spellings():
    r = Roster(doc(), FIXTURE)
    assert r.player("Mohammad Imran Randhawa", 0) == "p_imr"
    assert r.player("Salman Mirza", 0) == "p_sal" and r.player("Hasan Nawaz", 0) == "p_has"
    assert r.player("Kusal Mendis", 1) == "s_kus" and r.player("Kamindu Mendis", 1) == "s_kam"
    assert r.player("Lahiru Udara", 1) == "s_udara" and r.team("Sri Lanka") == 1


def test_score_checks_every_tab():
    card = parse((DATA / "scorecard_pak_sl.txt").read_text())
    rep = score(doc(), card, FIXTURE)
    assert set(rep["tabs"]) == {"Overview", "Scores", "Wickets", "Players", "Matchups"}
    assert all(rep["tabs"][t]["checks"] > 0 for t in rep["tabs"])
    item = {c["check"]: c for c in rep["items"]}
    assert item["Favourite wins"]["hit"] is True
    assert item["Pakistan total (batting first)"]["hit"] is False          # 215 above 150–205
    assert item["Sri Lanka total (chasing)"]["hit"] is True                # 133 in 130–185
    assert item["Mohammad Imran dismisses BKG Mendis"]["hit"] is True      # listed duel
    assert rep["hits"] == sum(c["hit"] for c in rep["items"]) and 0 < rep["accuracy"] < 1


def test_run_freezes_started_matches_and_scores(tmp_path):
    fx_dir, sc_dir, out = tmp_path / "fx", tmp_path / "sc", tmp_path / "out"
    fx_dir.mkdir(); sc_dir.mkdir()
    (fx_dir / "m.json").write_text(json.dumps({"id": "m", "date": "2026-10-11", "start_time": "18:30", **FIXTURE}))
    (fx_dir / "later.json").write_text(json.dumps({"id": "later", "date": "2026-12-01", "start_time": "19:00"}))
    (sc_dir / "m.json").write_text(json.dumps({"id": "m", **parse((DATA / "scorecard_pak_sl.txt").read_text())}))
    live = {"matches/m.json": doc(), "matches/m.pack.json": {"pack": 1}}
    now = datetime(2026, 10, 11, 14, 0, tzinfo=timezone.utc)
    assert started({"date": "2026-10-11", "start_time": "18:30"}, now) and not started({"date": "2026-12-01"}, now)
    r = run(fx_dir, sc_dir, out, now=now, fetch=lambda path, sites=None: live.get(path))
    assert r == {"archived": ["m"], "missing": [], "scored": ["m"]}
    assert json.loads((out / "matches" / "m.pack.json").read_text()) == {"pack": 1}
    idx = json.loads((out / "results" / "index.json").read_text())
    assert idx["matches"][0]["id"] == "m" and idx["checks"] > 10 and idx["favourite_won"] == 1
