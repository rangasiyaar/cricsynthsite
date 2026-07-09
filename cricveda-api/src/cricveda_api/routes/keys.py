"""User key management and usage endpoints.

These endpoints require a Supabase session JWT (Authorization: Bearer <token>),
NOT an API key. They allow logged-in users to create, list, and revoke their keys.

GET    /v1/user/keys              → list user's keys
POST   /v1/user/keys              → create a new key (raw key returned ONCE)
DELETE /v1/user/keys/{key_id}     → revoke a key
GET    /v1/user/usage             → daily usage stats for last 30 days
GET    /v1/user/profile           → current user profile
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from cricveda_api.auth import create_api_key, hash_key
from cricveda_api.deps import limiter
from cricveda_api.jwt_auth import require_user

log = logging.getLogger(__name__)
router = APIRouter()


# ── Response models ──────────────────────────────────────────────────────────

class ApiKeyInfo(BaseModel):
    key_id: str
    label: str | None
    daily_limit: int
    created_at: str
    last_used_at: str | None
    requests_today: int = 0


class NewKeyResponse(BaseModel):
    key_id: str
    label: str | None
    raw_key: str          # shown ONCE — user must copy it now
    daily_limit: int
    created_at: str


class UsageDay(BaseModel):
    date: str
    request_count: int
    key_id: str
    key_label: str | None


class UsageResponse(BaseModel):
    total_today: int
    total_this_month: int
    daily: list[UsageDay]


class UserProfile(BaseModel):
    user_id: str
    email: str | None
    display_name: str | None
    avatar_url: str | None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get(
    "/user/profile",
    response_model=UserProfile,
    summary="Current user profile",
    tags=["Keys"],
)
@limiter.limit("30/minute")
async def get_profile(
    request: Request,
    user_id: str = Depends(require_user),
):
    from cricveda_ingest.db import get_client
    client = get_client()
    row = client.table("user_profiles").select("*").eq("user_id", user_id).execute()
    if not row.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    p = row.data[0]
    return UserProfile(
        user_id=user_id,
        email=p.get("email"),
        display_name=p.get("display_name"),
        avatar_url=p.get("avatar_url"),
    )


@router.get(
    "/user/keys",
    response_model=list[ApiKeyInfo],
    summary="List your API keys",
    description="Returns all API keys belonging to the authenticated user. Raw keys are never returned here.",
    tags=["Keys"],
)
@limiter.limit("30/minute")
async def list_keys(
    request: Request,
    user_id: str = Depends(require_user),
):
    from cricveda_ingest.db import get_client
    client = get_client()

    keys = (
        client.table("api_keys")
        .select("key_id, label, daily_limit, created_at, last_used_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    today = date.today().isoformat()
    usage_today = (
        client.table("usage_daily")
        .select("key_id, request_count")
        .eq("user_id", user_id)
        .eq("date", today)
        .execute()
    )
    usage_map = {r["key_id"]: r["request_count"] for r in usage_today.data}

    return [
        ApiKeyInfo(
            key_id=k["key_id"],
            label=k.get("label"),
            daily_limit=k["daily_limit"],
            created_at=k["created_at"],
            last_used_at=k.get("last_used_at"),
            requests_today=usage_map.get(k["key_id"], 0),
        )
        for k in keys.data
    ]


@router.post(
    "/user/keys",
    response_model=NewKeyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new API key",
    description=(
        "Creates a new API key for the authenticated user. "
        "The raw key is returned **once** — store it securely. "
        "Maximum 5 keys per user."
    ),
    tags=["Keys"],
)
@limiter.limit("10/minute")
async def create_key(
    request: Request,
    body: dict,
    user_id: str = Depends(require_user),
):
    from cricveda_ingest.db import get_client
    client = get_client()

    # Enforce max 5 keys per user
    existing = (
        client.table("api_keys")
        .select("key_id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )
    if (existing.count or len(existing.data)) >= 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Maximum 5 API keys per user. Revoke an existing key first.",
        )

    label = str(body.get("label", "My API Key"))[:64]
    raw_key, key_id = create_api_key(label=label, user_id=user_id)

    # Fetch the created row for timestamps
    row = client.table("api_keys").select("*").eq("key_id", key_id).execute()
    k = row.data[0]

    return NewKeyResponse(
        key_id=key_id,
        label=k.get("label"),
        raw_key=raw_key,
        daily_limit=k["daily_limit"],
        created_at=k["created_at"],
    )


@router.delete(
    "/user/keys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an API key",
    description="Permanently deletes an API key. All future requests using this key will return 403.",
    tags=["Keys"],
)
@limiter.limit("10/minute")
async def revoke_key(
    request: Request,
    key_id: str,
    user_id: str = Depends(require_user),
):
    from cricveda_ingest.db import get_client
    client = get_client()

    # Verify ownership
    existing = (
        client.table("api_keys")
        .select("key_id")
        .eq("key_id", key_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")

    client.table("api_keys").delete().eq("key_id", key_id).execute()


@router.get(
    "/user/usage",
    response_model=UsageResponse,
    summary="Usage analytics",
    description="Daily request counts for all your keys over the last 30 days.",
    tags=["Keys"],
)
@limiter.limit("30/minute")
async def get_usage(
    request: Request,
    days: int = 30,
    user_id: str = Depends(require_user),
):
    days = max(1, min(days, 90))
    since = (date.today() - timedelta(days=days)).isoformat()

    from cricveda_ingest.db import get_client
    client = get_client()

    rows = (
        client.table("usage_daily")
        .select("key_id, date, request_count, api_keys(label)")
        .eq("user_id", user_id)
        .gte("date", since)
        .order("date", desc=True)
        .execute()
    )

    today = date.today().isoformat()
    month_start = date.today().replace(day=1).isoformat()
    total_today = sum(r["request_count"] for r in rows.data if r["date"] == today)
    total_month = sum(r["request_count"] for r in rows.data if r["date"] >= month_start)

    daily = [
        UsageDay(
            date=r["date"],
            request_count=r["request_count"],
            key_id=r["key_id"],
            key_label=(r.get("api_keys") or {}).get("label"),
        )
        for r in rows.data
    ]

    return UsageResponse(
        total_today=total_today,
        total_this_month=total_month,
        daily=daily,
    )
