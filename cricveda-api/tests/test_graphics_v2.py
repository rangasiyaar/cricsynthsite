"""GraphSynth v2 endpoints."""
from __future__ import annotations

import base64
import xml.etree.ElementTree as ET

from conftest import make_jwt
from test_simulate_v2 import _seed, model  # noqa: F401  (autouse model fixture)


def ent(new_key, user="ent-user"):
    return {"X-API-Key": new_key(user_id=user, plan="enterprise")}


def push(client, h, **state):
    body = {"match_id": "ipl-2026-m042", "innings": 1, "batting": "home", "runs": 50, "wickets": 1, "overs": "6", **state}
    return client.post("/v2/graphics/state", headers=h, json=body)


def test_pro_plan_cannot_use_graphsynth(client, fake_store, new_key):
    _seed(fake_store)
    r = client.get("/v2/graphics/win-probability?match_id=ipl-2026-m042",
                   headers={"X-API-Key": new_key(user_id="p", plan="pro")})
    assert r.status_code == 403 and "graphsynth" in r.json()["detail"]


def test_customer_feed_drives_worm_and_stays_private(client, fake_store, new_key):
    _seed(fake_store)
    h = ent(new_key)
    for overs, runs, wkts in (("2", 14, 0), ("6", 50, 1), ("10", 82, 2)):
        r = push(client, h, overs=overs, runs=runs, wickets=wkts)
        assert r.status_code == 201, r.text
        assert r.json()["visible_to"] == "your account only"
    r = client.get("/v2/graphics/win-probability?match_id=ipl-2026-m042&format=svg", headers=h)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["graphic"] == "win_probability_worm" and b["format"] == "svg" and b["source"] == "your feed"
    assert len(b["series"]) == 3 and all(0 <= v <= 1 for v in b["series"])
    assert set(b["projection"]) == {"score", "band"}
    ET.fromstring(b["image"])
    # another enterprise customer doesn't see this feed
    other = ent(new_key, "someone-else")
    r = client.get("/v2/graphics/win-probability?match_id=ipl-2026-m042", headers=other)
    assert r.status_code == 404


def test_correction_for_same_ball_replaces_snapshot(client, fake_store, new_key):
    _seed(fake_store)
    h = ent(new_key)
    push(client, h, overs="6", runs=50)
    push(client, h, overs="6", runs=48)
    snaps = [s for s in fake_store.snapshots if s["scope"] == "user:ent-user"]
    assert len(snaps) == 1 and snaps[0]["runs"] == 48


def test_pre_match_falls_back_to_stored_simulation(client, fake_store, new_key):
    _seed(fake_store)
    fake_store.simulations[(1, "")] = {"result": {"win_probability": {"MI": 0.58, "CSK": 0.42}}}
    b = client.get("/v2/graphics/win-probability?match_id=ipl-2026-m042", headers=ent(new_key)).json()
    assert b["source"] == "pre-match simulation" and b["series"] == [0.58]


def test_raw_svg_and_png(client, fake_store, new_key):
    _seed(fake_store)
    h = ent(new_key)
    push(client, h, innings=2, runs=120, wickets=3, overs="15", first_innings_total=170)
    r = client.get("/v2/graphics/score-projection?match_id=ipl-2026-m042&format=svg&raw=true&theme=transparent", headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg+xml")
    assert "TARGET 171" in r.text
    r = client.get("/v2/graphics/score-projection?match_id=ipl-2026-m042&format=png&raw=true&width=640&height=360", headers=h)
    assert r.headers["content-type"] == "image/png" and r.content[:4] == b"\x89PNG"
    b = client.get("/v2/graphics/score-projection?match_id=ipl-2026-m042&format=png&width=640&height=360", headers=h).json()
    assert b["image"].startswith("data:image/png;base64,")
    assert base64.b64decode(b["image"].split(",", 1)[1])[:4] == b"\x89PNG"
    assert b["score"] == {"runs": 120, "wickets": 3, "overs": "15"} and b["target"] == 171


def test_bad_inputs(client, fake_store, new_key):
    _seed(fake_store)
    h = ent(new_key)
    assert push(client, h, overs="6.7").status_code == 422
    assert push(client, h, innings=2).status_code == 422                    # no first_innings_total
    r = client.get("/v2/graphics/win-probability?match_id=ipl-2026-m042&home_color=red", headers=h)
    assert r.status_code == 422 and "hex colour" in r.json()["detail"]
    assert client.get("/v2/graphics/score-projection?match_id=ipl-2026-m042&theme=neon", headers=h).status_code == 422


def test_historical_graphics(client, fake_store, new_key):
    fake_store.hist_matches[1001] = {"match_id": 1001, "match_date": "2024-04-01", "team1": "MI", "team2": "CSK",
                                     "toss_winner": "CSK", "toss_decision": "field", "leagues": {"format": "T20"}}
    fake_store.hist_deliveries[1001] = [
        {"innings": inn, "over_ball": o + b / 10, "runs_total": (o + b) % 5, "wicket_type": "caught" if b == 6 and o % 4 == 0 else None}
        for inn in (1, 2) for o in range(20) for b in range(1, 7)]
    h = ent(new_key)
    for g in ("manhattan", "worm", "phases"):
        r = client.get(f"/v2/graphics/{g}?match_id=m-1001&format=svg", headers=h)
        assert r.status_code == 200, (g, r.text)
        ET.fromstring(r.json()["image"])
    b = client.get("/v2/graphics/manhattan?match_id=m-1001", headers=h).json()
    assert [i["team"] for i in b["innings"]] == ["MI", "CSK"] and len(b["innings"][0]["runs"]) == 20
    assert client.get("/v2/graphics/manhattan?match_id=ipl-2026-m042", headers=h).status_code == 422
    assert client.get("/v2/graphics/manhattan?match_id=m-9", headers=h).status_code == 404


def test_player_form(client, fake_store, new_key):
    fake_store.public_ids[("player", "p-vk18")] = "100"
    fake_store.players[100] = {"player_id": 100, "name": "Virat Kohli", "primary_role": "BAT"}
    fake_store.points[100] = [{"match_id": i, "match_date": f"2026-04-{i:02d}", "total_points": 10 * i} for i in range(1, 13)]
    b = client.get("/v2/graphics/player-form?player_id=p-vk18&last=5&format=svg", headers=ent(new_key)).json()
    assert b["name"] == "Virat Kohli" and [m["points"] for m in b["matches"]] == [80.0, 90.0, 100.0, 110.0, 120.0]


def test_admin_scoring_is_public(client, fake_store, new_key):
    _seed(fake_store)
    fake_store.admins.add("admin")
    admin = {"Authorization": f"Bearer {make_jwt('admin')}"}
    r = client.post("/v1/admin/fixtures/1/live", headers=admin,
                    json={"innings": 1, "batting": "away", "runs": 40, "wickets": 0, "overs": "5"})
    assert r.status_code == 201, r.text
    b = client.get("/v2/graphics/win-probability?match_id=ipl-2026-m042", headers=ent(new_key)).json()
    assert b["source"] == "public" and len(b["series"]) == 1
    assert client.delete("/v1/admin/fixtures/1/live", headers=admin).status_code == 204
    assert client.get("/v1/admin/fixtures/1/live", headers=admin).json() == []
