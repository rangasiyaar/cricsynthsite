import asyncio
import json

import pytest

from cricmcp import server
from cricmcp.data import DataError


def call(name, **args):
    return asyncio.run(server.mcp.call_tool(name, args))


def test_tools_listed():
    names = {t.name for t in asyncio.run(server.mcp.list_tools())}
    assert {"list_matches", "match_forecast", "player_outlook", "key_matchups", "innings_shape", "about_the_model",
            "simulate_scenario", "live_win_probability", "fantasy_team", "rankings", "matchup",
            "team_profile", "venue_profile", "par_score", "bowling_plan", "match_graphic"} <= names
    assert len(names) >= 40 and not {"pattern_lab", "pattern_detail"} & names
    assert "api_request" not in names          # only with a key


def test_list_and_forecast():
    ms = server.list_matches()["matches"]
    assert ms and ms[0]["id"] == "m1"
    f = server.match_forecast("Premier 0 v Premier 1")
    assert f["match"]["id"] == "m1" and set(f["win"]) == {"Premier 0", "Premier 1"}
    assert len(f["teams"]) == 2 and f["teams"][0]["score_80pct_range"]
    assert server.match_forecast()["match"]["id"] == "m1"       # no query = next match


def test_unknown_match_lists_choices():
    with pytest.raises(DataError, match="Published matches"):
        server.match_forecast("Atlantis v Lemuria")


def test_player_and_matchups():
    p = server.player_outlook("P0-0")
    assert p["team"] == "Premier 0" and p["batting"]["slot"] == 1
    assert server.key_matchups(limit=3)["matchups"][0]["chance_bowler_dismisses_batter"].endswith("%")
    assert server.innings_shape()["teams"][0]["by_over"]


def test_scenario_moves_the_numbers():
    base = server.simulate_scenario(simulations=600)
    flat = server.simulate_scenario(boundary_mult=1.6, simulations=600)
    assert flat["teams"][0]["score"]["mean"] > base["teams"][0]["score"]["mean"] + 10
    toss = server.simulate_scenario(batting_first="Premier 1", simulations=300)
    assert toss["teams"][1]["score"]["mean"] > 0


def test_live_win_probability_chase():
    easy = server.live_win_probability("Premier 1", runs=150, wickets=2, overs=18.0, target=160, simulations=400)
    hard = server.live_win_probability("Premier 1", runs=100, wickets=8, overs=18.0, target=160, simulations=400)
    assert easy["runs_needed"] == 10 and easy["balls_left"] == 12
    pct = lambda r: float(r["win"]["Premier 1"].rstrip("%"))  # noqa: E731
    assert pct(easy) > 80 > 5 > pct(hard)


def test_live_overs_validation():
    with pytest.raises(DataError):
        server.live_win_probability("Premier 0", runs=40, wickets=1, overs=5.7)


def test_fantasy_team_rules():
    f = server.fantasy_team(simulations=500)
    xi = f["xi"]
    assert len(xi) == 11 and len({r["name"] for r in xi}) == 11
    per = [sum(r["team"] == t for r in xi) for t in ("Premier 0", "Premier 1")]
    assert min(per) >= 1
    assert f["captain"] != f["vice_captain"]
    proj = server.fantasy_projections(simulations=500)["players"]
    assert len(proj) == 22 and proj[0]["mean"] >= proj[-1]["mean"] and {r["role"] for r in proj} <= {"BAT", "AR", "BOWL"}
    port = server.fantasy_portfolio(teams_count=3, simulations=1000)
    assert len(port["teams"]) == 3 and port["expected_best_of_portfolio"] >= port["teams"][0]["expected_points"] - 1


def test_call_tool_returns_json():
    out = call("list_matches")
    assert "m1" in json.dumps(out, default=str)
