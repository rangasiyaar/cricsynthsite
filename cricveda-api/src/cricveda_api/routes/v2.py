"""CricSynthesis v2 — shared endpoints for all three products.

Product endpoints (/v2/predictions, /v2/simulate, /v2/graphics) are added by
their own routers; this module holds what they share: the caller's account
and the fixtures/squads entered in the admin panel, addressed by readable IDs
such as `ipl-2026-m042`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status

from cricveda_api import store
from cricveda_api.auth import ApiPrincipal, require_api_key
from cricveda_api.deps import limiter

router = APIRouter()


def _player_slug(player_id: int, slugs: dict[str, str]) -> str:
    return slugs.get(str(player_id), f"p-{player_id}")


def _public_fixture(fx: dict) -> dict:
    return {
        "match_id": fx.get("slug") or f"fx-{fx['upcoming_id']}",
        "league_id": fx.get("league_id"),
        "format": fx.get("format"),
        "match_date": fx.get("match_date"),
        "start_time": fx.get("start_time"),
        "teams": {"home": fx["team1"], "away": fx["team2"]},
        "venue_id": fx.get("venue_id"),
        "toss": (
            {"winner": fx["toss_winner"], "decision": fx.get("toss_decision")}
            if fx.get("toss_winner") else None
        ),
        "status": fx.get("status"),
    }


@router.get("/account", tags=["Account"], summary="Your plan, products and today's usage")
@limiter.limit("60/minute")
async def account(request: Request, principal: ApiPrincipal = Depends(require_api_key)):
    return {
        "request_id": request.state.request_id,
        "plan": principal.plan_id,
        "products": principal.products,
        "daily_limit": principal.daily_limit,
        "used_today": principal.used_today,
        "remaining_today": principal.remaining_today,
    }


@router.get("/fixtures", tags=["Account"], summary="Upcoming fixtures")
@limiter.limit("60/minute")
async def fixtures(request: Request, _principal: ApiPrincipal = Depends(require_api_key)):
    return {
        "request_id": request.state.request_id,
        "fixtures": [_public_fixture(f) for f in store.list_fixtures(status="scheduled")],
    }


@router.get("/fixtures/{match_id}", tags=["Account"], summary="One fixture with both squads")
@limiter.limit("60/minute")
async def fixture(request: Request, match_id: str, _principal: ApiPrincipal = Depends(require_api_key)):
    fx = store.get_fixture_by_slug(match_id)
    if not fx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown match_id '{match_id}'")
    squad = store.get_squad(fx["upcoming_id"])
    slugs = store.public_ids_for("player", [str(p["player_id"]) for p in squad])

    def side(team: str) -> dict:
        players = [p for p in squad if p["team"] == team]
        xi = sorted((p for p in players if p["is_playing_xi"]),
                    key=lambda p: (p.get("batting_order") or 99))
        confirmed = bool(xi) and all(p["is_confirmed"] for p in xi)
        return {
            "team": team,
            "xi_status": "confirmed" if confirmed else ("projected" if xi else "unknown"),
            "xi": [
                {
                    "player_id": _player_slug(p["player_id"], slugs),
                    "name": (p.get("player_meta") or {}).get("name"),
                    "role": (p.get("player_meta") or {}).get("primary_role"),
                    "batting_order": p.get("batting_order"),
                }
                for p in xi
            ],
            "bench": [_player_slug(p["player_id"], slugs) for p in players if not p["is_playing_xi"]],
        }

    return {
        "request_id": request.state.request_id,
        **_public_fixture(fx),
        "squads": {"home": side(fx["team1"]), "away": side(fx["team2"])},
    }
