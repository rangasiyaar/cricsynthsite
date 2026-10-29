"""Live state from a score page: page data decoding, finding our fixture, the engine start state and when to write."""
import json
from datetime import datetime, timezone

from cricsim import live
from cricsim.results import Roster

ENG = ["Tom Banton", "Ben Duckett", "Harry Brook", "Joe Root", "Jos Buttler", "Will Jacks", "Sam Curran",
       "Adil Rashid", "Brydon Carse", "Saqib Mahmood", "Jofra Archer"]
SL = ["Pathum Nissanka", "Kusal Mendis", "Kusal Perera", "Charith Asalanka", "Kamindu Mendis", "Dasun Shanaka",
      "Dunith Wellalage", "Wanindu Hasaranga", "Maheesh Theekshana", "Matheesha Pathirana", "Dilshan Madushanka"]


def _doc():
    ids = [[f"e{i}" for i in range(11)], [f"s{i}" for i in range(11)]]
    return {"summary": {"teams": [{"players": [{"id": p, "name": n} for p, n in zip(ids[0], ENG)]},
                                  {"players": [{"id": p, "name": n} for p, n in zip(ids[1], SL)]}]},
            "match": {"teams": [{"name": "England", "players": ids[0]}, {"name": "Sri Lanka", "players": ids[1]}]}}


def _page(*chunks: str) -> str:
    return "".join(f"<script>self.__next_f.push([1,{json.dumps(c)}])</script>" for c in chunks)


OTHER = {"matchId": 1, "inningsId": 1, "batTeam": {"teamId": 4, "teamScore": 300, "teamWkts": 9}}
MINI = {"inningsId": 2, "batTeam": {"teamId": 5, "teamScore": 46, "teamWkts": 1}, "status": "Sri Lanka need 147",
        "batsmanStriker": {"id": 1, "name": "Kusal Mendis", "runs": 5}, "batsmanNonStriker": {"id": 2, "name": "Pathum Nissanka"},
        "overs": 4.2, "target": 193,
        "matchScoreDetails": {"matchId": 170751, "inningsScoreList": [
            {"inningsId": 1, "batTeamId": 9, "batTeamName": "ENG", "score": 192, "wickets": 4, "overs": 20},
            {"inningsId": 2, "batTeamId": 5, "batTeamName": "SL", "score": 46, "wickets": 1, "overs": 4.2}]}}
HEAD = {"matchId": 170751, "state": "In Progress", "status": "Sri Lanka need 147",
        "team1": {"id": 5, "name": "Sri Lanka", "shortName": "SL"}, "team2": {"id": 9, "name": "England", "shortName": "ENG"}}
CARD = {"scoreCard": [{"matchId": 170751, "inningsId": 2, "batTeamDetails": {"batsmenData": {
    "bat_1": {"batName": "Charith Asalanka", "outDesc": "b Archer"},
    "bat_2": {"batName": "Kusal Mendis", "outDesc": "batting"},
    "bat_3": {"batName": "Pathum Nissanka", "outDesc": "not out"},
    "bat_4": {"batName": "Kusal Perera", "outDesc": "retired hurt"}}}}]}


def test_page_data_and_objects():
    text = live.flight(_page('x"miniscore":' + json.dumps(OTHER) + ",", '"miniscore":' + json.dumps(MINI) + ',"matchHeader":'
                             + json.dumps(HEAD)))
    assert len(live.objects(text, "miniscore")) == 2
    assert live.first(text, "miniscore", 170751)["batTeam"]["teamScore"] == 46     # not the other match on the page
    assert live.first(text, "matchHeader")["state"] == "In Progress"


def test_state_in_our_ids():
    text = live.flight(_page('"miniscore":' + json.dumps(MINI) + ',"matchHeader":' + json.dumps(HEAD)))
    card = live.flight(_page(json.dumps(CARD)[1:-1]))
    out = live.out_batters(card, 2, 170751)
    assert out == ["Charith Asalanka"]                                            # retired hurt is not out
    s = live.state(text, Roster(_doc(), None), "T20", out, 170751)
    assert s["innings"] == 2 and s["batting"] == 1 and s["battingFirst"] == 0
    assert (s["runs"], s["wickets"], s["balls"], s["firstInningsTotal"], s["target"]) == (46, 1, 26, 192, 193)
    assert s["striker"] == "s1" and s["nonStriker"] == "s0" and s["out"] == ["s3"]
    assert live.balls_of(19.6, 6) == 120 and live.balls_of("7", 6) == 42 and live.balls_of(12.4, 5) == 64


def test_before_the_start_and_change_key():
    text = live.flight(_page('"matchHeader":' + json.dumps({**HEAD, "state": "Toss", "status": "England opt to bat"})))
    assert live.state(text, Roster(_doc(), None), "T20") == {"state": "Toss", "status": "England opt to bat"}
    a = {"state": "In Progress", "innings": 1, "wickets": 2, "balls": 37}
    assert live.change_key(a, 6) == live.change_key({**a, "balls": 41}, 6)         # same over: no write
    assert live.change_key(a, 6) != live.change_key({**a, "balls": 42}, 6)         # over ended
    assert live.change_key(a, 6) != live.change_key({**a, "wickets": 3}, 6)        # wicket


def test_find_match_and_window():
    fx = {"date": "2026-10-29", "start_time": "13:30", "format": "OD",
          "teams": [{"name": "England", "short": "ENG"}, {"name": "Sri Lanka", "short": "SL"}]}
    start = datetime(2026, 10, 29, 8, 0, tzinfo=timezone.utc).timestamp() * 1000
    listing = [{"matchId": 1, "startDate": start, "team1": {"teamName": "South Africa"}, "team2": {"teamName": "Australia"}},
               {"matchId": 170751, "startDate": start, "team1": {"teamName": "England", "teamSName": "ENG"},
                "team2": {"teamName": "Sri Lanka", "teamSName": "SL"}},
               {"matchId": 9, "startDate": start + 3 * 86400e3, "team1": {"teamName": "England"},
                "team2": {"teamName": "Sri Lanka"}}]
    assert live.find_match(fx, listing) == 170751
    assert live.find_match({**fx, "live": {"id": 42}}, listing) == 42
    npl = {"date": "2026-10-28", "start_time": "16:45", "teams": [{"name": "Pokhara Avengers"}, {"name": "Sudur Paschim Royals"}]}
    t = datetime(2026, 10, 28, 11, 15, tzinfo=timezone.utc).timestamp() * 1000
    assert live.find_match(npl, [{"matchId": 7, "startDate": t, "team1": {"teamName": "Sudurpaschim Royals"},
                                  "team2": {"teamName": "Pokhara Avengers"}}]) == 7
    assert live.window(fx, datetime(2026, 10, 29, 7, 50, tzinfo=timezone.utc)) == "on"     # toss time
    assert live.window(fx, datetime(2026, 10, 29, 7, 30, tzinfo=timezone.utc)) == "soon"
    assert live.window(fx, datetime(2026, 10, 29, 18, 0, tzinfo=timezone.utc)) == "off"
    assert live.window({**fx, "format": "MULTIDAY"}, datetime(2026, 10, 29, 9, 0, tzinfo=timezone.utc)) == "off"


def test_firestore_values():
    v = live.value({"runs": 46, "out": ["s3"], "rr": 6.2, "on": True, "x": None})
    f = v["mapValue"]["fields"]
    assert f["runs"] == {"integerValue": "46"} and f["rr"] == {"doubleValue": 6.2} and f["on"] == {"booleanValue": True}
    assert f["out"] == {"arrayValue": {"values": [{"stringValue": "s3"}]}} and f["x"] == {"nullValue": None}


def test_run_once_dry(tmp_path, capsys, monkeypatch):
    fx = {"id": "eng-v-sl", "date": "2026-10-29", "start_time": "13:30", "format": "T20", "published": True,
          "teams": [{"name": "England", "short": "ENG", "players": ENG}, {"name": "Sri Lanka", "short": "SL", "players": SL}]}
    (tmp_path / "eng-v-sl.json").write_text(json.dumps(fx))
    listing = _page('"matchInfo":' + json.dumps({"matchId": 170751, "team1": {"teamName": "England"},
                                                 "team2": {"teamName": "Sri Lanka"}}))
    pages = {live.LIST: listing, f"{live.BASE}/live-cricket-scores/170751": _page('"miniscore":' + json.dumps(MINI)
                                                                                  + ',"matchHeader":' + json.dumps(HEAD)),
             f"{live.BASE}/live-cricket-scorecard/170751": _page(json.dumps(CARD)[1:-1])}

    class Now(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 29, 9, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(live, "datetime", Now)
    live.run(tmp_path, dry=True, once=True, max_minutes=1, fetch=lambda path: _doc(), page=pages.__getitem__)
    out = capsys.readouterr().out
    line = next(ln for ln in out.splitlines() if ln.startswith("eng-v-sl: {"))
    doc = json.loads(line.split(": ", 1)[1])
    assert doc["published"] is True and doc["runs"] == 46 and doc["out"] == ["s3"] and "cricbuzz" not in line
