"""Supabase JWT validation for user-authenticated endpoints.

The API key endpoints (key creation, usage) require a logged-in user.
The user presents their Supabase session JWT in the Authorization header.
We validate it using the Supabase JWT secret (HS256).
"""
from __future__ import annotations

import os
import logging

import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

log = logging.getLogger(__name__)
_bearer = HTTPBearer(auto_error=False)


def _get_jwt_secret() -> str:
    secret = os.getenv("SUPABASE_JWT_SECRET", "")
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET env var is not set")
    return secret


async def require_user(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> str:
    """FastAPI dependency — validates Supabase JWT and returns user_id (UUID str)."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization: Bearer <token> header",
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            _get_jwt_secret(),
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase uses 'authenticated' audience
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise ValueError("No 'sub' claim in JWT")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except Exception as e:
        log.debug("JWT validation failed: %s", e)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
