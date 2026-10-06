"""Admin endpoints — fixtures, squads and subscription tiers.

Require a Supabase session JWT for a user whose `user_profiles.is_admin` is TRUE.
Used by the admin panel in cricveda-web (/admin).

GET    /v1/admin/fixtures                     list fixtures (?status=scheduled)
POST   /v1/admin/fixtures                     create a fixture
GET    /v1/admin/fixtures/{id}                one fixture with its squad
PATCH  /v1/admin/fixtures/{id}                edit (toss, status, teams, time …)
DELETE /v1/admin/fixtures/{id}                delete fixture and its squad
PUT    /v1/admin/fixtures/{id}/squad          replace both teams' squads
GET    /v1/admin/players?q=                   player search for the squad picker
GET    /v1/admin/venues?q=                    venue search
GET    /v1/admin/leagues                      leagues
GET    /v1/admin/plans                        subscription tiers
GET    /v1/admin/users?q=                     users with their plan
PUT    /v1/admin/users/{user_id}/subscription set a user's plan
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator

from cricveda_api import store
from cricveda_api.auth import clear_cache
from cricveda_api.deps import limiter
from cricveda_api.jwt_auth import require_user

router = APIRouter(prefix="/admin", tags=["Admin"])

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


async def require_admin(user_id: str = Depends(require_user)) -> str:
    if not store.is_admin(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user_id


# ── Models ───────────────────────────────────────────────────────────────────

class FixtureIn(BaseModel):
    slug: str = Field(..., description="Public match ID, e.g. ipl-2026-m042")
    league_id: str | None = None
    match_date: date
    start_time: datetime | None = None
    team1: str = Field(..., min_length=1, max_length=80)
    team2: str = Field(..., min_length=1, max_length=80)
    venue_id: int | None = None
    format: Literal["T20", "ODI", "Test"] = "T20"
    toss_winner: str | None = None
    toss_decision: Literal["bat", "field"] | None = None
    status: Literal["scheduled", "completed", "cancelled"] = "scheduled"

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not _SLUG_RE.match(v):
            raise ValueError("slug must be lowercase letters, digits and single hyphens, e.g. ipl-2026-m042")
        return v

    @model_validator(mode="after")
    def _teams(self):
        if self.team1.strip().lower() == self.team2.strip().lower():
            raise ValueError("team1 and team2 must be different")
        if self.toss_winner and self.toss_winner not in (self.team1, self.team2):
            raise ValueError("toss_winner must be team1 or team2")
        return self


class FixturePatch(BaseModel):
    slug: str | None = None
    league_id: str | None = None
    match_date: date | None = None
    start_time: datetime | None = None
    team1: str | None = None
    team2: str | None = None
    venue_id: int | None = None
    format: Literal["T20", "ODI", "Test"] | None = None
    toss_winner: str | None = None
    toss_decision: Literal["bat", "field"] | None = None
    status: Literal["scheduled", "completed", "cancelled"] | None = None

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().lower()
        if not _SLUG_RE.match(v):
            raise ValueError("slug must be lowercase letters, digits and single hyphens")
        return v


class SquadPlayer(BaseModel):
    player_id: int
    team: str
    batting_order: int | None = Field(None, ge=1, le=11)
    is_playing_xi: bool = True
    is_confirmed: bool = False


class SquadIn(BaseModel):
    players: list[SquadPlayer] = Field(..., max_length=60)


class SubscriptionIn(BaseModel):
    plan_id: str
    status: Literal["active", "past_due", "cancelled"] = "active"
    current_period_end: datetime | None = None


def _jsonable(model: BaseModel, *, exclude_unset: bool = False) -> dict:
    return model.model_dump(mode="json", exclude_unset=exclude_unset)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@router.get("/fixtures", summary="List fixtures")
@limiter.limit("60/minute")
async def list_fixtures(
    request: Request,
    status_filter: Literal["scheduled", "completed", "cancelled"] | None = Query(None, alias="status"),
    _admin: str = Depends(require_admin)):
    return store.list_fixtures(status=status_filter)


@router.post("/fixtures", status_code=status.HTTP_201_CREATED, summary="Create a fixture")
@limiter.limit("30/minute")
async def create_fixture(request: Request, body: FixtureIn, _admin: str = Depends(require_admin)):
    try:
        return store.create_fixture(_jsonable(body))
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Fixture slug '{body.slug}' already exists")
        raise


@router.get("/fixtures/{upcoming_id}", summary="One fixture with its squad")
@limiter.limit("60/minute")
async def get_fixture(request: Request, upcoming_id: int, _admin: str = Depends(require_admin)):
    fx = store.get_fixture(upcoming_id)
    if not fx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found")
    return {**fx, "squad": store.get_squad(upcoming_id)}


@router.patch("/fixtures/{upcoming_id}", summary="Edit a fixture")
@limiter.limit("30/minute")
async def update_fixture(request: Request, upcoming_id: int, body: FixturePatch, _admin: str = Depends(require_admin)):
    current = store.get_fixture(upcoming_id)
    if not current:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found")
    changes = _jsonable(body, exclude_unset=True)
    team1 = changes.get("team1", current["team1"])
    team2 = changes.get("team2", current["team2"])
    toss = changes.get("toss_winner", current.get("toss_winner"))
    if team1.strip().lower() == team2.strip().lower():
        raise HTTPException(status_code=422, detail="team1 and team2 must be different")
    if toss and toss not in (team1, team2):
        raise HTTPException(status_code=422, detail="toss_winner must be team1 or team2")
    return store.update_fixture(upcoming_id, changes)


@router.delete("/fixtures/{upcoming_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a fixture")
@limiter.limit("30/minute")
async def delete_fixture(request: Request, upcoming_id: int, _admin: str = Depends(require_admin)):
    if not store.get_fixture(upcoming_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found")
    store.delete_fixture(upcoming_id)


@router.put("/fixtures/{upcoming_id}/squad", summary="Replace the fixture's squads")
@limiter.limit("30/minute")
async def put_squad(request: Request, upcoming_id: int, body: SquadIn, _admin: str = Depends(require_admin)):
    fx = store.get_fixture(upcoming_id)
    if not fx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found")
    teams = {fx["team1"], fx["team2"]}
    seen: set[int] = set()
    xi_count = {t: 0 for t in teams}
    orders: dict[str, set[int]] = {t: set() for t in teams}
    for p in body.players:
        if p.team not in teams:
            raise HTTPException(status_code=422, detail=f"Player {p.player_id}: team must be {fx['team1']} or {fx['team2']}")
        if p.player_id in seen:
            raise HTTPException(status_code=422, detail=f"Player {p.player_id} is listed twice")
        seen.add(p.player_id)
        if p.is_playing_xi:
            xi_count[p.team] += 1
            if p.batting_order is not None:
                if p.batting_order in orders[p.team]:
                    raise HTTPException(status_code=422, detail=f"{p.team}: batting position {p.batting_order} used twice")
                orders[p.team].add(p.batting_order)
    for team, n in xi_count.items():
        if n > 11:
            raise HTTPException(status_code=422, detail=f"{team} has {n} players in the XI (max 11)")
    store.replace_squad(upcoming_id, [_jsonable(p) for p in body.players])
    return {"upcoming_id": upcoming_id, "players": len(body.players), "xi": xi_count}


# ── Lookups ──────────────────────────────────────────────────────────────────

@router.get("/players", summary="Search players")
@limiter.limit("120/minute")
async def search_players(request: Request, q: str, _admin: str = Depends(require_admin)):
    if len(q.strip()) < 2:
        return []
    return store.search_players(q.strip())


@router.get("/venues", summary="Search venues")
@limiter.limit("120/minute")
async def search_venues(request: Request, q: str = "", _admin: str = Depends(require_admin)):
    return store.search_venues(q.strip())


@router.get("/leagues", summary="Leagues")
@limiter.limit("60/minute")
async def list_leagues(request: Request, _admin: str = Depends(require_admin)):
    return store.list_leagues()


# ── Subscriptions ────────────────────────────────────────────────────────────

@router.get("/plans", summary="Subscription tiers")
@limiter.limit("60/minute")
async def list_plans(request: Request, _admin: str = Depends(require_admin)):
    return store.list_plans()


@router.get("/users", summary="Users and their plans")
@limiter.limit("60/minute")
async def list_users(request: Request, q: str | None = None, _admin: str = Depends(require_admin)):
    return store.list_users(q.strip() if q else None)


@router.put("/users/{user_id}/subscription", summary="Set a user's plan")
@limiter.limit("30/minute")
async def set_subscription(request: Request, user_id: str, body: SubscriptionIn, _admin: str = Depends(require_admin)):
    if not store.get_plan(body.plan_id):
        raise HTTPException(status_code=422, detail=f"Unknown plan '{body.plan_id}'")
    row = store.set_subscription(
        user_id, body.plan_id, body.status,
        body.current_period_end.isoformat() if body.current_period_end else None,
    )
    clear_cache()  # new limits apply to this user's keys straight away
    return row


# ── Live scoring (public GraphSynth data) ────────────────────────────────────

class LiveStateIn(BaseModel):
    innings: Literal[1, 2]
    batting: Literal["home", "away"]
    runs: int = Field(..., ge=0, le=600)
    wickets: int = Field(..., ge=0, le=10)
    overs: str = Field(..., examples=["12.3"])
    first_innings_total: int | None = Field(None, ge=0, le=600)


@router.post("/fixtures/{upcoming_id}/live", status_code=status.HTTP_201_CREATED, summary="Record the live score")
@limiter.limit("240/minute")
async def post_live(request: Request, upcoming_id: int, body: LiveStateIn, _admin: str = Depends(require_admin)):
    from cricveda_api.routes.graphics_v2 import StateIn, record_state
    from fastapi.concurrency import run_in_threadpool

    fx = store.get_fixture(upcoming_id)
    if not fx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found")
    try:
        state = StateIn(match_id=fx.get("slug") or "", **body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return await run_in_threadpool(record_state, fx, state, "public", "admin")


@router.get("/fixtures/{upcoming_id}/live", summary="Public live snapshots so far")
@limiter.limit("120/minute")
async def get_live(request: Request, upcoming_id: int, _admin: str = Depends(require_admin)):
    return store.list_snapshots(upcoming_id, "public")


@router.delete("/fixtures/{upcoming_id}/live", status_code=status.HTTP_204_NO_CONTENT, summary="Reset live scoring")
@limiter.limit("30/minute")
async def reset_live(request: Request, upcoming_id: int, _admin: str = Depends(require_admin)):
    store.delete_snapshots(upcoming_id, "public")
