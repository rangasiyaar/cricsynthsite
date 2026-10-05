"""Data access for accounts, keys, usage and fixtures.

Every Supabase call the platform layer makes goes through here, so tests can
swap in an in-memory store (see tests/conftest.py) without a live database.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client():
    from cricveda_ingest.db import get_client
    return get_client()


# ── Keys ─────────────────────────────────────────────────────────────────────

def find_key_by_sha256(sha: str) -> dict | None:
    rows = _client().table("api_keys").select("key_id, user_id").eq("key_sha256", sha).limit(1).execute()
    return rows.data[0] if rows.data else None


def list_legacy_keys() -> list[dict]:
    """bcrypt-hashed keys created before SHA-256 lookup existed."""
    rows = (
        _client().table("api_keys")
        .select("key_id, user_id, key_hash")
        .is_("key_sha256", "null")
        .execute()
    )
    return [r for r in rows.data if r.get("key_hash")]


def upgrade_legacy_key(key_id: str, sha: str, prefix: str) -> None:
    _client().table("api_keys").update({"key_sha256": sha, "key_prefix": prefix}).eq("key_id", key_id).execute()


def insert_key(row: dict) -> dict:
    return _client().table("api_keys").insert(row).execute().data[0]


def count_user_keys(user_id: str) -> int:
    res = _client().table("api_keys").select("key_id", count="exact").eq("user_id", user_id).execute()
    return res.count if res.count is not None else len(res.data)


# ── Accounts & plans ─────────────────────────────────────────────────────────

def get_plan(plan_id: str) -> dict | None:
    rows = _client().table("plans").select("*").eq("plan_id", plan_id).limit(1).execute()
    return rows.data[0] if rows.data else None


def list_plans() -> list[dict]:
    return _client().table("plans").select("*").order("sort_order").execute().data


def get_subscription(user_id: str) -> dict | None:
    rows = _client().table("subscriptions").select("*").eq("user_id", user_id).limit(1).execute()
    return rows.data[0] if rows.data else None


def set_subscription(user_id: str, plan_id: str, status: str = "active",
                     current_period_end: str | None = None) -> dict:
    row = {"user_id": user_id, "plan_id": plan_id, "status": status,
           "current_period_end": current_period_end, "updated_at": _now()}
    return _client().table("subscriptions").upsert(row, on_conflict="user_id").execute().data[0]


def is_admin(user_id: str) -> bool:
    rows = _client().table("user_profiles").select("is_admin").eq("user_id", user_id).limit(1).execute()
    return bool(rows.data and rows.data[0].get("is_admin"))


def list_users(query: str | None = None, limit: int = 50) -> list[dict]:
    q = _client().table("user_profiles").select("user_id, email, display_name, is_admin, created_at")
    if query:
        q = q.ilike("email", f"%{query}%")
    users = q.order("created_at", desc=True).limit(limit).execute().data
    if not users:
        return []
    subs = (
        _client().table("subscriptions").select("user_id, plan_id, status, current_period_end")
        .in_("user_id", [u["user_id"] for u in users]).execute().data
    )
    by_user = {s["user_id"]: s for s in subs}
    for u in users:
        s = by_user.get(u["user_id"])
        u["plan_id"] = s["plan_id"] if s else "free"
        u["subscription_status"] = s["status"] if s else "active"
        u["current_period_end"] = s.get("current_period_end") if s else None
    return users


# ── Usage ────────────────────────────────────────────────────────────────────

def increment_usage(key_id: str, user_id: str, day: str) -> int:
    """Atomically count one request; returns the account's total for `day`."""
    res = _client().rpc("increment_usage", {"p_key_id": key_id, "p_user_id": user_id, "p_date": day}).execute()
    return int(res.data)


def increment_key_usage(key_id: str, day: str) -> int:
    res = _client().rpc("increment_key_usage", {"p_key_id": key_id, "p_date": day}).execute()
    return int(res.data)


# ── Fixtures & squads (admin panel) ──────────────────────────────────────────

FIXTURE_FIELDS = (
    "upcoming_id, slug, league_id, match_date, start_time, team1, team2, venue_id, "
    "format, toss_winner, toss_decision, status, updated_at"
)


def list_fixtures(status: str | None = None, limit: int = 200) -> list[dict]:
    q = _client().table("upcoming_matches").select(FIXTURE_FIELDS)
    if status:
        q = q.eq("status", status)
    return q.order("match_date").limit(limit).execute().data


def get_fixture(upcoming_id: int) -> dict | None:
    rows = _client().table("upcoming_matches").select(FIXTURE_FIELDS).eq("upcoming_id", upcoming_id).limit(1).execute()
    return rows.data[0] if rows.data else None


def create_fixture(row: dict) -> dict:
    return _client().table("upcoming_matches").insert(row).execute().data[0]


def update_fixture(upcoming_id: int, changes: dict) -> dict | None:
    changes = {**changes, "updated_at": _now()}
    rows = _client().table("upcoming_matches").update(changes).eq("upcoming_id", upcoming_id).execute().data
    return rows[0] if rows else None


def delete_fixture(upcoming_id: int) -> None:
    c = _client()
    c.table("squad_selections").delete().eq("upcoming_id", upcoming_id).execute()
    c.table("upcoming_matches").delete().eq("upcoming_id", upcoming_id).execute()


def get_squad(upcoming_id: int) -> list[dict]:
    return (
        _client().table("squad_selections")
        .select("player_id, team, batting_order, is_playing_xi, is_confirmed, credits, player_meta(name, primary_role)")
        .eq("upcoming_id", upcoming_id)
        .order("team").order("batting_order")
        .execute().data
    )


def replace_squad(upcoming_id: int, rows: list[dict[str, Any]]) -> None:
    c = _client()
    c.table("squad_selections").delete().eq("upcoming_id", upcoming_id).execute()
    if rows:
        c.table("squad_selections").insert([{**r, "upcoming_id": upcoming_id} for r in rows]).execute()


def search_players(query: str, limit: int = 20) -> list[dict]:
    return (
        _client().table("player_meta")
        .select("player_id, name, primary_role, batting_hand, bowling_style")
        .ilike("name", f"%{query}%")
        .limit(limit).execute().data
    )


def search_venues(query: str, limit: int = 20) -> list[dict]:
    return (
        _client().table("venues").select("venue_id, name, city, country")
        .ilike("name", f"%{query}%").limit(limit).execute().data
    )


def list_leagues() -> list[dict]:
    return _client().table("leagues").select("league_id, name, format").order("league_id").execute().data


# ── Public IDs (readable slugs used by /v2) ──────────────────────────────────

def resolve_public_id(entity_type: str, slug: str) -> str | None:
    rows = (
        _client().table("public_ids").select("internal_id")
        .eq("entity_type", entity_type).eq("slug", slug).limit(1).execute()
    )
    return rows.data[0]["internal_id"] if rows.data else None


def public_ids_for(entity_type: str, internal_ids: list[str]) -> dict[str, str]:
    if not internal_ids:
        return {}
    rows = (
        _client().table("public_ids").select("slug, internal_id")
        .eq("entity_type", entity_type).in_("internal_id", internal_ids).execute()
    )
    return {r["internal_id"]: r["slug"] for r in rows.data}


def get_fixture_by_slug(slug: str) -> dict | None:
    rows = _client().table("upcoming_matches").select(FIXTURE_FIELDS).eq("slug", slug).limit(1).execute()
    return rows.data[0] if rows.data else None
