"""Test fixtures: an in-memory stand-in for the Supabase-backed store."""
from __future__ import annotations

import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient

JWT_SECRET = "test-secret-at-least-32-bytes-long-xx"

PLANS = {
    "free": {"plan_id": "free", "name": "Free", "daily_limit": 3, "max_keys": 2, "products": ["cricveda"]},
    "pro": {"plan_id": "pro", "name": "Pro", "daily_limit": 50, "max_keys": 5, "products": ["cricveda", "matchsynth"]},
    "enterprise": {"plan_id": "enterprise", "name": "Enterprise", "daily_limit": 1000, "max_keys": 10,
                   "products": ["cricveda", "matchsynth", "graphsynth"]},
}


class FakeStore:
    def __init__(self):
        self.keys: dict[str, dict] = {}
        self.subs: dict[str, dict] = {}
        self.admins: set[str] = set()
        self.usage: dict[tuple[str, str], int] = {}
        self.fixtures: dict[int, dict] = {}
        self.squads: dict[int, list[dict]] = {}
        self.public_ids: dict[tuple[str, str], str] = {}
        self.predictions: list[dict] = []
        self.players: dict[int, dict] = {}
        self.credits: dict[int, float] = {}
        self.calls = {"list_legacy_keys": 0}

    # keys
    def find_key_by_sha256(self, sha):
        for k in self.keys.values():
            if k.get("key_sha256") == sha:
                return {"key_id": k["key_id"], "user_id": k.get("user_id")}
        return None

    def list_legacy_keys(self):
        self.calls["list_legacy_keys"] += 1
        return [dict(k) for k in self.keys.values() if not k.get("key_sha256") and k.get("key_hash")]

    def upgrade_legacy_key(self, key_id, sha, prefix):
        self.keys[key_id].update(key_sha256=sha, key_prefix=prefix)

    def insert_key(self, row):
        key_id = str(uuid.uuid4())
        stored = {**row, "key_id": key_id, "created_at": "2026-10-05T00:00:00+00:00"}
        self.keys[key_id] = stored
        return dict(stored)

    def count_user_keys(self, user_id):
        return sum(1 for k in self.keys.values() if k.get("user_id") == user_id)

    # plans
    def get_plan(self, plan_id):
        return PLANS.get(plan_id)

    def list_plans(self):
        return list(PLANS.values())

    def get_subscription(self, user_id):
        return self.subs.get(user_id)

    def set_subscription(self, user_id, plan_id, status="active", current_period_end=None):
        self.subs[user_id] = {"user_id": user_id, "plan_id": plan_id, "status": status,
                              "current_period_end": current_period_end}
        return self.subs[user_id]

    def is_admin(self, user_id):
        return user_id in self.admins

    def list_users(self, query=None, limit=50):
        return []

    # usage
    def increment_usage(self, key_id, user_id, day):
        self.usage[(key_id, day)] = self.usage.get((key_id, day), 0) + 1
        user_keys = {k["key_id"] for k in self.keys.values() if k.get("user_id") == user_id}
        return sum(v for (k, d), v in self.usage.items() if d == day and k in user_keys)

    def increment_key_usage(self, key_id, day):
        self.usage[(key_id, day)] = self.usage.get((key_id, day), 0) + 1
        return self.usage[(key_id, day)]

    # fixtures
    def list_fixtures(self, status=None, limit=200):
        return [f for f in self.fixtures.values() if status is None or f["status"] == status]

    def get_fixture(self, upcoming_id):
        return self.fixtures.get(upcoming_id)

    def get_fixture_by_slug(self, slug):
        return next((f for f in self.fixtures.values() if f.get("slug") == slug), None)

    def create_fixture(self, row):
        if any(f.get("slug") == row["slug"] for f in self.fixtures.values()):
            raise Exception("duplicate key value violates unique constraint")
        upcoming_id = len(self.fixtures) + 1
        self.fixtures[upcoming_id] = {**row, "upcoming_id": upcoming_id}
        return self.fixtures[upcoming_id]

    def update_fixture(self, upcoming_id, changes):
        self.fixtures[upcoming_id].update(changes)
        return self.fixtures[upcoming_id]

    def delete_fixture(self, upcoming_id):
        self.fixtures.pop(upcoming_id, None)
        self.squads.pop(upcoming_id, None)

    def get_squad(self, upcoming_id):
        return [
            {**p, "player_meta": {"name": f"Player {p['player_id']}", "primary_role": "BAT"}}
            for p in self.squads.get(upcoming_id, [])
        ]

    def replace_squad(self, upcoming_id, rows):
        self.squads[upcoming_id] = rows

    def search_players(self, q, limit=20):
        return [{"player_id": 1, "name": "Virat Kohli"}]

    def search_venues(self, q, limit=20):
        return []

    def list_leagues(self):
        return []

    def public_ids_for(self, entity_type, internal_ids):
        return {i: s for (e, s), i in self.public_ids.items() if e == entity_type and i in internal_ids}

    def get_player_prediction(self, upcoming_id, player_id, batting_position, include_conditions):
        return next((dict(r) for r in self.predictions if r["upcoming_id"] == upcoming_id
                     and r["player_id"] == player_id and r["batting_position"] == batting_position
                     and r["include_conditions"] == include_conditions), None)

    def list_match_predictions(self, upcoming_id, include_conditions=True):
        return [dict(r) for r in self.predictions if r["upcoming_id"] == upcoming_id
                and r["batting_position"] == 0 and r["include_conditions"] == include_conditions]

    def player_names(self, player_ids):
        return {p: self.players[p] for p in player_ids if p in self.players}

    def squad_credits(self, upcoming_id):
        return dict(self.credits)

    def resolve_public_id(self, entity_type, slug):
        return self.public_ids.get((entity_type, slug))


@pytest.fixture
def fake_store(monkeypatch):
    from cricveda_api import auth, store
    fake = FakeStore()
    for name in dir(fake):
        if not name.startswith("_") and callable(getattr(fake, name)) and hasattr(store, name):
            monkeypatch.setattr(store, name, getattr(fake, name))
    auth.clear_cache()
    yield fake
    auth.clear_cache()


@pytest.fixture
def app(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", JWT_SECRET)
    from cricveda_api.deps import limiter
    from cricveda_api.main import app as fastapi_app
    limiter.reset()
    return fastapi_app


@pytest.fixture
def client(app, fake_store):
    return TestClient(app)


def make_jwt(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "aud": "authenticated", "exp": int(time.time()) + 3600},
                      JWT_SECRET, algorithm="HS256")


@pytest.fixture
def new_key(fake_store):
    """Create a key for a user (optionally on a plan); returns the raw key."""
    from cricveda_api.auth import create_api_key

    def _make(user_id: str | None = "user-1", plan: str | None = None) -> str:
        if plan and user_id:
            fake_store.set_subscription(user_id, plan)
        raw, _row = create_api_key("test", user_id=user_id)
        return raw

    return _make
