"""MatchSynth v2 endpoints."""
from __future__ import annotations

import numpy as np
import pytest

from cricveda_core.matchsynth.ball_model import FORMATS, K, N_PRESSURE, BallModel

BASE = np.array([0.36, 0.36, 0.07, 0.005, 0.11, 0.045, 0.045, 0.005])
ROLES = ["BAT"] * 5 + ["AR", "AR"] + ["BOWL"] * 4


@pytest.fixture(autouse=True)
def model():
    from cricveda_api import matchsynth_model
    from cricveda_api.routes import simulate_v2
    ctx = {f: np.broadcast_to(BASE / BASE.sum(), (2, o, 10, K)).copy() for f, o in FORMATS.items()}
    m = BallModel(context=ctx, chase=np.ones((N_PRESSURE, K)), version="sim-test")
    star = np.ones(K); star[[4, 5]] = 2.0; star[6] = 0.5
    m.batter = {100: star}
    matchsynth_model.set_ball_model(m)
    simulate_v2.clear_cache()
    yield m
    matchsynth_model.set_ball_model(None)


def _seed(store, confirmed=True, n_away=11):
    store.fixtures[1] = {"upcoming_id": 1, "slug": "ipl-2026-m042", "team1": "MI", "team2": "CSK",
                         "format": "T20", "status": "scheduled", "updated_at": "2026-10-06T09:00:00+00:00"}
    rows = []
    for t, team in enumerate(("MI", "CSK")):
        for i, role in enumerate(ROLES[: (11 if team == "MI" else n_away)]):
            rows.append({"player_id": 100 * (t + 1) + i, "team": team, "batting_order": i + 1,
                         "is_playing_xi": True, "is_confirmed": confirmed,
                         "player_meta": {"primary_role": role,
                                         "bowling_style": "left-arm-fast" if i % 2 else "right-arm-off-break"}})
    store.sim_squads[1] = rows
    store.public_ids[("player", "p-vk18")] = "100"


def pro(new_key):
    return {"X-API-Key": new_key(user_id="pro-user", plan="pro")}


def test_free_plan_cannot_simulate(client, fake_store, new_key):
    _seed(fake_store)
    r = client.post("/v2/simulate/match", json={"match_id": "ipl-2026-m042"}, headers={"X-API-Key": new_key()})
    assert r.status_code == 403 and "matchsynth" in r.json()["detail"]


def test_match_simulation_matches_published_shape(client, fake_store, new_key):
    _seed(fake_store)
    r = client.post("/v2/simulate/match", headers=pro(new_key), json={
        "match_id": "ipl-2026-m042", "iterations": 2000, "xi": {"home": "confirmed", "away": "projected"},
        "toss": "home_bowl"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["iterations"] == 2000 and b["toss"] == "home_bowl"
    assert set(b["win_probability"]) == {"MI", "CSK"}
    assert b["win_probability"]["MI"] > b["win_probability"]["CSK"]        # MI has the star batter
    assert b["first_innings"]["batting"] == "CSK"
    assert set(b["first_innings"]["total"]) == {"p10", "median", "p90"}
    assert b["pressure_phase"].startswith("overs_")
    assert isinstance(b["opposition_weakness"], list)
    assert b["model_version"] == "sim-test"


def test_stored_simulation_is_served_when_fresh(client, fake_store, new_key):
    _seed(fake_store)
    stored = {"iterations": 10000, "win_probability": {"MI": 0.58, "CSK": 0.42}, "marker": "stored"}
    fake_store.simulations[(1, "")] = {"upcoming_id": 1, "toss_key": "", "model_version": "sim-test",
                                       "generated_at": "2026-10-06T10:00:00+00:00", "result": stored}
    h = pro(new_key)
    b = client.post("/v2/simulate/match", headers=h, json={"match_id": "ipl-2026-m042"}).json()
    assert b["marker"] == "stored" and b["win_probability"] == {"MI": 0.58, "CSK": 0.42}
    # squad edited after the stored run → simulate live instead
    fake_store.fixtures[1]["updated_at"] = "2026-10-06T11:00:00Z"
    b = client.post("/v2/simulate/match", headers=h, json={"match_id": "ipl-2026-m042", "iterations": 1000}).json()
    assert "marker" not in b


def test_confirmed_xi_requirement_and_incomplete_xi(client, fake_store, new_key):
    _seed(fake_store, confirmed=False)
    h = pro(new_key)
    r = client.post("/v2/simulate/match", headers=h, json={"match_id": "ipl-2026-m042", "xi": {"home": "confirmed"}})
    assert r.status_code == 409
    _seed(fake_store, n_away=9)
    r = client.post("/v2/simulate/match", headers=h, json={"match_id": "ipl-2026-m042", "iterations": 1000})
    assert r.status_code == 409 and "isn't complete" in r.json()["detail"]


def test_scenario(client, fake_store, new_key):
    _seed(fake_store)
    h = pro(new_key)
    r = client.post("/v2/simulate/scenario", headers=h, json={
        "match_id": "ipl-2026-m042", "innings": 2, "batting": "home", "runs": 150, "wickets": 2,
        "overs": "16.0", "first_innings_total": 165, "bowler_overs": {"p-207": 4}, "exclude_bowlers": ["p-208"],
        "iterations": 2000})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["batting"] == "MI" and b["win_probability"]["MI"] > 0.6
    assert b["projected_total"]["median"] >= 150
    bad = client.post("/v2/simulate/scenario", headers=h, json={
        "match_id": "ipl-2026-m042", "innings": 1, "batting": "home", "runs": 10, "wickets": 0, "overs": "3.7"})
    assert bad.status_code == 422
    no_target = client.post("/v2/simulate/scenario", headers=h, json={
        "match_id": "ipl-2026-m042", "innings": 2, "batting": "home", "runs": 10, "wickets": 0, "overs": "2",
        "iterations": 1000})
    assert no_target.status_code == 422 and "first_innings_total" in no_target.json()["detail"]


def test_opposition_and_auction(client, fake_store, new_key):
    _seed(fake_store)
    h = pro(new_key)
    r = client.post("/v2/simulate/opposition", headers=h, json={"match_id": "ipl-2026-m042", "team": "away"})
    assert r.status_code == 200 and r.json()["team"] == "CSK"
    r = client.post("/v2/simulate/auction", headers=h, json={"match_id": "ipl-2026-m042", "player_id": "p-vk18",
                                                           "iterations": 4000})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["player_id"] == "p-vk18" and b["win_probability_added"] > 0
    assert b["estimated_value_cr"] is None            # no ₹/win calibration configured


def test_model_unavailable_is_503(client, fake_store, new_key, monkeypatch):
    from cricveda_api import matchsynth_model
    matchsynth_model.set_ball_model(None)
    monkeypatch.setattr(matchsynth_model, "_LOCAL", matchsynth_model.Path("/nonexistent/m.npz"))
    monkeypatch.setattr(matchsynth_model, "_TMP", matchsynth_model.Path("/nonexistent/t.npz"))
    monkeypatch.setattr(matchsynth_model, "_download", lambda: (_ for _ in ()).throw(RuntimeError("no storage")))
    _seed(fake_store)
    r = client.post("/v2/simulate/match", headers=pro(new_key), json={"match_id": "ipl-2026-m042", "iterations": 1000})
    assert r.status_code == 503
