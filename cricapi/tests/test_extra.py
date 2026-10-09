"""Every analytics, modelling and graphics endpoint answers with the documented shape."""
from test_api import ADMIN, h  # noqa: F401  (fixtures come from conftest / test_api)
from test_api import client, key  # noqa: F401


def get(client, key, path, **params):
    r = client.get(path, params=params, headers=h(key))
    assert r.status_code == 200, (path, r.text[:300])
    return r


def post(client, key, path, body):
    r = client.post(path, json=body, headers=h(key))
    assert r.status_code == 200, (path, r.text[:300])
    return r.json()


def test_catalog_counts(client, key):
    eps = client.get("/v1").json()["endpoints"]
    assert sum(len(v) for v in eps.values()) >= 50
    assert len(eps["Analytics"]) >= 20 and len(eps["Simulation & modelling"]) >= 18 and len(eps["Graphics"]) >= 10


def test_player_analytics(client, key, env):
    a, b = env["teams"][0]["players"], env["teams"][1]["players"]
    d = get(client, key, f"/v1/players/{a[0]}/phases").json()
    assert set(d["batting"]) == {"powerplay", "middle", "death"} and d["batting"]["middle"]["strike_rate"] > 0
    d = get(client, key, f"/v1/players/{a[0]}/vs-bowling").json()
    assert len(d["by_bowling_kind"]) == 6 and d["weakest_against"]
    d = get(client, key, f"/v1/players/{b[10]}/vs-batting-hand").json()
    assert [r["batting_hand"] for r in d["by_batting_hand"]] == ["right", "left"]
    d = get(client, key, f"/v1/players/{a[1]}/situations").json()
    assert len(d["at_the_crease"]) == 5 and len(d["chasing"]) == 7
    assert set(get(client, key, f"/v1/players/{a[2]}/formats").json()["formats"]) == {"T20", "OD"}
    assert get(client, key, f"/v1/players/{b[9]}/role").json()["bowling"]["overs_per_match"] > 0
    sim = get(client, key, f"/v1/players/{a[0]}/similar", limit=3, min_balls=50).json()["similar"]
    assert len(sim) == 3 and all(s["id"] != a[0] for s in sim)
    cmp = get(client, key, "/v1/players/compare", ids=f"{a[0]},{a[1]}").json()
    assert len(cmp["players"]) == 2
    assert client.get("/v1/players/compare", params={"ids": a[0]}, headers=h(key)).status_code == 422
    assert client.get("/v1/players/nobody/phases", headers=h(key)).status_code == 404


def test_rankings_matchups_places(client, key, env):
    a, b = env["teams"][0]["players"], env["teams"][1]["players"]
    bat = get(client, key, "/v1/rankings/batting", min_balls=50, limit=5).json()["players"]
    assert len(bat) == 5 and bat[0]["impact_per_120"] >= bat[-1]["impact_per_120"]
    bowl = get(client, key, "/v1/rankings/bowling", min_balls=50, limit=5, sort="economy").json()["players"]
    assert bowl[0]["economy"] <= bowl[-1]["economy"]
    grid = get(client, key, "/v1/matchups/grid", batters=",".join(a[:3]), bowlers=",".join(b[8:])).json()
    assert len(grid["cells"]) == 9
    ctr = get(client, key, "/v1/matchups/counter", batter=a[0], candidates=",".join(b[7:])).json()
    assert ctr["best_option"] and len(ctr["ranked"]) == 4
    vs = get(client, key, "/v1/venues", q="oval").json()["venues"]
    assert vs and get(client, key, f"/v1/venues/{vs[0]['id']}").json()["by_phase"]["death"]["runs_per_over"] > 0
    assert client.get("/v1/venues/nowhere", headers=h(key)).status_code == 404
    cs = get(client, key, "/v1/competitions").json()["competitions"]
    assert cs and get(client, key, f"/v1/competitions/{cs[0]['key']}").json()["scoring_index"]
    assert get(client, key, "/v1/trends/scoring").json()["seasons"]
    ts = get(client, key, "/v1/teams", q="premier").json()["teams"]
    t = get(client, key, f"/v1/teams/{ts[0]['id']}").json()
    assert len(t["last_xi"]) == 11 and t["profile"]["summary"]["bowling_depth"] >= 1
    prof = post(client, key, "/v1/teams/profile", {"players": a})
    assert len(prof["batting"]) == 11


def test_modelling(client, key, env):
    teams = env["teams"]
    base = {"teams": teams, "venue_id": "premier-oval", "n": 600}
    wp = post(client, key, "/v1/win-probability", {**base, "state": {"innings": 2, "batting": 1, "runs": 80,
                                                                     "wickets": 3, "overs": 10.2, "target": 170}})
    assert abs(sum(wp["win"].values()) - 1) < 0.01 and wp["required"]["runs"] == 90
    assert client.post("/v1/win-probability", json={**base, "state": {"innings": 2}}, headers=h(key)).status_code == 422
    pr = post(client, key, "/v1/innings/projection", {**base, "state": {"runs": 60, "wickets": 2, "overs": 8}})
    assert pr["final_total"]["q"]["50"] >= 60 and pr["expected_runs_by_over"][0]["over"] == 9
    par = post(client, key, "/v1/par-score", base)
    assert len(par["teams"]) == 2 and par["teams"][0]["par"] > 0
    ch = post(client, key, "/v1/chase-curve", {**base, "target_from": 140, "target_to": 180, "step": 20})
    assert [r["target"] for r in ch["curve"]] == [140, 160, 180]
    assert ch["curve"][0]["chase_success"] >= ch["curve"][-1]["chase_success"]
    toss = post(client, key, "/v1/toss", base)
    assert toss["teams"][0]["choose"] in ("bat", "bowl")
    cmpd = post(client, key, "/v1/scenarios/compare", {**base, "scenario": {"boundary_mult": 1.3}})
    t0 = teams[0]["name"]
    assert cmpd["change"]["median_score"][t0] > 0
    imp = post(client, key, f"/v1/players/{teams[0]['players'][0]}/impact", base)
    assert "win_added" in imp
    sw = post(client, key, "/v1/lineups/swap", {**base, "out_player": teams[0]["players"][0],
                                                "in_player": teams[1]["players"][0]})
    assert sw["team"] == t0
    order = post(client, key, "/v1/lineups/batting-order", {**base, "n": 300})
    assert len(order["candidates"]) >= 5 and order["best"]["win"] >= order["given"]["win"]
    plan = post(client, key, "/v1/lineups/bowling-plan", base)
    assert len(plan["plan"]) == 20 and all(b["overs"] <= 4 for b in plan["bowlers"])
    assert all(plan["plan"][i]["id"] != plan["plan"][i + 1]["id"] for i in range(19))
    fp = post(client, key, "/v1/fantasy/projections", base)
    assert len(fp["players"]) == 22
    ft = post(client, key, "/v1/fantasy/team", base)
    assert len(ft["xi"]) == 11 and ft["captain"]
    fo = post(client, key, "/v1/fantasy/portfolio", {**base, "teams_count": 3})
    assert len(fo["teams"]) == 3
    by_id = post(client, key, "/v1/toss", {"teams": [{"team_id": "premier-0"}, {"team_id": "premier-1"}], "n": 400})
    assert {t["team"] for t in by_id["teams"]} == {"Premier 0", "Premier 1"}


def test_covered_match_models(client, key):
    wp = get(client, key, "/v1/matches/m1/win-probability", innings=1, runs=50, wickets=1, overs=6, n=400).json()
    assert wp["state"]["runs"] == 50
    f = get(client, key, "/v1/matches/m1/fantasy", n=400).json()
    assert len(f["players"]) == 22 and len(f["team"]["xi"]) == 11
    assert client.get("/v1/matches/nope/fantasy", headers=h(key)).status_code == 404


def test_new_graphics(client, key, env):
    a, b = env["teams"][0]["players"], env["teams"][1]["players"]
    for path in ("/v1/graphics/matches/m1/worm.svg", "/v1/graphics/matches/m1/phases.svg",
                 "/v1/graphics/matches/m1/duels.svg", f"/v1/graphics/players/{a[0]}/profile.svg",
                 "/v1/graphics/venues/premier-oval.svg", "/v1/graphics/trends/scoring.svg"):
        r = get(client, key, path, theme="light")
        assert r.text.startswith("<svg") and r.headers["content-type"].startswith("image/svg")
    r = get(client, key, "/v1/graphics/matchups.svg", batter=a[0], bowler=b[10])
    assert "<svg" in r.text
