"""Key management limits and the admin panel API."""
from __future__ import annotations

from conftest import make_jwt


def auth(user_id: str) -> dict:
    return {"Authorization": f"Bearer {make_jwt(user_id)}"}


def test_create_key_respects_plan_key_limit(client, fake_store):
    for _ in range(2):  # free: 2 keys
        r = client.post("/v1/user/keys", json={"label": "k"}, headers=auth("u1"))
        assert r.status_code == 201, r.text
        assert r.json()["raw_key"].startswith("cs_live_")
    r = client.post("/v1/user/keys", json={"label": "k"}, headers=auth("u1"))
    assert r.status_code == 422 and "allows 2 API keys" in r.json()["detail"]


def test_created_key_authenticates(client):
    raw = client.post("/v1/user/keys", json={"label": "k"}, headers=auth("u9")).json()["raw_key"]
    assert client.get("/v2/account", headers={"X-API-Key": raw}).status_code == 200


def test_admin_routes_reject_non_admins(client):
    assert client.get("/v1/admin/fixtures").status_code == 401
    assert client.get("/v1/admin/fixtures", headers=auth("nobody")).status_code == 403


FIXTURE = {"slug": "ipl-2026-m042", "match_date": "2026-04-20", "team1": "MI", "team2": "CSK", "format": "T20"}


def test_admin_creates_and_edits_fixture(client, fake_store):
    fake_store.admins.add("admin")
    h = auth("admin")
    r = client.post("/v1/admin/fixtures", json=FIXTURE, headers=h)
    assert r.status_code == 201, r.text
    fid = r.json()["upcoming_id"]
    assert client.post("/v1/admin/fixtures", json=FIXTURE, headers=h).status_code == 409
    r = client.patch(f"/v1/admin/fixtures/{fid}", json={"toss_winner": "MI", "toss_decision": "field"}, headers=h)
    assert r.status_code == 200 and r.json()["toss_winner"] == "MI"
    assert client.patch(f"/v1/admin/fixtures/{fid}", json={"toss_winner": "RCB"}, headers=h).status_code == 422
    assert client.get("/v1/admin/fixtures?status=scheduled", headers=h).json()[0]["slug"] == "ipl-2026-m042"
    assert client.delete(f"/v1/admin/fixtures/{fid}", headers=h).status_code == 204
    assert client.get(f"/v1/admin/fixtures/{fid}", headers=h).status_code == 404


def test_fixture_validation(client, fake_store):
    fake_store.admins.add("admin")
    h = auth("admin")
    assert client.post("/v1/admin/fixtures", json={**FIXTURE, "slug": "Bad Slug!"}, headers=h).status_code == 422
    assert client.post("/v1/admin/fixtures", json={**FIXTURE, "team2": "mi"}, headers=h).status_code == 422


def test_squad_validation_and_public_fixture(client, fake_store, new_key):
    fake_store.admins.add("admin")
    h = auth("admin")
    fid = client.post("/v1/admin/fixtures", json=FIXTURE, headers=h).json()["upcoming_id"]

    def player(pid, team, order=None, xi=True, confirmed=True):
        return {"player_id": pid, "team": team, "batting_order": order, "is_playing_xi": xi, "is_confirmed": confirmed}

    bad_team = {"players": [player(1, "RCB", 1)]}
    assert client.put(f"/v1/admin/fixtures/{fid}/squad", json=bad_team, headers=h).status_code == 422
    dup = {"players": [player(1, "MI", 1), player(1, "MI", 2)]}
    assert client.put(f"/v1/admin/fixtures/{fid}/squad", json=dup, headers=h).status_code == 422
    same_order = {"players": [player(1, "MI", 1), player(2, "MI", 1)]}
    assert client.put(f"/v1/admin/fixtures/{fid}/squad", json=same_order, headers=h).status_code == 422
    twelve = {"players": [player(i, "MI") for i in range(1, 13)]}
    assert client.put(f"/v1/admin/fixtures/{fid}/squad", json=twelve, headers=h).status_code == 422

    ok = {"players": [player(i, "MI", i) for i in range(1, 12)]
          + [player(100 + i, "CSK", i, confirmed=False) for i in range(1, 12)]
          + [player(200, "MI", xi=False)]}
    r = client.put(f"/v1/admin/fixtures/{fid}/squad", json=ok, headers=h)
    assert r.status_code == 200 and r.json()["xi"] == {"MI": 11, "CSK": 11}

    fake_store.public_ids[("player", "p-vk18")] = "1"
    raw = new_key()
    body = client.get("/v2/fixtures/ipl-2026-m042", headers={"X-API-Key": raw}).json()
    assert body["match_id"] == "ipl-2026-m042"
    assert body["squads"]["home"]["xi_status"] == "confirmed"
    assert body["squads"]["away"]["xi_status"] == "projected"
    assert body["squads"]["home"]["xi"][0]["player_id"] == "p-vk18"
    assert body["squads"]["home"]["bench"] == ["p-200"]
    assert client.get("/v2/fixtures/nope", headers={"X-API-Key": raw}).status_code == 404


def test_admin_sets_plan_and_it_applies_immediately(client, fake_store, new_key):
    fake_store.admins.add("admin")
    raw = new_key(user_id="cust")
    assert client.get("/v2/account", headers={"X-API-Key": raw}).json()["plan"] == "free"
    r = client.put("/v1/admin/users/cust/subscription", json={"plan_id": "enterprise"}, headers=auth("admin"))
    assert r.status_code == 200
    assert client.get("/v2/account", headers={"X-API-Key": raw}).json()["plan"] == "enterprise"
    assert client.put("/v1/admin/users/cust/subscription", json={"plan_id": "gold"},
                      headers=auth("admin")).status_code == 422


def test_revoked_key_stops_working_immediately(client, fake_store):
    created = client.post("/v1/user/keys", json={"label": "k"}, headers=auth("u5")).json()
    raw = created["raw_key"]
    assert client.get("/v2/account", headers={"X-API-Key": raw}).status_code == 200
    # revoke via the store (the route's ownership query uses Supabase directly)
    fake_store.keys.pop(created["key_id"])
    from cricveda_api.auth import clear_cache
    clear_cache()
    assert client.get("/v2/account", headers={"X-API-Key": raw}).status_code == 403
