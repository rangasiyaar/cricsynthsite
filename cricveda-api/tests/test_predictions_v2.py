"""CricVeda v2 prediction endpoints."""
from __future__ import annotations

ROLES = ["BAT", "BAT", "BAT", "WK", "AR", "AR", "BOWL", "BOWL", "BOWL", "BOWL", "BOWL"]


def _row(pid, team, role, pos=0, cond=True, confirmed=True, p50=40.0):
    metric = {"BAT": "runs", "WK": "runs", "BOWL": "wickets"}.get(role, "fantasy_points")
    return {
        "upcoming_id": 1, "player_id": pid, "batting_position": pos, "include_conditions": cond,
        "team": team, "role": role, "metric": metric,
        "runs_p10": 18.0, "runs_p50": 44.0 - pos, "runs_p90": 78.0,
        "wickets_p10": 0.0, "wickets_p50": 2.0, "wickets_p90": 4.0,
        "points_p10": p50 - 25, "points_p50": p50, "points_p90": p50 + 40,
        "form_score": 0.87, "form_trend": "rising", "composite_score": round(p50 / 100, 2),
        "tier": "S" if p50 >= 80 else "B", "captain_value": 0.91 if p50 >= 80 else 0.05,
        "confidence": 0.91 if confirmed else 0.84, "xi_status": "confirmed" if confirmed else "projected",
        "model_version": "20261006", "generated_at": "2026-10-06T10:00:00+00:00",
    }


def _seed(store, confirmed_away=False):
    store.fixtures[1] = {"upcoming_id": 1, "slug": "ipl-2026-m042", "team1": "MI", "team2": "CSK",
                         "match_date": "2026-04-20", "format": "T20", "status": "scheduled"}
    for t, team in enumerate(("MI", "CSK")):
        for i, role in enumerate(ROLES):
            pid = 100 * (t + 1) + i
            confirmed = team == "MI" or confirmed_away
            store.predictions.append(_row(pid, team, role, confirmed=confirmed, p50=90.0 if pid == 100 else 30.0 + i))
            store.predictions.append(_row(pid, team, role, cond=False, confirmed=confirmed))
            if role in ("BAT", "WK", "AR"):
                for pos in range(1, 8):
                    store.predictions.append(_row(pid, team, role, pos=pos, confirmed=confirmed))
            store.players[pid] = {"player_id": pid, "name": f"Player {pid}", "primary_role": role}
            store.credits[pid] = 9.0
    store.players[100]["name"] = "Virat Kohli"
    store.public_ids[("player", "p-vk18")] = "100"


def _post(client, key, body):
    return client.post("/v2/predictions/player", json=body, headers={"X-API-Key": key})


def test_player_prediction_matches_published_shape(client, fake_store, new_key):
    _seed(fake_store)
    r = _post(client, new_key(), {"match_id": "ipl-2026-m042", "player_id": "p-vk18",
                                  "context": {"xi_confirmed": True, "include_conditions": True}})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["request_id"] == r.headers["X-Request-ID"]
    assert b["player"] == {"id": "p-vk18", "name": "Virat Kohli", "role": "BAT"}
    assert b["form"] == {"score": 0.87, "trend": "rising"}
    assert b["prediction"]["runs"] == {"p10": 18.0, "median": 44.0, "p90": 78.0}
    assert b["prediction"]["confidence"] == 0.91
    assert set(b["performance"]) == {"tier", "composite_score", "captain_value"}
    assert b["performance"]["tier"] == "S"
    assert b["context"]["xi_status"] == "confirmed"


def test_bowler_gets_whole_number_wickets(client, fake_store, new_key):
    _seed(fake_store)
    b = _post(client, new_key(), {"match_id": "ipl-2026-m042", "player_id": "p-106"}).json()
    assert b["player"]["role"] == "BOWL"
    assert b["prediction"]["wickets"] == {"p10": 0, "median": 2, "p90": 4}
    assert "fantasy_points" in b["prediction"]


def test_batting_position_what_if(client, fake_store, new_key):
    _seed(fake_store)
    key = new_key()
    b = _post(client, key, {"match_id": "ipl-2026-m042", "player_id": "p-vk18", "context": {"batting_position": 3}}).json()
    assert b["prediction"]["runs"]["median"] == 41.0 and b["context"]["batting_position"] == 3
    r = _post(client, key, {"match_id": "ipl-2026-m042", "player_id": "p-106", "context": {"batting_position": 3}})
    assert r.status_code == 422 and "omit batting_position" in r.json()["detail"]
    r = _post(client, key, {"match_id": "ipl-2026-m042", "player_id": "p-vk18", "context": {"batting_position": 9}})
    assert r.status_code == 422


def test_unconfirmed_xi_rule(client, fake_store, new_key):
    _seed(fake_store)
    key = new_key()
    body = {"match_id": "ipl-2026-m042", "player_id": "p-200"}  # CSK, projected
    assert _post(client, key, body).json()["context"]["xi_status"] == "projected"
    r = _post(client, key, {**body, "context": {"xi_confirmed": True}})
    assert r.status_code == 409


def test_not_found_and_not_ready(client, fake_store, new_key):
    key = new_key(plan="pro")
    assert _post(client, key, {"match_id": "nope", "player_id": "p-1"}).status_code == 404
    fake_store.fixtures[1] = {"upcoming_id": 1, "slug": "ipl-2026-m042", "team1": "MI", "team2": "CSK"}
    r = _post(client, key, {"match_id": "ipl-2026-m042", "player_id": "p-1"})
    assert r.status_code == 404 and "aren't ready yet" in r.json()["detail"]
    _seed(fake_store)
    r = _post(client, key, {"match_id": "ipl-2026-m042", "player_id": "p-555"})
    assert r.status_code == 404 and "isn't in either XI" in r.json()["detail"]
    assert _post(client, key, {"match_id": "ipl-2026-m042", "player_id": "virat"}).status_code == 404


def test_match_predictions_sorted_by_composite(client, fake_store, new_key):
    _seed(fake_store)
    r = client.get("/v2/predictions/match/ipl-2026-m042", headers={"X-API-Key": new_key()})
    assert r.status_code == 200
    b = r.json()
    assert len(b["players"]) == 22 and b["teams"] == {"home": "MI", "away": "CSK"}
    scores = [p["performance"]["composite_score"] for p in b["players"]]
    assert scores == sorted(scores, reverse=True)
    assert b["players"][0]["player"]["id"] == "p-vk18" and b["players"][0]["team"] == "MI"


def test_recommended_xi(client, fake_store, new_key):
    _seed(fake_store)
    r = client.post("/v2/predictions/xi", json={"match_id": "ipl-2026-m042"}, headers={"X-API-Key": new_key()})
    assert r.status_code == 200, r.text
    b = r.json()
    assert len(b["xi"]) == 11 and b["captain"] == "p-vk18"
    assert b["credits_used"] <= 100
    teams = [p["team"] for p in b["xi"]]
    assert max(teams.count("MI"), teams.count("CSK")) <= 7
    r = client.post("/v2/predictions/xi", json={"match_id": "ipl-2026-m042", "credit_limit": 50},
                    headers={"X-API-Key": new_key(user_id="u2")})
    assert r.status_code == 422


def test_predictions_require_cricveda_key(client, fake_store):
    _seed(fake_store)
    assert client.post("/v2/predictions/player", json={"match_id": "ipl-2026-m042", "player_id": "p-vk18"}).status_code == 401
