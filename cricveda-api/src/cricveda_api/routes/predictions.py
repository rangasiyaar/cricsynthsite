"""Prediction endpoints.

GET /v1/matches/{upcoming_id}/prediction  — player score predictions
GET /v1/matches/{upcoming_id}/dream-team  — optimal Dream11 lineup
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from cricveda_api.auth import require_api_key
from cricveda_api.cache import cache_get, cache_key, cache_set
from cricveda_api.deps import limiter

router = APIRouter()


class PlayerPrediction(BaseModel):
    player_id: int
    player_name: str | None
    team: str
    role: str | None
    predicted_points: float
    credits: float
    model_version: str


class MatchPrediction(BaseModel):
    upcoming_id: int
    team1: str
    team2: str
    match_date: str
    players: list[PlayerPrediction]
    win_probability_team1: float | None = None


class DreamTeamPlayer(BaseModel):
    player_id: int
    player_name: str | None
    team: str
    role: str | None
    predicted_points: float
    credits: float
    is_captain: bool
    is_vice_captain: bool


class DreamTeamResponse(BaseModel):
    upcoming_id: int
    team1: str
    team2: str
    lineup: list[DreamTeamPlayer]
    total_credits: float
    projected_score: float


@router.get(
    "/matches/{upcoming_id}/prediction",
    response_model=MatchPrediction,
    summary="Player fantasy point predictions",
    description=(
        "Returns XGBoost-predicted Dream11 fantasy points for every player in both squads, "
        "sorted highest-first. Cached for **1 hour**.\n\n"
        "The model uses ~47 features including rolling form (last 3/5/10 matches), "
        "venue pitch character, opposition strength, batter-vs-style matchups, and toss impact."
    ),
)
@limiter.limit("30/minute")
async def get_match_prediction(
    request: Request,
    upcoming_id: int,
    _key_id: str = Depends(require_api_key),
):
    """Get fantasy point predictions for all squad players."""
    ck = cache_key("prediction", upcoming_id)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    # Load upcoming match
    um = client.table("upcoming_matches").select("*").eq("upcoming_id", upcoming_id).execute()
    if not um.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    match = um.data[0]

    # Load predictions for this upcoming_id (stored with match_id = upcoming_id in predictions table)
    pred_rows = (
        client.table("predictions")
        .select("player_id, predicted_points, model_version")
        .eq("match_id", upcoming_id)
        .order("predicted_points", desc=True)
        .execute()
    )

    if not pred_rows.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No predictions found. Run the prediction pipeline first.",
        )

    # Load squad for metadata (name, role, credits, team)
    squad = (
        client.table("squad_selections")
        .select("player_id, team, credits, player_meta(name, primary_role)")
        .eq("upcoming_id", upcoming_id)
        .execute()
    )
    squad_meta = {
        r["player_id"]: {
            "team": r["team"],
            "credits": r["credits"],
            "name": (r.get("player_meta") or {}).get("name"),
            "role": (r.get("player_meta") or {}).get("primary_role"),
        }
        for r in squad.data
    }

    players = []
    for p in pred_rows.data:
        pid = p["player_id"]
        meta = squad_meta.get(pid, {})
        players.append(PlayerPrediction(
            player_id=pid,
            player_name=meta.get("name"),
            team=meta.get("team", ""),
            role=meta.get("role"),
            predicted_points=p["predicted_points"],
            credits=meta.get("credits", 8.0),
            model_version=p["model_version"],
        ))

    result = MatchPrediction(
        upcoming_id=upcoming_id,
        team1=match["team1"],
        team2=match["team2"],
        match_date=match["match_date"],
        players=players,
    )

    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result


@router.get(
    "/matches/{upcoming_id}/dream-team",
    response_model=DreamTeamResponse,
    summary="Optimal Dream11 lineup",
    description=(
        "Runs a linear program (PuLP) over predicted fantasy scores and returns the optimal "
        "11-player Dream11 lineup, respecting credit limits, role constraints, and the 7-per-team cap. "
        "Captain and vice-captain are the two highest-predicted players. Cached for **1 hour**."
    ),
)
@limiter.limit("30/minute")
async def get_dream_team(
    request: Request,
    upcoming_id: int,
    _key_id: str = Depends(require_api_key),
):
    """Get the optimal Dream11 XI with captain and vice-captain picks."""
    ck = cache_key("dream_team", upcoming_id)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    um = client.table("upcoming_matches").select("*").eq("upcoming_id", upcoming_id).execute()
    if not um.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    match = um.data[0]

    # Load predictions
    pred_rows = (
        client.table("predictions")
        .select("player_id, predicted_points")
        .eq("match_id", upcoming_id)
        .execute()
    )
    if not pred_rows.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No predictions found. Run the prediction pipeline first.",
        )
    pred_map = {r["player_id"]: r["predicted_points"] for r in pred_rows.data}

    # Load squad
    squad = (
        client.table("squad_selections")
        .select("player_id, team, credits, player_meta(name, primary_role)")
        .eq("upcoming_id", upcoming_id)
        .eq("is_playing_xi", True)
        .execute()
    )

    from cricveda_core.dream_team.optimizer import PlayerCandidate, build_dream_team

    candidates = []
    name_map: dict[int, str | None] = {}
    for r in squad.data:
        pid = r["player_id"]
        meta = r.get("player_meta") or {}
        name_map[pid] = meta.get("name")
        role = meta.get("primary_role") or "BAT"
        candidates.append(PlayerCandidate(
            player_id=pid,
            name=meta.get("name", str(pid)),
            team=r["team"],
            role=role,
            predicted_points=pred_map.get(pid, 20.0),
            credits=r["credits"],
        ))

    if len(candidates) < 11:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Need ≥11 squad members, found {len(candidates)}",
        )

    result = build_dream_team(candidates)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not find a feasible lineup. Check squad roles and credits.",
        )

    lineup = [
        DreamTeamPlayer(
            player_id=p.player_id,
            player_name=name_map.get(p.player_id),
            team=p.team,
            role=p.role,
            predicted_points=p.predicted_points,
            credits=p.credits,
            is_captain=(p.player_id == result.captain.player_id),
            is_vice_captain=(p.player_id == result.vice_captain.player_id),
        )
        for p in sorted(result.players, key=lambda c: c.predicted_points, reverse=True)
    ]

    response = DreamTeamResponse(
        upcoming_id=upcoming_id,
        team1=match["team1"],
        team2=match["team2"],
        lineup=lineup,
        total_credits=result.total_credits_used,
        projected_score=result.projected_score,
    )

    cache_set(ck, response.model_dump(), ttl_seconds=3600)
    return response
