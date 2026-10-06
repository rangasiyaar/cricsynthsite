"""MatchSynth v2 — ball-by-ball match simulation.

POST /v2/simulate/match        win probability, innings totals, pressure phase, opposition weakness
POST /v2/simulate/scenario     resume from any match state, with what-ifs
POST /v2/simulate/opposition   where a side's batting is weak and which of our bowlers exploit it
POST /v2/simulate/auction      win probability a player adds over a replacement-level player

The default full-match request is pre-computed nightly (and whenever a squad
changes) by `cricveda_core.matchsynth.batch`; anything else runs live,
capped at 10,000 iterations. Simulations are CPU-bound, so these handlers are
plain `def` functions that FastAPI runs in its thread pool.
"""
from __future__ import annotations

import os
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator

from cricveda_api import store
from cricveda_api.auth import ApiPrincipal, require_product
from cricveda_api.deps import limiter
from cricveda_api.ids import fixture_by_match_id, player_internal_id
from cricveda_api.matchsynth_model import get_ball_model

router = APIRouter(prefix="/simulate", tags=["MatchSynth v2"])
require_matchsynth = require_product("matchsynth")

MAX_ITERATIONS = 10000
TossKey = Literal["home_bat", "home_bowl", "away_bat", "away_bowl"]


# ── Requests ─────────────────────────────────────────────────────────────────

class XIRequirement(BaseModel):
    home: Literal["confirmed", "projected"] = "projected"
    away: Literal["confirmed", "projected"] = "projected"


class MatchRequest(BaseModel):
    match_id: str = Field(..., examples=["ipl-2026-m042"])
    iterations: int = Field(MAX_ITERATIONS, ge=500, le=MAX_ITERATIONS)
    xi: XIRequirement = XIRequirement()
    toss: TossKey | None = Field(None, description="Omit to use the fixture's toss, or simulate both batting orders if unknown.")
    seed: int | None = Field(None, description="Fix the random seed for reproducible runs.")


class ScenarioRequest(BaseModel):
    match_id: str
    innings: Literal[1, 2]
    batting: Literal["home", "away"]
    runs: int = Field(..., ge=0, le=600)
    wickets: int = Field(..., ge=0, le=9)
    overs: str = Field(..., examples=["12.3"], description="Overs completed, cricket notation (12.3 = 12 overs 3 balls).")
    first_innings_total: int | None = Field(None, ge=0, le=600)
    bowler_overs: dict[str, int] = Field(default_factory=dict, description="Overs already bowled, by player_id.")
    last_bowler: str | None = None
    batting_order: list[str] | None = Field(None, description="What-if batting order (player_ids of the batting XI).")
    exclude_bowlers: list[str] = Field(default_factory=list, description="What-if: these bowlers bowl no more overs.")
    iterations: int = Field(MAX_ITERATIONS, ge=500, le=MAX_ITERATIONS)
    seed: int | None = None

    @field_validator("overs")
    @classmethod
    def _overs(cls, v: str) -> str:
        whole, _, part = v.strip().partition(".")
        if not whole.isdigit() or (part and (not part.isdigit() or int(part) > 5)):
            raise ValueError("overs must look like 12 or 12.3 (balls 0–5)")
        return v.strip()

    def legal_balls(self) -> int:
        whole, _, part = self.overs.partition(".")
        return int(whole) * 6 + (int(part) if part else 0)


class OppositionRequest(BaseModel):
    match_id: str
    team: Literal["home", "away"] = Field(..., description="The side to analyse.")


class AuctionRequest(BaseModel):
    match_id: str
    player_id: str
    iterations: int = Field(6000, ge=1000, le=MAX_ITERATIONS)


# ── Helpers ──────────────────────────────────────────────────────────────────

_cache: OrderedDict[tuple, dict] = OrderedDict()
_cache_lock = threading.Lock()


def _cached(key: tuple, compute):
    with _cache_lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    value = compute()
    with _cache_lock:
        _cache[key] = value
        while len(_cache) > 64:
            _cache.popitem(last=False)
    return value


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _squad(fixture: dict):
    from cricveda_core.matchsynth.fixture import SquadRow
    rows = store.simulation_squad(fixture["upcoming_id"])
    squad = [
        SquadRow(r["player_id"], r["team"], r.get("batting_order"), r["is_playing_xi"], r["is_confirmed"],
                 (r.get("player_meta") or {}).get("primary_role"), (r.get("player_meta") or {}).get("bowling_style"))
        for r in rows
    ]
    for team in (fixture["team1"], fixture["team2"]):
        if sum(1 for p in squad if p.team == team and p.is_playing_xi) < 11:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail=f"{team}'s XI isn't complete yet, so this match can't be simulated.")
    return squad


def _value_error(e: ValueError):
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


def _ts(value) -> datetime:
    """Parse a timestamp to naive UTC; missing → the earliest possible time."""
    if not value:
        return datetime.min
    t = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return t.astimezone(timezone.utc).replace(tzinfo=None) if t.tzinfo else t


def _version_key(fixture: dict) -> str:
    return str(fixture.get("updated_at") or "")


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/match", summary="Simulate a full match")
@limiter.limit("20/minute")
def simulate_match(request: Request, body: MatchRequest, _p: ApiPrincipal = Depends(require_matchsynth)):
    from cricveda_core.matchsynth.fixture import simulate_fixture, toss_key_from_fixture, xi_status

    fx = fixture_by_match_id(body.match_id)
    squad = _squad(fx)
    for side, team in (("home", fx["team1"]), ("away", fx["team2"])):
        if getattr(body.xi, side) == "confirmed" and xi_status(squad, team) != "confirmed":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                                detail=f"{team}'s XI isn't confirmed yet. Send xi.{side}='projected' or retry after the toss.")
    model = get_ball_model()
    toss = body.toss or toss_key_from_fixture(fx)

    result = None
    if body.iterations == MAX_ITERATIONS and body.seed is None:
        stored = store.get_stored_simulation(fx["upcoming_id"], toss or "")
        fresh = (stored and stored["model_version"] == model.version
                 and _ts(stored["generated_at"]) >= _ts(fx.get("updated_at")))
        if fresh:
            result = stored["result"]
    if result is None:
        key = ("match", fx["upcoming_id"], _version_key(fx), toss, body.iterations, body.seed, model.version)
        try:
            result = _cached(key, lambda: simulate_fixture(model, fx, squad, body.iterations, toss, body.seed or 0))
        except ValueError as e:
            raise _value_error(e)
    return {"request_id": request.state.request_id, "match_id": body.match_id, **result}


@router.post("/scenario", summary="Resume a match from any state, with what-ifs")
@limiter.limit("20/minute")
def simulate_scenario(request: Request, body: ScenarioRequest, _p: ApiPrincipal = Depends(require_matchsynth)):
    from cricveda_core.matchsynth.fixture import scenario

    fx = fixture_by_match_id(body.match_id)
    squad = _squad(fx)
    model = get_ball_model()
    to_id = player_internal_id
    try:
        result = scenario(
            model, fx, squad, innings=body.innings, batting=body.batting, runs=body.runs,
            wickets=body.wickets, balls=body.legal_balls(), first_innings_total=body.first_innings_total,
            bowler_overs={to_id(k): v for k, v in body.bowler_overs.items()},
            last_bowler=to_id(body.last_bowler) if body.last_bowler else None,
            batting_order=[to_id(p) for p in body.batting_order] if body.batting_order else None,
            exclude_bowlers=[to_id(p) for p in body.exclude_bowlers],
            iterations=body.iterations, seed=body.seed or 0,
        )
    except ValueError as e:
        raise _value_error(e)
    return {"request_id": request.state.request_id, "match_id": body.match_id, **result}


@router.post("/opposition", summary="Opposition batting weaknesses")
@limiter.limit("30/minute")
def simulate_opposition(request: Request, body: OppositionRequest, _p: ApiPrincipal = Depends(require_matchsynth)):
    from cricveda_core.matchsynth.fixture import opposition_report
    from cricveda_api.ids import player_public_ids

    fx = fixture_by_match_id(body.match_id)
    try:
        report = opposition_report(get_ball_model(), fx, _squad(fx), body.team)
    except ValueError as e:
        raise _value_error(e)
    ids = sorted({pid for w in report["weaknesses"] for pid in w["our_bowlers"]})
    slugs = player_public_ids(ids)
    for w in report["weaknesses"]:
        w["our_bowlers"] = [slugs[p] for p in w["our_bowlers"]]
    return {"request_id": request.state.request_id, "match_id": body.match_id, **report}


@router.post("/auction", summary="Auction value: wins a player adds")
@limiter.limit("10/minute")
def simulate_auction(request: Request, body: AuctionRequest, _p: ApiPrincipal = Depends(require_matchsynth)):
    from cricveda_core.matchsynth.fixture import auction_value

    fx = fixture_by_match_id(body.match_id)
    pid = player_internal_id(body.player_id)
    rate = os.getenv("MATCHSYNTH_CRORE_PER_WIN")
    try:
        result = _cached(
            ("auction", fx["upcoming_id"], _version_key(fx), pid, body.iterations, get_ball_model().version),
            lambda: auction_value(get_ball_model(), fx, _squad(fx), pid, body.iterations,
                                  crore_per_win=float(rate) if rate else None),
        )
    except ValueError as e:
        raise _value_error(e)
    return {"request_id": request.state.request_id, "match_id": body.match_id,
            **{**result, "player_id": body.player_id}}

