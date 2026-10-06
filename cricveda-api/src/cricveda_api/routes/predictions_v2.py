"""CricVeda v2 — player performance predictions.

POST /v2/predictions/player    one player's form, P10/median/P90 range, tier, captain value
GET  /v2/predictions/match/{match_id}   every player in the projected XIs
POST /v2/predictions/xi        recommended XI with captain / vice-captain

Predictions are pre-computed by `cricveda_core.predictions.batch` (GitHub
Actions) whenever a fixture's squad changes; these endpoints only read them.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from cricveda_api import store
from cricveda_api.auth import ApiPrincipal, require_cricveda
from cricveda_api.deps import limiter
from cricveda_api.ids import fixture_by_match_id, player_internal_id, player_public_ids

router = APIRouter(prefix="/predictions", tags=["CricVeda v2"])

_METRIC_FIELDS = {"runs": "runs", "wickets": "wickets", "fantasy_points": "points"}
_NOT_READY = ("Predictions for this match aren't ready yet. They are generated once both "
              "squads are entered and refresh automatically when the XI changes.")


# ── Request models ───────────────────────────────────────────────────────────

class PredictionContext(BaseModel):
    batting_position: int | None = Field(None, ge=1, le=7, description="What-if batting slot (1–7). Omit to use the projected order.")
    xi_confirmed: bool = Field(False, description="Only accept a prediction made from the officially confirmed XI.")
    include_conditions: bool = Field(True, description="Use venue and toss conditions.")


class PlayerPredictionRequest(BaseModel):
    match_id: str = Field(..., examples=["ipl-2026-m042"])
    player_id: str = Field(..., examples=["p-vk18"])
    context: PredictionContext = PredictionContext()


class XIRequest(BaseModel):
    match_id: str = Field(..., examples=["ipl-2026-m042"])
    credit_limit: float = Field(100.0, gt=0, le=200)
    max_per_team: int = Field(7, ge=6, le=11)
    include_conditions: bool = True


# ── Response shaping ─────────────────────────────────────────────────────────

def _range(row: dict, field: str) -> dict | None:
    p10, p50, p90 = row.get(f"{field}_p10"), row.get(f"{field}_p50"), row.get(f"{field}_p90")
    if p50 is None:
        return None
    as_int = field == "wickets"
    fmt = (lambda v: int(round(v))) if as_int else (lambda v: round(float(v), 1))
    return {"p10": fmt(p10), "median": fmt(p50), "p90": fmt(p90)}


def _player_block(row: dict, slug: str, names: dict[int, dict]) -> dict:
    meta = names.get(row["player_id"], {})
    return {"id": slug, "name": meta.get("name"), "role": row.get("role") or meta.get("primary_role")}


def _prediction_block(row: dict) -> dict:
    metric = row["metric"]
    block = {metric: _range(row, _METRIC_FIELDS[metric])}
    if metric != "fantasy_points":
        block["fantasy_points"] = _range(row, "points")
    block["confidence"] = row["confidence"]
    return block


def _shape(row: dict, slug: str, names: dict[int, dict], request_id: str, match_id: str) -> dict:
    return {
        "request_id": request_id,
        "match_id": match_id,
        "player": _player_block(row, slug, names),
        "form": {"score": row["form_score"], "trend": row["form_trend"]},
        "prediction": _prediction_block(row),
        "performance": {
            "tier": row["tier"],
            "composite_score": row["composite_score"],
            "captain_value": row["captain_value"],
        },
        "context": {
            "batting_position": row["batting_position"] or None,
            "xi_status": row["xi_status"],
            "include_conditions": row["include_conditions"],
        },
        "model_version": row["model_version"],
        "generated_at": row["generated_at"],
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/player", summary="Predict one player's performance")
@limiter.limit("120/minute")
async def predict_player(
    request: Request,
    body: PlayerPredictionRequest,
    _principal: ApiPrincipal = Depends(require_cricveda),
):
    fx = fixture_by_match_id(body.match_id)
    pid = player_internal_id(body.player_id)
    ctx = body.context

    row = store.get_player_prediction(fx["upcoming_id"], pid, ctx.batting_position or 0, ctx.include_conditions)
    if row is None and ctx.batting_position:
        # Bowlers only have their projected slot; tell the caller rather than guessing.
        projected = store.get_player_prediction(fx["upcoming_id"], pid, 0, ctx.include_conditions)
        if projected is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"No batting_position what-if for a {projected.get('role') or 'non-batter'}; omit batting_position.",
            )
    if row is None:
        if not store.list_match_predictions(fx["upcoming_id"], ctx.include_conditions):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_READY)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Player '{body.player_id}' isn't in either XI for {body.match_id}.",
        )
    if ctx.xi_confirmed and row["xi_status"] != "confirmed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The XI for this player's team isn't confirmed yet. Retry after the toss, "
                   "or send xi_confirmed=false to get the projected-XI prediction.",
        )

    names = store.player_names([pid])
    return _shape(row, body.player_id, names, request.state.request_id, body.match_id)


@router.get("/match/{match_id}", summary="Predictions for every player in a match")
@limiter.limit("60/minute")
async def predict_match(
    request: Request,
    match_id: str,
    include_conditions: bool = True,
    _principal: ApiPrincipal = Depends(require_cricveda),
):
    fx = fixture_by_match_id(match_id)
    rows = store.list_match_predictions(fx["upcoming_id"], include_conditions)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_READY)
    ids = [r["player_id"] for r in rows]
    names, slugs = store.player_names(ids), player_public_ids(ids)
    rows.sort(key=lambda r: r["composite_score"], reverse=True)
    players = [_shape(r, slugs[r["player_id"]], names, request.state.request_id, match_id) for r in rows]
    for p, r in zip(players, rows):
        p["team"] = r["team"]
        for k in ("request_id", "match_id", "model_version", "generated_at"):
            p.pop(k)
    return {
        "request_id": request.state.request_id,
        "match_id": match_id,
        "teams": {"home": fx["team1"], "away": fx["team2"]},
        "model_version": rows[0]["model_version"],
        "generated_at": max(r["generated_at"] for r in rows),
        "players": players,
    }


@router.post("/xi", summary="Recommended XI with captain and vice-captain")
@limiter.limit("30/minute")
async def recommend_xi(
    request: Request,
    body: XIRequest,
    _principal: ApiPrincipal = Depends(require_cricveda),
):
    from cricveda_core.dream_team.optimizer import PlayerCandidate, build_dream_team

    fx = fixture_by_match_id(body.match_id)
    rows = store.list_match_predictions(fx["upcoming_id"], body.include_conditions)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_READY)
    ids = [r["player_id"] for r in rows]
    names, slugs, credits = store.player_names(ids), player_public_ids(ids), store.squad_credits(fx["upcoming_id"])
    by_id = {r["player_id"]: r for r in rows}
    candidates = [
        PlayerCandidate(
            player_id=r["player_id"], name=(names.get(r["player_id"]) or {}).get("name") or slugs[r["player_id"]],
            team=r["team"], role=(r.get("role") or "AR").upper(),
            predicted_points=float(r["points_p50"]), credits=credits.get(r["player_id"], 8.0),
        )
        for r in rows
    ]
    result = build_dream_team(candidates, credit_limit=body.credit_limit, max_per_team=body.max_per_team)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No XI satisfies the credit limit and role rules (1–4 WK, 3–6 BAT, 1–4 AR, 3–6 BOWL).",
        )

    def entry(c):
        r = by_id[c.player_id]
        return {
            "player_id": slugs[c.player_id], "name": c.name, "team": c.team, "role": c.role,
            "credits": c.credits, "fantasy_points": _range(r, "points"),
            "tier": r["tier"], "captain_value": r["captain_value"],
        }

    return {
        "request_id": request.state.request_id,
        "match_id": body.match_id,
        "xi": [entry(c) for c in sorted(result.players, key=lambda c: c.predicted_points, reverse=True)],
        "captain": slugs[result.captain.player_id],
        "vice_captain": slugs[result.vice_captain.player_id],
        "credits_used": round(result.total_credits_used, 1),
        "projected_points": round(result.projected_score, 1),
        "model_version": rows[0]["model_version"],
    }
