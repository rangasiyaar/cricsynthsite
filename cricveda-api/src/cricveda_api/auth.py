"""API key authentication, subscription entitlements and daily quotas.

One key per account works for every product the account's plan includes
(see `plans` in supabase/platform_v2.sql). Send it as either header:

    X-API-Key: cs_live_...
    Authorization: cs_live_...          (or "Bearer cs_live_...")

New keys are random 256-bit tokens stored as SHA-256, so lookup is one
indexed query. Keys created before that are bcrypt hashes; they are still
accepted and upgraded to SHA-256 the first time they are used.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, Request, Response, Security, status
from fastapi.security import APIKeyHeader

from cricveda_api import store

log = logging.getLogger(__name__)
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_authorization_header = APIKeyHeader(name="Authorization", auto_error=False)

KEY_PREFIX = "cs_live_"
# Prefixes shown in product docs; all resolve to the same account key.
ACCEPTED_PREFIXES = ("cs_live_", "cv_live_", "ms_live_", "gs_live_")
PRODUCTS = ("cricveda", "matchsynth", "graphsynth")
FREE_PLAN = {"plan_id": "free", "name": "Free", "daily_limit": 100, "max_keys": 2, "products": ["cricveda"]}
_ACCOUNT_TTL_SECONDS = 60


@dataclass
class ApiPrincipal:
    """Who is calling and what their plan allows. Returned by `require_api_key`."""
    key_id: str
    user_id: str | None
    plan_id: str
    products: list[str] = field(default_factory=list)
    daily_limit: int = 100
    used_today: int = 0

    @property
    def remaining_today(self) -> int:
        return max(0, self.daily_limit - self.used_today)


# ── Hashing ──────────────────────────────────────────────────────────────────

def sha256_hex(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


def hash_key(raw_key: str) -> str:
    """Legacy bcrypt hash (kept for compatibility with old rows and tooling)."""
    return bcrypt.hashpw(raw_key.encode(), bcrypt.gensalt()).decode()


def verify_key(raw_key: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw_key.encode(), hashed.encode())
    except ValueError:
        return False


def _display_prefix(raw_key: str) -> str:
    return raw_key[:12]


# ── Key + account lookup (cached briefly in-process) ─────────────────────────

_account_cache: dict[str, tuple[float, dict]] = {}


def clear_cache() -> None:
    _account_cache.clear()


def _resolve_key(raw_key: str) -> dict | None:
    """Return {key_id, user_id} for a raw key, or None if it is not valid."""
    sha = sha256_hex(raw_key)
    row = store.find_key_by_sha256(sha)
    if row:
        return row
    # Legacy bcrypt keys: check only rows that have not been upgraded yet.
    for legacy in store.list_legacy_keys():
        if verify_key(raw_key, legacy["key_hash"]):
            try:
                store.upgrade_legacy_key(legacy["key_id"], sha, _display_prefix(raw_key))
            except Exception as e:  # upgrade is an optimisation; never fail the request
                log.warning("Could not upgrade legacy key %s: %s", legacy["key_id"], e)
            return {"key_id": legacy["key_id"], "user_id": legacy.get("user_id")}
    return None


def _free_plan() -> dict:
    """The `free` row from the plans table (editable), or built-in defaults."""
    try:
        return store.get_plan("free") or FREE_PLAN
    except Exception as e:
        log.warning("Could not load free plan: %s", e)
        return FREE_PLAN


def plan_for_user(user_id: str | None) -> dict:
    """The user's active plan, falling back to Free."""
    if not user_id:
        return _free_plan()
    sub = store.get_subscription(user_id)
    if not sub or sub.get("status") != "active":
        return _free_plan()
    end = sub.get("current_period_end")
    if end:
        try:
            if datetime.fromisoformat(str(end).replace("Z", "+00:00")) < datetime.now(timezone.utc):
                return _free_plan()
        except ValueError:
            pass
    return store.get_plan(sub["plan_id"]) or _free_plan()


def _lookup_account(raw_key: str) -> dict | None:
    sha = sha256_hex(raw_key)
    hit = _account_cache.get(sha)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    key = _resolve_key(raw_key)
    if not key:
        return None
    plan = plan_for_user(key.get("user_id"))
    account = {
        "key_id": key["key_id"],
        "user_id": key.get("user_id"),
        "plan_id": plan["plan_id"],
        "products": list(plan["products"]),
        "daily_limit": int(plan["daily_limit"]),
    }
    _account_cache[sha] = (time.monotonic() + _ACCOUNT_TTL_SECONDS, account)
    return account


# ── Quota ────────────────────────────────────────────────────────────────────

def _seconds_until_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((tomorrow - now).total_seconds()))


def _rate_headers(limit: int, used: int) -> dict[str, str]:
    reset_epoch = int(time.time()) + _seconds_until_utc_midnight()
    return {
        "X-RateLimit-Limit": str(limit),
        "X-RateLimit-Remaining": str(max(0, limit - used)),
        "X-RateLimit-Reset": str(reset_epoch),
    }


def _count_request(account: dict) -> int:
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        if account["user_id"]:
            return store.increment_usage(account["key_id"], account["user_id"], today)
        return store.increment_key_usage(account["key_id"], today)
    except Exception as e:
        # Usage storage being down should not take the API down with it.
        log.warning("Usage counter unavailable: %s", e)
        return 0


def _extract_key(x_api_key: str | None, authorization: str | None) -> str | None:
    if x_api_key:
        return x_api_key.strip()
    if authorization:
        value = authorization.strip()
        if value.lower().startswith("bearer "):
            value = value[7:].strip()
        # A Supabase JWT (three dot-separated parts) is not an API key.
        if value and value.count(".") != 2:
            return value
    return None


def _authorize(request: Request, response: Response, x_api_key: str | None,
               authorization: str | None, product: str | None) -> ApiPrincipal:
    raw_key = _extract_key(x_api_key, authorization)
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Send it in the X-API-Key or Authorization header.",
        )

    account = _lookup_account(raw_key)
    if not account:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    # Check the plan before counting, so refused calls don't use up the quota.
    if product and product not in account["products"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your {account['plan_id']} plan does not include {product}. "
                   "Upgrade your subscription to use this API.",
        )

    used = _count_request(account)
    headers = _rate_headers(account["daily_limit"], used)
    if used > account["daily_limit"]:
        headers["Retry-After"] = str(_seconds_until_utc_midnight())
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily limit of {account['daily_limit']} requests reached for the "
                   f"{account['plan_id']} plan. Resets at 00:00 UTC.",
            headers=headers,
        )
    for k, v in headers.items():
        response.headers[k] = v

    principal = ApiPrincipal(used_today=used, **account)
    request.state.principal = principal
    return principal


async def require_api_key(
    request: Request,
    response: Response,
    x_api_key: str | None = Security(_api_key_header),
    authorization: str | None = Security(_authorization_header),
) -> ApiPrincipal:
    """Validate the key and count the request against the plan's daily limit."""
    return _authorize(request, response, x_api_key, authorization, product=None)


def require_product(product: str):
    """Dependency factory: a valid key whose plan includes `product`."""
    if product not in PRODUCTS:
        raise ValueError(f"Unknown product {product!r}")

    async def _check(
        request: Request,
        response: Response,
        x_api_key: str | None = Security(_api_key_header),
        authorization: str | None = Security(_authorization_header),
    ) -> ApiPrincipal:
        return _authorize(request, response, x_api_key, authorization, product=product)

    return _check


# ── Key creation ─────────────────────────────────────────────────────────────

def generate_raw_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def create_api_key(label: str, user_id: str | None = None) -> tuple[str, dict]:
    """Generate a key, store only its SHA-256, return (raw_key, stored_row)."""
    raw_key = generate_raw_key()
    row: dict = {
        "key_sha256": sha256_hex(raw_key),
        "key_prefix": _display_prefix(raw_key),
        "label": label,
    }
    if user_id:
        row["user_id"] = user_id
    return raw_key, store.insert_key(row)


# Every /v1 analytics endpoint is part of CricVeda.
require_cricveda = require_product("cricveda")
