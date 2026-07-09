"""API key authentication middleware.

Keys are stored as bcrypt hashes in the `api_keys` table.
Pass the raw key in the `X-API-Key` request header.
"""
from __future__ import annotations

import logging
from datetime import date, timezone, datetime

import bcrypt
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

log = logging.getLogger(__name__)
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def hash_key(raw_key: str) -> str:
    return bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt()).decode()


def verify_key(raw_key: str, hashed: str) -> bool:
    return bcrypt.checkpw(raw_key.encode(), hashed.encode())


def _log_usage(key_id: str, user_id: str | None) -> None:
    """Increment usage_daily counter and update last_used_at. Best-effort — never fails requests."""
    try:
        from cricveda_ingest.db import get_client
        client = get_client()
        today = date.today().isoformat()
        now = datetime.now(timezone.utc).isoformat()

        # Upsert daily usage row
        if user_id:
            client.table("usage_daily").upsert(
                {"key_id": key_id, "user_id": user_id, "date": today, "request_count": 1},
                on_conflict="key_id,date",
            ).execute()

        # Update last_used_at on the key row
        client.table("api_keys").update({"last_used_at": now}).eq("key_id", key_id).execute()
    except Exception as e:
        log.debug("Usage logging error: %s", e)


async def require_api_key(raw_key: str = Security(_api_key_header)) -> str:
    """FastAPI dependency — validates X-API-Key, logs usage, returns key_id."""
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header",
        )

    from cricveda_ingest.db import get_client
    client = get_client()

    rows = client.table("api_keys").select("key_id, key_hash, daily_limit, user_id").execute()

    for row in rows.data:
        if verify_key(raw_key, row["key_hash"]):
            key_id = row["key_id"]
            user_id = row.get("user_id")
            _log_usage(key_id, user_id)
            return key_id

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Invalid API key",
    )


def create_api_key(
    label: str,
    daily_limit: int = 100,
    user_id: str | None = None,
) -> tuple[str, str]:
    """Generate a new API key, store its hash, return (raw_key, key_id)."""
    import secrets
    from cricveda_ingest.db import get_client

    raw_key = secrets.token_urlsafe(32)
    hashed = hash_key(raw_key)

    client = get_client()
    row: dict = {"key_hash": hashed, "label": label, "daily_limit": daily_limit}
    if user_id:
        row["user_id"] = user_id
    result = client.table("api_keys").insert(row).execute()
    key_id = result.data[0]["key_id"]
    return raw_key, key_id
