import pytest
from fastapi.testclient import TestClient

from cricapi.main import Settings, create_app

ADMIN = "admin-secret"


@pytest.fixture(scope="module")
def client(env):
    t = env["tmp"]
    app = create_app(Settings(model_dir=t / "model", publish_dir=t / "publish", coverage_dir=t / "coverage",
                              patterns_file=t / "patterns" / "report.json", keys_file=t / "keys.json", admin_key=ADMIN))
    return TestClient(app)


@pytest.fixture(scope="module")
def key(client):
    r = client.post("/admin/keys", params={"owner": "fan@example.com", "plan": "pro"}, headers={"X-Admin-Key": ADMIN})
    assert r.status_code == 200
    return r.json()["key"]


def h(key):
    return {"X-API-Key": key}


def test_public_and_auth(client, key):
    assert client.get("/health").json() == {"ok": True}
    assert "simulation" in client.get("/v1").json()["endpoints"]
    assert client.get("/v1/matches").status_code == 401
    assert client.get("/v1/matches", headers={"X-API-Key": "cs_live_nope"}).status_code == 401
    assert client.get("/v1/matches", headers={"Authorization": f"Bearer {key}"}).status_code == 200
    assert client.post("/admin/keys", params={"owner": "x"}).status_code == 403
    assert client.post("/admin/keys", params={"owner": "x"}, headers={"X-Admin-Key": "wrong"}).status_code == 403


def test_matches_and_graphics(client, key):
    cards = client.get("/v1/matches", headers=h(key)).json()["matches"]
    assert cards and cards[0]["id"] == "m1"
    doc = client.get("/v1/matches/m1", headers=h(key)).json()
    assert doc["summary"]["result"]["win"] and doc["insights"]
    assert client.get("/v1/matches/m1/pack", headers=h(key)).json()["rules"]["overs"] == 20
    assert client.get("/v1/matches/../../etc", headers=h(key)).status_code == 404
    for path in ("win.svg", "scores.svg", "wickets/1.svg"):
        r = client.get(f"/v1/graphics/matches/m1/{path}", headers=h(key))
        assert r.status_code == 200 and r.text.startswith("<svg") and r.headers["content-type"].startswith("image/svg")
    pid = doc["summary"]["teams"][0]["players"][0]["id"]
    assert client.get(f"/v1/graphics/matches/m1/players/{pid}.svg", headers=h(key)).status_code == 200
    assert client.get("/v1/graphics/matches/m1/players/nobody.svg", headers=h(key)).status_code == 404


def test_simulate_with_scenario_and_conditions(client, key, env):
    body = {"format": "T20", "teams": env["teams"], "venue_id": "premier-oval", "n": 1500,
            "scenario": {"boundary_mult": 1.2, "dew": 0.5},
            "conditions": [{"type": "team_score", "team": 0, "at_least": 160}]}
    r = client.post("/v1/simulate", json=body, headers=h(key))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["meta"]["simulations"] == 1500 and out["meta"]["scenario"]["boundary_mult"] == 1.2
    cond = out["conditional"]
    assert 0 < cond["share_of_simulations"] < 1
    t0 = env["teams"][0]["name"]
    if cond["summary"]:
        assert cond["summary"]["result"]["win"][t0] > out["result"]["win"][t0]
    bad = {**body, "teams": [{"name": "x", "players": ["a"] * 10}, env["teams"][1]]}
    assert client.post("/v1/simulate", json=bad, headers=h(key)).status_code == 422


def test_analytics(client, key, env):
    pid = env["teams"][0]["players"][0]
    found = client.get("/v1/players", params={"q": pid[:2]}, headers=h(key)).json()["players"]
    assert any(p["id"] == pid for p in found)
    prof = client.get(f"/v1/players/{pid}", headers=h(key)).json()
    assert prof["known"] and "batting" in prof["profile"]
    assert client.get("/v1/players/nobody", headers=h(key)).status_code == 404
    proj = client.post(f"/v1/players/{pid}/projection", json={"n": 500}, headers=h(key)).json()
    assert proj["batting"]["runs"]["mean"] > 0
    mu = client.get("/v1/matchups", params={"batter": pid, "bowler": env["teams"][1]["players"][8]},
                    headers=h(key)).json()
    assert 0 < mu["matchup"]["dismissal_per_ball"] < 0.3 and abs(sum(mu["per_ball"].values()) - 1) < 0.01
    assert client.get("/v1/patterns", headers=h(key)).status_code == 200


def test_admin_coverage_flow(client, key, env):
    doc = {"title": "Premier 0 v Premier 1 (2)", "date": "2026-10-21", "format": "T20", "gender": "male",
           "teams": env["teams"]}
    a = {"X-Admin-Key": ADMIN}
    assert client.put("/admin/coverage/m2", json=doc, headers=a).status_code == 200
    assert client.put("/admin/coverage/m3", json={**doc, "teams": doc["teams"][:1]}, headers=a).status_code == 422
    card = client.post("/admin/coverage/m2/publish", params={"n": 1000}, headers=a).json()
    assert card["id"] == "m2"
    ids = [m["id"] for m in client.get("/v1/matches", headers=h(key)).json()["matches"]]
    assert ids == ["m1", "m2"]
    assert client.get("/admin/players", params={"q": "P0"}, headers=a).json()["players"]
    assert client.get("/admin/players", params={"q": "P0"}).status_code == 403
    assert client.delete("/admin/coverage/m2", headers=a).status_code == 200
    assert client.get("/v1/matches/m2", headers=h(key)).status_code == 404


def test_free_plan_limits(client):
    k = client.post("/admin/keys", params={"owner": "f@x.com", "plan": "free"}, headers={"X-Admin-Key": ADMIN}).json()["key"]
    app_state = client.app.state.cs
    rec = app_state.keys.lookup(k)
    for _ in range(199):
        app_state.usage.hit(rec["hash"])
    assert client.get("/v1/matches", headers=h(k)).status_code == 200      # 200th request
    assert client.get("/v1/matches", headers=h(k)).status_code == 429
