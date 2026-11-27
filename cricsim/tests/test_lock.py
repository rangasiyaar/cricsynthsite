"""Pro data on the public site (cricsim/lock.py): the Overview keeps its real values, the teaser shows a share of real
players and nothing true about the rest, the full forecast round-trips through the encryption."""
import json

import pytest

from cricsim import lock as L

SECRET = "test-secret"


def player(pid, name, runs, wk, pb=0.9):
    return {"id": pid, "name": name, "known": True,
            "batting": {"runs": {"mean": runs, "q": {"50": runs}}, "p_top_scorer": runs / 400, "strike_rate": 100 + runs,
                        "dismissed_by": [{"bowler": "b1", "name": "Bowler One", "p": 0.3}]},
            "bowling": {"p_bowls": pb, "wickets": {"mean": wk}, "p_best_bowler": wk / 10, "economy": 6 + wk},
            "profile": {"hand": "right"}}


def doc():
    teams = []
    for k, side in enumerate(["A", "B"]):
        ps = [player(f"{side}{i}", f"{side} Player {i}", 50 - i * 3, 0.2 * i) for i in range(11)]
        teams.append({"name": f"Team {side}", "players": ps, "batting": {
            "score": {"mean": 170, "q": {"10": 140, "25": 155, "50": 170, "75": 185, "90": 200}, "hist": list(range(20)), "p_at_least": {"150": 0.8, "180": 0.4}},
            "wickets": {"mean": 7.1, "q": {"50": 7}, "dist": [0.1] * 11},
            "phases": [{"phase": "Powerplay", "overs": [1, 6], "runs": {"mean": 50}, "wickets": {"mean": 1.4}}],
            "per_over": [{"over": o, "runs": 7 + o / 10, "p_wicket": 0.05, "wickets": 0.05} for o in range(1, 21)],
            "fan": [{"over": o, "q50": o * 8} for o in range(1, 21)],
            "fall_of_wickets": [{"wicket": str(w), "p": 0.9, "over": {"q": {"50": w * 2}}, "score": {"mean": w * 20},
                                 "bowler": [{"id": f"{side}9", "name": f"{side} Player 9", "p": 0.2}]} for w in range(1, 11)],
            "extras": {"total": 8}}})
    fantasy = {"players": {f"A{i}": {"team": 0, "role": "BAT", "expected": 40 - i, "p_solid": 0.5, "name": f"A Player {i}"} for i in range(11)},
               "single": {"players": [f"A{i}" for i in range(11)], "captain": "A0", "vice_captain": "A1", "expected": 500},
               "teams": [{"players": [f"A{i}" for i in range(11)], "captain": "A2", "vice_captain": "A3", "expected": 480} for _ in range(5)],
               "format": "T20"}
    return {"match": {"id": "a-v-b-t20-x-2026-11-27", "teams": [{"name": "Team A", "short": "A"}, {"name": "Team B", "short": "B"}]},
            "generated_at": "2026-11-27T10:00:00Z", "model": "m", "published": True, "sim_key": "k",
            "summary": {"meta": {"rules": {"overs": 20}}, "result": {"win": {"Team A": 0.55, "Team B": 0.45}, "win_by_first_innings": []},
                        "teams": teams, "matchups": [{"batter": "A0", "bowler": "B9", "p": 0.3}] + [{"batter": f"A{i}", "bowler": f"B{i}", "p": 0.1} for i in range(1, 10)]},
            "fantasy": fantasy, "insights": [{"kind": "result", "text": "A slight favourites"}, {"kind": "player", "text": "A Player 0 most likely top scorer"}]}


def test_round_trip_and_keys():
    d = doc()
    pub = L.lock_match(d, SECRET)
    assert pub["masked"] is True and "locked" in pub
    full = L.unlock_match(pub, SECRET)
    assert full["summary"] == d["summary"] and full["fantasy"] == d["fantasy"] and full["insights"] == d["insights"]
    assert "teaser" not in full and "locked" not in full
    with pytest.raises(Exception):
        L.unlock_match(pub, "wrong-secret")
    assert L.key_for(SECRET, "m1") != L.key_for(SECRET, "m2")


def test_overview_keeps_what_it_shows_and_nothing_more():
    d = doc()
    pub = L.lock_match(d, SECRET)
    t = pub["summary"]["teams"][0]
    assert t["batting"]["score"]["q"] == d["summary"]["teams"][0]["batting"]["score"]["q"]
    assert "hist" not in t["batting"]["score"] and "fan" not in t["batting"]
    with_batting = [p for p in t["players"] if "batting" in p]
    assert len(with_batting) == 5                                   # the five "players to watch"
    assert all(set(p["batting"]) == {"runs"} for p in with_batting)
    assert all("p_top_scorer" not in json.dumps(p) for p in t["players"])
    assert pub["summary"]["matchups"] == d["summary"]["matchups"][:1]
    assert pub["fantasy"]["single"]["captain"] == "A0" and "teams" not in pub["fantasy"]
    assert [i["kind"] for i in pub["insights"]] == ["result"]


def test_teaser_shows_a_share_and_hides_the_rest():
    d = doc()
    pub = L.lock_match(d, SECRET)
    text = json.dumps(pub["teaser"])
    # 2 of 11 players per side stay real (15%, rounded up); the other names and ids appear nowhere
    for side in "AB":
        assert f"{side} Player 0" in text and f"{side} Player 1" in text
        for i in range(2, 11):
            assert f'"{side}{i}"' not in text, f"{side}{i}"
    for i in range(2, 11):
        assert f'"B Player {i}"' not in text
    tt = pub["teaser"]["summary"]["teams"][0]
    assert [p["name"] for p in tt["players"][2:]] == [L.MASK] * 9
    assert sorted(p["batting"]["runs"]["mean"] for p in tt["players"][2:]) == sorted(50 - i * 3 for i in range(2, 11))  # real spread, shuffled
    assert len(tt["batting"]["fan"]) == 20 and tt["batting"]["fan"][:3] == d["summary"]["teams"][0]["batting"]["fan"][:3]


def test_finished_matches_stay_open(tmp_path):
    (tmp_path / "matches").mkdir(); (tmp_path / "venue").mkdir()
    old, new = doc(), doc()
    old["match"]["id"], old["match"]["date"] = "old", "2026-11-01"
    new["match"]["id"], new["match"]["date"] = "new", "2026-11-27"
    for d in (old, new):
        (tmp_path / "matches" / f"{d['match']['id']}.json").write_text(json.dumps(d))
        (tmp_path / "venue" / f"{d['match']['id']}.json").write_text(json.dumps({"history": {"first_innings": {"mean": 160}}}))
    assert L.lock_dir(tmp_path, SECRET, today="2026-11-27") == (1, 1)
    assert "locked" not in json.loads((tmp_path / "matches" / "old.json").read_text())
    assert "locked" not in json.loads((tmp_path / "venue" / "old.json").read_text())
    assert json.loads((tmp_path / "venue" / "new.json").read_text())["masked"] is True


def test_nothing_locked_without_the_secret(tmp_path):
    (tmp_path / "matches").mkdir()
    f = tmp_path / "matches" / "x.json"
    f.write_text(json.dumps(doc()))
    assert L.unlock_match(doc(), None) == doc()
    assert L.lock_dir(tmp_path, SECRET) == (1, 0)
    assert json.loads(f.read_text())["masked"] is True
    assert L.lock_dir(tmp_path, SECRET) == (0, 0)                 # already locked: left alone
