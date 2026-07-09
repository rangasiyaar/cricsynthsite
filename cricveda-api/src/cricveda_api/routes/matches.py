"""GET /v1/matches/upcoming — list scheduled upcoming matches."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from cricveda_api.auth import require_api_key
from cricveda_api.cache import cache_get, cache_key, cache_set
from cricveda_api.deps import limiter

router = APIRouter()


class UpcomingMatch(BaseModel):
    upcoming_id: int
    league_id: str
    match_date: str
    team1: str
    team2: str
    venue_id: int | None
    format: str
    status: str
    toss_winner: str | None = None
    toss_decision: str | None = None


@router.get(
    "/matches/upcoming",
    response_model=list[UpcomingMatch],
    summary="List upcoming fixtures",
    description=(
        "Returns scheduled T20 and ODI fixtures ordered by match date. "
        "Results are cached for **5 minutes**. "
        "Use `league_id` to filter by competition (e.g. `ipl`, `t20i`, `odi`, `bbl`)."
    ),
)
@limiter.limit("60/minute")
async def get_upcoming_matches(
    request: Request,
    league_id: str | None = Query(None, description="League ID — e.g. `ipl`, `t20i`, `odi`, `bbl`, `psl`"),
    format: str | None = Query(None, description="Match format: `T20` or `ODI`"),
    limit: int = Query(20, ge=1, le=100, description="Max results to return (default 20)"),
    _key_id: str = Depends(require_api_key),
):
    """List scheduled upcoming fixtures."""
    ck = cache_key("upcoming_matches", league_id, format, limit)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    query = (
        client.table("upcoming_matches")
        .select("*")
        .eq("status", "scheduled")
        .order("match_date")
        .limit(limit)
    )
    if league_id:
        query = query.eq("league_id", league_id)
    if format:
        query = query.eq("format", format)

    rows = query.execute().data
    cache_set(ck, rows, ttl_seconds=300)
    return rows
