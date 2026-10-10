"""Analytics, decision-model and graphics tools against the fixture kit and match."""
import pytest

from cricmcp import server
from cricmcp.data import DataError


def test_player_lookup_and_readouts():
    hits = server.search_players("P0-1")["players"]
    assert hits and hits[0]["id"] == "P0-1"
    assert server.player_rating("P0-1")["profile"]["batting"]["wicket"] > 0
    ph = server.player_phases("P0-1")
    assert set(ph["batting"]) == {"powerplay", "middle", "death"}
    assert server.player_vs_bowling("P0-1")["strongest_against"]
    assert len(server.bowler_vs_batting_hand("P1-9")["by_batting_hand"]) == 2
    assert server.player_situations("P0-1")["chasing"][0]["situation"] == "first_innings"
    assert set(server.player_formats("P0-1")["formats"]) == {"T20", "OD"}
    assert server.player_role("P1-9")["bowling"]["overs_per_match"] >= 0
    with pytest.raises(DataError):
        server.player_rating("Nobody At All")


def test_similar_compare_rankings():
    sim = server.similar_players("P0-1")
    assert sim["similar"] and all(0 < r["similarity"] <= 1 for r in sim["similar"])
    cmp = server.compare_players(["P0-1", "P1-1"])
    assert len(cmp["players"]) == 2
    r = server.rankings("batting", limit=5)
    assert [x["rank"] for x in r["players"]] == [1, 2, 3, 4, 5]
    imp = [x["impact_per_120"] for x in r["players"]]
    assert imp == sorted(imp, reverse=True)
    eco = [x["economy"] for x in server.rankings("bowling", sort="economy", limit=5)["players"]]
    assert eco == sorted(eco)


def test_matchups():
    mu = server.matchup("P0-1", "P1-9")
    assert abs(sum(mu["per_ball"].values()) - 1) < 1e-3 and mu["edge"]["wicket"] > 0
    grid = server.matchup_grid(["P0-1", "P0-2"], ["P1-9", "P1-10"])
    assert len(grid["cells"]) == 4
    c = server.best_bowler_against("P0-1", ["P1-9", "P1-10", "P1-11"])
    nets = [r["net_runs_per_over"] for r in c["ranked"]]
    assert nets == sorted(nets) and c["best_option"]


def test_venues_competitions_trends_teams():
    v = server.venues("premier")["venues"]
    assert v and server.venue_profile("Premier Oval")["character"]
    assert server.competitions()["competitions"]
    assert server.competition_profile("premier")["by_phase"]
    assert "seasons" in server.scoring_trend()
    assert server.teams("premier")["teams"]
    tp = server.team_profile("Premier 0")
    assert tp["team"] == "Premier 0" and len(tp["batting"]) == 11
    xi = [f"P0-{i}" for i in (0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11)]
    assert server.team_profile(players=xi)["summary"]["bowling_depth"] >= 1


def test_decision_models():
    par = server.par_score(simulations=600)
    assert len(par["teams"]) == 2 and par["teams"][0]["par"] > 50
    ch = server.chase_curve("Premier 1", target_from=120, target_to=200, step=40, simulations_per_target=200)
    succ = [r["chase_success"] for r in ch["curve"]]
    assert succ == sorted(succ, reverse=True)
    toss = server.toss_decision(simulations=1000)
    assert {t["choose"] for t in toss["teams"]} <= {"bat", "bowl"}
    bo = server.batting_order("Premier 0", simulations_per_order=300)
    assert bo["candidates"][0]["win"] >= bo["candidates"][-1]["win"]
    plan = server.bowling_plan("Premier 1")
    assert len(plan["plan"]) == 20
    per = {}
    for o in plan["plan"]:
        per[o["bowler"]] = per.get(o["bowler"], 0) + 1
    assert max(per.values()) <= 4
    assert all(a["bowler"] != b["bowler"] for a, b in zip(plan["plan"], plan["plan"][1:]))
    imp = server.player_impact("P0-0", simulations=500)
    assert imp["win_swing_points"] > 0
    proj = server.innings_projection("Premier 0", runs=80, wickets=2, overs=10.0, simulations=400)
    assert proj["final_total"]["q50"] > 80 and len(proj["expected_runs_by_over"]) == 10


def test_graphics(tmp_path, monkeypatch):
    monkeypatch.setenv("CRICSYNTHESIS_OUT", str(tmp_path))
    for card in ("win", "scores", "worm", "phases", "duels"):
        g = server.match_graphic(card)
        assert g["svg"].startswith("<svg") and g["saved_to"]
    assert server.match_graphic("wickets", team="Premier 1")["svg"].startswith("<svg")
    assert server.match_graphic("player", player="P0-1")["svg"].startswith("<svg")
    for kw in ({"card": "player", "player": "P0-1"}, {"card": "matchup", "player": "P0-1", "bowler": "P1-9"},
               {"card": "venue", "venue": "premier"}, {"card": "trend"}):
        assert server.analytics_graphic(**kw)["svg"].startswith("<svg")
    assert len(list(tmp_path.glob("*.svg"))) == 11


def test_graphics_copy_matches_api():
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    api = root / "cricapi" / "src" / "cricapi" / "graphics.py"
    if api.exists():
        assert (root / "cricmcp" / "src" / "cricmcp" / "graphics.py").read_text() == api.read_text()
