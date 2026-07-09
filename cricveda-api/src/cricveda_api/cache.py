"""Upstash Redis cache wrapper.

Falls back to a no-op cache if UPSTASH_REDIS_URL is not set,
so the API works locally without Redis configured.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

log = logging.getLogger(__name__)

_redis = None


def _get_redis():
    global _redis
    if _redis is None:
        url = os.getenv("UPSTASH_REDIS_URL")
        if not url:
            log.debug("UPSTASH_REDIS_URL not set — cache disabled")
            return None
        try:
            import redis as redis_lib
            _redis = redis_lib.from_url(url, decode_responses=True)
        except Exception as e:
            log.warning("Redis connection failed: %s — cache disabled", e)
    return _redis


def cache_get(key: str) -> Any | None:
    r = _get_redis()
    if r is None:
        return None
    try:
        raw = r.get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as e:
        log.warning("Cache get error for %r: %s", key, e)
        return None


def cache_set(key: str, value: Any, ttl_seconds: int = 3600) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        r.setex(key, ttl_seconds, json.dumps(value))
    except Exception as e:
        log.warning("Cache set error for %r: %s", key, e)


def cache_key(*parts: Any) -> str:
    return ":".join(str(p) for p in parts)
