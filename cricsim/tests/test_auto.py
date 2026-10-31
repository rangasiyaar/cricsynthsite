"""Auto fixtures, playing XIs and scorecards from score-page data (shapes as the pages carry them)."""
import json
from datetime import datetime, timezone

from cricsim import auto, live

NZ = [("Tim Seifert", "WK-Batter", True), ("Finn Allen", "Batter", False), ("Daryl Mitchell", "Batter", False),
      ("Glenn Phillips", "Batting Allrounder", False), ("Bevon Jacobs", "Batter", False),
      ("Michael Bracewell", "Batting Allrounder", False), ("Mitchell Santner", "Bowling Allrounder", False),
      ("Kyle Jamieson", "Bowler", False), ("Adam Milne", "Bowler", False), ("Jacob Duffy", "Bowler", False),
      ("Matthew Fisher", "Bowler", False), ("Ish Sodhi", "Bowler", False), ("Devon Conway", "WK-Batter", True)]
IND = [("Sanju Samson", "WK-Batter", True), ("Abhishek Sharma", "Batting Allrounder", False),
       ("Vaibhav Sooryavanshi", "Batter", False), ("Shreyas Iyer", "Batter", False), ("Tilak Varma", "Batter", False),
       ("Nitish Kumar Reddy", "Batting Allrounder", False), ("Naman Dhir", "Batter", False),
       ("Axar Patel", "Bowling Allrounder", False), ("Bhuvneshwar Kumar", "Bowler", False),
       ("Arshdeep Singh", "Bowler", False), ("Prince Yadav", "Bowler", False), ("Kuldeep Yadav", "Bowler", False)]
START = datetime(2026, 10, 30, 7, 0, tzinfo=timezone.utc).timestamp() * 1000
MI = {"matchId": 161223, "seriesName": "India tour of New Zealand, 2026", "matchDesc": "4th T20I", "matchFormat": "T20",
      "startDate": START, "state": "Preview", "matchType": "International",
      "team1": {"teamId": 13, "teamName": "New Zealand", "teamSName": "NZ"},
      "team2": {"teamId": 2, "teamName": "India", "teamSName": "IND"},
      "venueInfo": {"ground": "Eden Park", "city": "Auckland"}}


def _players(team_id, rows, captain=None):
    return [{"id": i, "name": n, "role": r, "keeper": k, "captain": n == captain, "teamId": team_id}
            for i, (n, r, k) in enumerate(rows)]


def _page(*chunks: str) -> str:
    return "".join(f"<script>self.__next_f.push([1,{json.dumps(c)}])</script>" for c in chunks)


def _squads(named: bool) -> str:
    if named:
        return _page('"players":' + json.dumps({"playing XI": _players(13, NZ[:11], "Mitchell Santner"),
                                                 "bench": _players(13, NZ[11:])}),
                     '"players":' + json.dumps({"playing XI": _players(2, IND[:11], "Shreyas Iyer"),
                                                 "bench": _players(2, IND[11:])}))
    return _page('"players":' + json.dumps({"Squad": _players(13, NZ, "Mitchell Santner")}),
                 '"players":' + json.dumps({"Squad": _players(2, IND, "Shreyas Iyer")}))


HEAD = {"matchId": 161223, "state": "Toss", "status": "India opt to bowl",
        "tossResults": {"tossWinnerId": 2, "tossWinnerName": "India", "decision": "Bowling"},
        "team1": {"id": 13, "name": "New Zealand", "shortName": "NZ"}, "team2": {"id": 2, "name": "India", "shortName": "IND"}}


def test_wanted_and_ids():
    cfg = {**json.loads(auto.CONFIG.read_text()), "all": False, "exclude": ["Sixes", "Legends"]}
    assert auto.wanted(MI, cfg) == "T20" and auto.fixture_id(MI, "T20") == "nz-v-ind-t20i-auckland-2026-10-30"
    assert auto.wanted({**MI, "matchFormat": "TEST"}, cfg) is None
    league = {**MI, "matchType": "League", "seriesName": "Nepal Premier League 2026"}
    assert auto.wanted(league, cfg) == "T20" and auto.fixture_id(league, "T20").split("-")[3] == "t20"
    assert auto.wanted({**league, "seriesName": "CSA T20 Challenge 2026"}, cfg) is None
    assert auto.wanted({**MI, "seriesName": "Hong Kong Sixes 2026"}, cfg) is None


def test_new_fixture_probable_then_confirmed():
    sq = auto.squads(live.flight(_squads(False)))
    fx = auto.new_fixture(MI, "T20", sq, {"India": [n for n, _, _ in IND[:10]] + ["Kuldeep Yadav"]})
    nz, ind = fx["teams"]
    assert (fx["date"], fx["start_time"], fx["format"], fx["gender"]) == ("2026-10-30", "12:30", "T20", "male")
    assert fx["competition"] == "India tour of New Zealand, 2026 · 4th T20I" and fx["comp_key"] == "intl-international-T20"
    assert len(nz["players"]) == 11 and nz["roles"].count("WK") == 1 and nz["captain"] == "Mitchell Santner"
    assert "Kuldeep Yadav" in ind["players"] and "Prince Yadav" not in ind["players"]     # last XI where in the squad
    assert fx["live"] == {"id": 161223, "auto": True, "xis": False} and "Probable" in fx["note"]
    assert len(ind["squad"]) == 12
    # at the toss: named XIs, captains and who bats first (India won it and bowl)
    assert auto.confirm_xis(fx, auto.squads(live.flight(_squads(True))), HEAD)
    assert fx["teams"][1]["players"] == [n for n, _, _ in IND[:11]] and fx["batting_first"] == 0
    assert fx["teams"][1]["captain"] == "Shreyas Iyer" and fx["live"]["xis"] is True
    assert fx["note"] == "Playing XIs confirmed. India won the toss and bowl first."
    assert not auto.confirm_xis(fx, auto.squads(live.flight(_squads(True))), HEAD)          # nothing new


CARD = {"scoreCard": [
    {"matchId": 1, "inningsId": 1,
     "batTeamDetails": {"batTeamName": "New Zealand", "batsmenData": {
         "bat_1": {"batName": "Tim Seifert", "outDesc": "c Axar Patel b Arshdeep Singh", "runs": 2, "balls": 6, "fours": 0, "sixes": 0},
         "bat_2": {"batName": "Daryl Mitchell", "outDesc": "not out", "runs": 89, "balls": 52, "fours": 5, "sixes": 5},
         "bat_3": {"batName": "Kyle Jamieson", "outDesc": "", "runs": 0, "balls": 0, "fours": 0, "sixes": 0}}},
     "bowlTeamDetails": {"bowlersData": {"bowl_1": {"bowlName": "Arshdeep Singh", "overs": 4, "maidens": 0, "runs": 33,
                                                     "wickets": 1, "no_balls": 0, "wides": 2}}},
     "scoreDetails": {"runs": 98, "wickets": 1, "overs": 20, "revisedOvers": 0},
     "extrasData": {"byes": 0, "legByes": 3, "noBalls": 0, "penalty": 0, "wides": 4},
     "wicketsData": {"wkt_1": {"batName": "Tim Seifert", "wktOver": 1.2, "wktRuns": 4, "wktNbr": 1}},
     "ppData": {"pp_1": {"ppType": "mandatory", "runsScored": 58}}},
    {"matchId": 1, "inningsId": 2,
     "batTeamDetails": {"batTeamName": "India", "batsmenData": {
         "bat_1": {"batName": "Abhishek Sharma", "outDesc": "batting", "runs": 99, "balls": 38, "fours": 9, "sixes": 11}}},
     "bowlTeamDetails": {"bowlersData": {}}, "scoreDetails": {"runs": 99, "wickets": 0, "overs": 8.3},
     "extrasData": {}, "wicketsData": {}, "ppData": {}}]}


def test_scorecard():
    fx = {"id": "nz-v-ind", "teams": [{"name": "New Zealand", "short": "NZ"}, {"name": "India", "short": "IND"}]}
    done = {**HEAD, "state": "Complete", "result": {"resultType": "win", "winningTeam": "India", "winningMargin": 10, "winByRuns": False}}
    text = live.flight(_page(json.dumps(CARD)[1:-1]))
    assert auto.scorecard(fx, text, {**HEAD, "state": "In Progress"}) is None
    c = auto.scorecard(fx, text, done)
    a, b = c["innings"]
    assert (a["team"], a["runs"], a["overs"], b["overs"]) == ("New Zealand", 98, "20", "8.3")
    assert [x["name"] for x in a["batting"]] == ["Tim Seifert", "Daryl Mitchell"]          # did-not-bat left out
    assert b["batting"][0]["dismissal"] == "not out"
    assert a["extras"] == {"b": 0, "lb": 3, "w": 4, "nb": 0, "p": 0} and a["powerplay_runs"] == 58
    assert a["fall_of_wickets"] == [{"wicket": 1, "batter": "Tim Seifert", "score": 4, "over": "1.2"}]
    assert a["bowling"][0] == {"name": "Arshdeep Singh", "overs": "4", "maidens": 0, "runs": 33, "wickets": 1,
                               "no_balls": 0, "wides": 2}
    assert c["winner"] == "India" and c["result"] == "India won by 10 wickets" and "powerplay_runs" not in b
    assert auto.scorecard(fx, "", {"state": "Abandoned", "status": "Match abandoned due to rain"})["abandoned"]


def test_run_end_to_end(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    sched = _page('"matchInfo":' + json.dumps(MI))
    pages = {auto.SCHEDULE: sched, live.LIST: "", f"{live.BASE}/cricket-match-squads/161223": _squads(False)}
    day_before = datetime(2026, 10, 29, 10, 0, tzinfo=timezone.utc)
    assert auto.run(fixtures, results, now=day_before, page=pages.get) == ["nz-v-ind-t20i-auckland-2026-10-30.json"]
    assert auto.run(fixtures, results, now=day_before, page=pages.get) == []                 # already there
    # an hour before the start the XIs are named
    pages[f"{live.BASE}/cricket-match-squads/161223"] = _squads(True)
    pages[f"{live.BASE}/live-cricket-scores/161223"] = _page('"matchHeader":' + json.dumps(HEAD))
    toss = datetime(2026, 10, 30, 6, 30, tzinfo=timezone.utc)
    assert auto.run(fixtures, results, now=toss, page=pages.get) == ["nz-v-ind-t20i-auckland-2026-10-30.json"]
    fx = json.loads((fixtures / "nz-v-ind-t20i-auckland-2026-10-30.json").read_text())
    assert fx["batting_first"] == 0 and fx["live"]["xis"]
    # after the match: the scorecard
    done = {**HEAD, "state": "Complete", "result": {"resultType": "win", "winningTeam": "India", "winningMargin": 10}}
    pages[f"{live.BASE}/live-cricket-scores/161223"] = _page('"matchHeader":' + json.dumps(done))
    pages[f"{live.BASE}/live-cricket-scorecard/161223"] = _page(json.dumps(CARD)[1:-1])
    auto.run(fixtures, results, now=datetime(2026, 10, 30, 11, 0, tzinfo=timezone.utc), page=pages.get)
    card = json.loads((results / "nz-v-ind-t20i-auckland-2026-10-30.json").read_text())
    assert card["winner"] == "India" and card["id"] == "nz-v-ind-t20i-auckland-2026-10-30"


def test_late_xis_after_the_start(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    pages = {auto.SCHEDULE: _page('"matchInfo":' + json.dumps(MI)), live.LIST: "",
             f"{live.BASE}/cricket-match-squads/161223": _squads(False)}
    auto.run(fixtures, results, now=datetime(2026, 10, 29, 10, 0, tzinfo=timezone.utc), page=pages.get)
    name = "nz-v-ind-t20i-auckland-2026-10-30.json"
    pages[f"{live.BASE}/cricket-match-squads/161223"] = _squads(True)
    pages[f"{live.BASE}/live-cricket-scores/161223"] = _page('"matchHeader":' + json.dumps(HEAD))
    later = datetime(2026, 10, 30, 10, 30, tzinfo=timezone.utc)               # 3.5 hours after the start: T20 over
    assert auto.run(fixtures, results, now=later, page=pages.get) == []      # outside the normal window
    assert auto.run(fixtures, results, now=later, page=pages.get, late={name}) == [name]


def test_xis_named_after_the_start(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    pages = {auto.SCHEDULE: _page('"matchInfo":' + json.dumps(MI)), live.LIST: "",
             f"{live.BASE}/cricket-match-squads/161223": _squads(False)}
    auto.run(fixtures, results, now=datetime(2026, 10, 29, 10, 0, tzinfo=timezone.utc), page=pages.get)
    name = "nz-v-ind-t20i-auckland-2026-10-30.json"
    pages[f"{live.BASE}/cricket-match-squads/161223"] = _squads(True)
    pages[f"{live.BASE}/live-cricket-scores/161223"] = _page('"matchHeader":' + json.dumps(HEAD))
    mid_match = datetime(2026, 10, 30, 8, 30, tzinfo=timezone.utc)            # 1.5 hours after the start
    assert auto.run(fixtures, results, now=mid_match, page=pages.get) == [name]
    assert json.loads((fixtures / name).read_text())["live"]["xis"]
    fx = json.loads((fixtures / name).read_text())
    assert fx["live"]["xis"] and fx["batting_first"] == 0


def test_hand_written_fixture_is_linked_not_replaced(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    mine = {"id": "nz-v-ind-t20i-auckland-2026-10-30", "date": "2026-10-30", "start_time": "12:30", "format": "T20",
            "note": "Playing XIs confirmed.", "teams": [{"name": "New Zealand", "short": "NZ", "players": ["x"] * 11},
                                                        {"name": "India", "short": "IND", "players": ["y"] * 11}]}
    (fixtures / "mine.json").write_text(json.dumps(mine))
    pages = {auto.SCHEDULE: _page('"matchInfo":' + json.dumps(MI)), live.LIST: "",
             f"{live.BASE}/cricket-match-squads/161223": _squads(True),
             f"{live.BASE}/live-cricket-scores/161223": _page('"matchHeader":' + json.dumps(HEAD))}
    assert auto.run(fixtures, results, now=datetime(2026, 10, 30, 6, 30, tzinfo=timezone.utc), page=pages.get) == []
    got = json.loads((fixtures / "mine.json").read_text())
    assert got["live"]["id"] == 161223 and got["teams"][0]["players"] == ["x"] * 11      # linked; my XIs kept
    assert len(list(fixtures.glob("*.json"))) == 1


def test_schedule_without_match_type():
    cfg = {**json.loads(auto.CONFIG.read_text()), "all": False}
    bare = {k: v for k, v in MI.items() if k != "matchType"}
    assert auto.wanted({**bare, "seriesName": "Ireland tour of Namibia, 2026", "matchFormat": "ODI"}, cfg) == "OD"
    assert auto.wanted({**bare, "seriesName": "Afghanistan vs Zimbabwe in UAE, 2026"}, cfg) == "T20"
    assert auto.wanted({**bare, "seriesName": "WBBL 2026"}, cfg) == "T20"
    assert auto.wanted({**bare, "seriesName": "CSA T20 Challenge 2026"}, cfg) is None
    assert auto.wanted({**bare, "seriesName": "ICC CWC Challenge League A, 2024-26", "matchFormat": "ODI"}, cfg) == "OD"
    assert auto.wanted({**bare, "seriesName": "Hong Kong Sixes 2026"}, cfg) is None
    assert auto.fixture_id({**bare, "seriesName": "WBBL 2026"}, "T20").split("-")[3] == "t20"


def test_all_limited_overs():
    cfg = json.loads(auto.CONFIG.read_text())                  # the live config: everything but the Sixes
    bare = {k: v for k, v in MI.items() if k != "matchType"}
    assert auto.wanted({**bare, "seriesName": "CSA T20 Challenge 2026"}, cfg) == "T20"
    assert auto.wanted({**bare, "seriesName": "The Ford Trophy 2026-27", "matchFormat": "ODI"}, cfg) == "OD"
    assert auto.wanted({**bare, "seriesName": "Hong Kong Sixes 2026"}, cfg) is None
    assert auto.wanted({**bare, "seriesName": "Ranji Trophy Elite 2026-27", "matchFormat": "TEST"}, cfg) is None


def test_xis_confirmed_flag():
    from cricsim.publish import xis_confirmed
    assert xis_confirmed({"live": {"xis": True}})
    assert xis_confirmed({"note": "Playing XIs confirmed. India won the toss and bowl first."})
    assert not xis_confirmed({"live": {"xis": False}, "note": "Probable XIs from the squads; updated when the teams are named."})
