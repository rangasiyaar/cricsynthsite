"""Cricsheet JSON → normalised rows."""
from __future__ import annotations

from datetime import date

import make_fixtures as fx
from cricdata.names import canonical_venue, team_id, venue_id
from cricdata.parse import classify_format, parse_match


def test_match_row():
    m = parse_match(fx.t20_ipl(), "1001")["matches"][0]
    assert m["format"] == "T20" and m["is_limited_overs"]
    assert m["match_date"] == date(2024, 4, 1) and m["season"] == "2024"
    assert m["competition"] == "Indian Premier League" and m["competition_id"] == "indian-premier-league"
    assert (m["team1"], m["team2"]) == ("Mumbai Indians", "Punjab Kings")      # renamed franchise
    assert m["team2_raw"] == "Kings XI Punjab" and m["team2_id"] == "punjab-kings"
    assert m["toss_winner"] == "Punjab Kings" and m["toss_decision"] == "field"
    assert m["venue"] == "Wankhede Stadium" and m["venue_id"] == "wankhede-stadium"
    assert (m["winner"], m["result"], m["by_runs"]) == ("Mumbai Indians", "win", 12)
    assert m["player_of_match"] == ["aaaa0003"]


def test_deliveries_extras_and_legal_balls():
    rows = parse_match(fx.t20_ipl(), "1001")["deliveries"]
    first = [r for r in rows if r["innings_no"] == 1]
    assert len(first) == 10
    wide, noball, legbye = first[1], first[2], first[3]
    assert wide["wides"] == 1 and not wide["is_legal"] and wide["legal_ball_in_over"] is None
    assert noball["noballs"] == 1 and noball["runs_batter"] == 1 and not noball["is_legal"]
    assert legbye["legbyes"] == 1 and legbye["is_legal"] and legbye["runs_batter"] == 0
    assert [r["legal_ball_in_over"] for r in first[:7]] == [1, None, None, 2, 3, 4, 5]
    assert all(r["batter_id"] for r in first) and first[0]["bowler_id"] == "bbbb0001"


def test_state_before_each_ball():
    rows = [r for r in parse_match(fx.t20_ipl(), "1001")["deliveries"] if r["innings_no"] == 1]
    # runs: 4, wide 1, no-ball 1+1, legbye 1, wicket 0, six, run-out single
    assert [r["team_runs_before"] for r in rows[:7]] == [0, 4, 5, 7, 8, 8, 14]
    assert [r["legal_balls_before"] for r in rows[:7]] == [0, 1, 1, 1, 2, 3, 4]
    assert [r["team_wickets_before"] for r in rows[:7]] == [0, 0, 0, 0, 0, 1, 1]
    a = [r for r in rows if r["batter"] == "A Batter"]
    # balls faced: the wide doesn't count, the no-ball does
    assert [r["batter_balls_before"] for r in a] == [0, 1, 1, 2]
    assert [r["batter_runs_before"] for r in a] == [0, 4, 4, 5]
    # retired hurt is listed as a "wicket" but is not a dismissal
    assert rows[9]["team_wickets_before"] == 2
    assert rows[8]["is_wicket"] is False


def test_wickets_table():
    w = parse_match(fx.t20_ipl(), "1001")["wickets"]
    caught, run_out, hurt = w
    assert caught["kind"] == "caught" and caught["bowler_id"] == "bbbb0001" and caught["fielder_ids"] == ["bbbb0003"]
    assert caught["wicket_number"] == 1 and caught["team_runs_at_fall"] == 8
    assert run_out["bowler_id"] is None and run_out["fielder_ids"] == ["bbbb0003", "aaaa0004"]
    assert run_out["player_out_id"] == "aaaa0002" and run_out["wicket_number"] == 2
    assert not hurt["is_dismissal"] and hurt["wicket_number"] is None


def test_innings_and_target():
    inns = parse_match(fx.t20_ipl(), "1001")["innings"]
    assert inns[0]["runs"] == 17 and inns[0]["wickets"] == 2 and inns[0]["legal_balls"] == 8
    assert inns[0]["powerplays"][0]["type"] == "mandatory"
    assert inns[1]["target_runs"] == 18 and inns[1]["team"] == "Punjab Kings"
    second = [r for r in parse_match(fx.t20_ipl(), "1001")["deliveries"] if r["innings_no"] == 2]
    assert second[0]["target_runs"] == 18 and second[0]["batting_team_id"] == "punjab-kings"
    assert second[0]["bowling_team_id"] == "mumbai-indians"


def test_formats():
    assert classify_format(fx.hundred()["info"]) == "HUNDRED"
    assert classify_format(fx.test_match()["info"]) == "MULTIDAY"
    assert classify_format(fx.no_result()["info"]) == "OD"
    assert classify_format({"match_type": "T20", "overs": 10}) == "T10"
    assert classify_format({"match_type": "IT20", "overs": 20}) == "T20"
    h = parse_match(fx.hundred(), "1002")
    assert h["matches"][0]["balls_per_over"] == 5 and h["deliveries"][0]["balls_per_over"] == 5


def test_super_over_tie_no_result_and_declaration():
    s = parse_match(fx.super_over_tie(), "1003")
    assert s["matches"][0]["result"] == "tie" and s["matches"][0]["eliminator"] == "Perth Scorchers"
    assert [i["is_super_over"] for i in s["innings"]] == [False, False, True]
    assert s["matches"][0]["gender"] == "female" and s["matches"][0]["season"] == "2021/22"
    nr = parse_match(fx.no_result(), "1004")
    assert nr["matches"][0]["result"] == "no result" and nr["deliveries"] == [] and nr["innings"] == []
    t = parse_match(fx.test_match(), "1005")
    assert t["innings"][0]["declared"] and not t["matches"][0]["is_limited_overs"]


def test_names():
    assert canonical_venue("Wankhede Stadium, Mumbai", "Mumbai") == "Wankhede Stadium"
    assert canonical_venue("Feroz Shah Kotla") == "Arun Jaitley Stadium"
    assert canonical_venue("Kennington Oval, London", "London") == "Kennington Oval"
    assert canonical_venue("Eden Gardens") == "Eden Gardens"
    assert canonical_venue("Sharjah Cricket Stadium, Sharjah") == "Sharjah Cricket Stadium"
    assert venue_id("M.Chinnaswamy Stadium") == "m-chinnaswamy-stadium"
    assert team_id("Delhi Daredevils") == team_id("Delhi Capitals") == "delhi-capitals"
