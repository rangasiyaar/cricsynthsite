"""Small Cricsheet-format matches used by the tests (format: https://cricsheet.org/format/json/)."""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

REG = {"A Batter": "aaaa0001", "B Batter": "aaaa0002", "C Batter": "aaaa0003", "D Bowler": "bbbb0001",
       "E Bowler": "bbbb0002", "F Fielder": "bbbb0003", "G Keeper": "aaaa0004"}


def d(batter, bowler, non_striker, bat=0, extras=None, wickets=None):
    ex = extras or {}
    out = {"batter": batter, "bowler": bowler, "non_striker": non_striker,
           "runs": {"batter": bat, "extras": sum(ex.values()), "total": bat + sum(ex.values())}}
    if ex:
        out["extras"] = ex
    if wickets:
        out["wickets"] = wickets
    return out


def t20_ipl() -> dict:
    over0 = [
        d("A Batter", "D Bowler", "B Batter", 4),
        d("A Batter", "D Bowler", "B Batter", 0, {"wides": 1}),
        d("A Batter", "D Bowler", "B Batter", 1, {"noballs": 1}),           # free hit off a no-ball
        d("B Batter", "D Bowler", "A Batter", 0, {"legbyes": 1}),
        d("A Batter", "D Bowler", "B Batter", 0, None, [{"player_out": "A Batter", "kind": "caught",
                                                          "fielders": [{"name": "F Fielder"}]}]),
        d("C Batter", "D Bowler", "B Batter", 6),
        d("C Batter", "D Bowler", "B Batter", 1, None, [{"player_out": "B Batter", "kind": "run out",
                                                          "fielders": [{"name": "F Fielder"}, {"name": "G Keeper"}]}]),
    ]
    over1 = [
        d("C Batter", "E Bowler", "G Keeper", 2),
        d("C Batter", "E Bowler", "G Keeper", 0, None, [{"player_out": "C Batter", "kind": "retired hurt"}]),
        d("G Keeper", "E Bowler", "A Batter", 0),
    ]
    return {
        "meta": {"data_version": "1.1.0"},
        "info": {
            "balls_per_over": 6, "city": "Mumbai", "dates": ["2024-04-01"],
            "event": {"name": "Indian Premier League", "match_number": 14}, "gender": "male",
            "match_type": "T20", "overs": 20, "player_of_match": ["C Batter"],
            "players": {"Mumbai Indians": ["A Batter", "B Batter", "C Batter", "G Keeper"],
                        "Kings XI Punjab": ["D Bowler", "E Bowler", "F Fielder"]},
            "registry": {"people": REG}, "season": "2024", "team_type": "club",
            "teams": ["Mumbai Indians", "Kings XI Punjab"],
            "toss": {"decision": "field", "winner": "Kings XI Punjab"},
            "outcome": {"winner": "Mumbai Indians", "by": {"runs": 12}},
            "venue": "Wankhede Stadium, Mumbai",
        },
        "innings": [{"team": "Mumbai Indians", "overs": [{"over": 0, "deliveries": over0},
                                                          {"over": 1, "deliveries": over1}],
                     "powerplays": [{"from": 0.1, "to": 5.6, "type": "mandatory"}]},
                    {"team": "Kings XI Punjab", "target": {"overs": 20, "runs": 18},
                     "overs": [{"over": 0, "deliveries": [d("D Bowler", "A Batter", "E Bowler", 1)]}]}],
    }


def hundred() -> dict:
    balls = [d("A Batter", "D Bowler", "B Batter", 1) for _ in range(5)]
    return {"meta": {}, "info": {
        "balls_per_over": 5, "dates": ["2023-08-01"], "event": {"name": "The Hundred Men's Competition"},
        "gender": "male", "match_type": "T20", "overs": 20, "registry": {"people": REG},
        "season": "2023", "team_type": "club", "teams": ["Oval Invincibles", "London Spirit"],
        "venue": "Kennington Oval, London", "city": "London", "outcome": {"winner": "Oval Invincibles", "by": {"wickets": 3}}},
        "innings": [{"team": "Oval Invincibles", "overs": [{"over": 0, "deliveries": balls}]}]}


def super_over_tie() -> dict:
    return {"meta": {}, "info": {
        "dates": ["2022-01-02"], "event": {"name": "Big Bash League"}, "gender": "female", "match_type": "T20",
        "overs": 20, "registry": {"people": REG}, "season": "2021/22", "team_type": "club",
        "teams": ["Sydney Sixers", "Perth Scorchers"], "venue": "Sydney Cricket Ground",
        "outcome": {"result": "tie", "eliminator": "Perth Scorchers"}},
        "innings": [
            {"team": "Sydney Sixers", "overs": [{"over": 0, "deliveries": [d("A Batter", "D Bowler", "B Batter", 6)]}]},
            {"team": "Perth Scorchers", "overs": [{"over": 0, "deliveries": [d("D Bowler", "A Batter", "E Bowler", 6)]}]},
            {"team": "Perth Scorchers", "super_over": True,
             "overs": [{"over": 0, "deliveries": [d("D Bowler", "A Batter", "E Bowler", 4)]}]},
        ]}


def no_result() -> dict:
    return {"meta": {}, "info": {
        "dates": ["2021-05-01"], "gender": "male", "match_type": "ODI", "overs": 50, "registry": {"people": REG},
        "season": "2021", "team_type": "international", "teams": ["India", "England"],
        "venue": "Eden Gardens", "outcome": {"result": "no result"}}}


def test_match() -> dict:
    return {"meta": {}, "info": {
        "dates": ["2020-01-01", "2020-01-02"], "gender": "male", "match_type": "Test", "registry": {"people": REG},
        "season": "2019/20", "team_type": "international", "teams": ["India", "England"], "venue": "Lord's, London",
        "city": "London", "outcome": {"result": "draw"}},
        "innings": [{"team": "India", "declared": True,
                     "overs": [{"over": 0, "deliveries": [d("A Batter", "D Bowler", "B Batter", 1)]}]}]}


ALL = {"1001": t20_ipl, "1002": hundred, "1003": super_over_tie, "1004": no_result, "1005": test_match}


def write_zip(path: Path) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        for mid, fn in ALL.items():
            zf.writestr(f"{mid}.json", json.dumps(fn()))
        zf.writestr("README.txt", "not a match")
        zf.writestr("9999.json", "{not json")
    return path


def write_register(dir_: Path) -> tuple[Path, Path]:
    people = dir_ / "people.csv"
    people.write_text("identifier,name,unique_name,key_bcci,key_cricinfo,key_cricbuzz\n"
                      + "".join(f"{pid},{n},{n},,{i},\n" for i, (n, pid) in enumerate(REG.items())))
    names = dir_ / "names.csv"
    names.write_text("identifier,name\naaaa0001,A Batter\naaaa0001,Aaron Batter\n")
    return people, names
