"""GraphSynth v2 — broadcast-grade graphics.

Live / pre-match (fixture `match_id`, e.g. ipl-2026-m042):
    GET  /v2/graphics/win-probability     win-probability worm across both innings
    GET  /v2/graphics/score-projection    current score + projected final total
    POST /v2/graphics/state               push your own live match state (private to your account)

Historical (completed match `match_id` like m-1234567):
    GET  /v2/graphics/manhattan · /worm · /phases
Player:
    GET  /v2/graphics/player-form?player_id=p-vk18

Every graphic takes format=json|svg|png, theme=broadcast_dark|broadcast_light|transparent,
width/height, home_color/away_color. The default JSON response carries the data
series and the image; add raw=true to get the image itself (for <img> tags or an
OBS / vMix / CasparCG browser source).
"""
from __future__ import annotations

import base64
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field, field_validator

from cricveda_api import store
from cricveda_api.auth import ApiPrincipal, require_product
from cricveda_api.deps import limiter
from cricveda_api.ids import fixture_by_match_id, player_internal_id
from cricveda_api.matchsynth_model import get_ball_model

router = APIRouter(prefix="/graphics", tags=["GraphSynth v2"])
require_graphsynth = require_product("graphsynth")

Format = Literal["json", "svg", "png"]
ThemeName = Literal["broadcast_dark", "broadcast_light", "transparent"]
_HIST = re.compile(r"^m-(\d+)$")


def scope_for(principal: ApiPrincipal) -> str:
    return f"user:{principal.user_id}" if principal.user_id else f"key:{principal.key_id}"


class RenderParams:
    def __init__(
        self,
        format: Format = "json",
        theme: ThemeName = "broadcast_dark",
        width: int = Query(1920, ge=320, le=3840),
        height: int = Query(1080, ge=180, le=2160),
        home_color: str | None = Query(None, description="Hex colour, e.g. #004ba0"),
        away_color: str | None = Query(None, description="Hex colour, e.g. #f9cd05"),
        raw: bool = Query(False, description="Return the image itself instead of JSON."),
    ):
        from cricveda_core.graphsynth.render import theme_for

        self.format, self.theme_name, self.width, self.height, self.raw = format, theme, width, height, raw
        try:  # validate before any data is fetched
            self._theme = theme_for(theme, home_color, away_color)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    def theme(self):
        return self._theme


def _respond(request: Request, p: RenderParams, graphic: str, svg: str, data: dict):
    from cricveda_core.graphsynth.render import to_png

    if p.raw:
        if p.format == "png":
            return Response(to_png(svg, p.width, p.height), media_type="image/png",
                            headers={"Cache-Control": "no-store"})
        return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "no-store"})
    body = {"request_id": request.state.request_id, "graphic": graphic, "format": p.format,
            "theme": p.theme_name, **data}
    if p.format == "svg":
        body["image"] = svg
    elif p.format == "png":
        body["image"] = "data:image/png;base64," + base64.b64encode(to_png(svg, p.width, p.height)).decode()
    return body


def _series(fixture: dict, principal: ApiPrincipal) -> tuple[list[dict], str]:
    """The caller's own pushed feed if they have one, otherwise public data."""
    own = store.list_snapshots(fixture["upcoming_id"], scope_for(principal))
    if own:
        return own, "your feed"
    return store.list_snapshots(fixture["upcoming_id"], "public"), "public"


def _overs(fixture: dict) -> int:
    from cricveda_core.matchsynth.ball_model import FORMATS
    return FORMATS.get((fixture.get("format") or "T20").upper(), 20)


# ── live / pre-match ─────────────────────────────────────────────────────────

@router.get("/win-probability", summary="Win-probability worm (live or pre-match)")
@limiter.limit("120/minute")
def win_probability(request: Request, match_id: str, p: RenderParams = Depends(),
                    principal: ApiPrincipal = Depends(require_graphsynth)):
    from cricveda_core.graphsynth import render
    from cricveda_core.graphsynth.data import snapshot_series
    from cricveda_core.matchsynth.fixture import toss_key_from_fixture

    fx = fixture_by_match_id(match_id)
    snaps, source = _series(fx, principal)
    projection = None
    if snaps:
        series = snapshot_series(snaps)
        last = snaps[-1]
        projection = {"score": last["proj_p50"], "band": round((last["proj_p90"] - last["proj_p10"]) / 2)}
    else:
        stored = store.get_stored_simulation(fx["upcoming_id"], toss_key_from_fixture(fx) or "")
        if not stored:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail="No live data or pre-match simulation for this match yet.")
        series = [{"innings": 1, "balls": 0, "home_win": stored["result"]["win_probability"][fx["team1"]]}]
        source = "pre-match simulation"
    svg = render.win_probability(series, fx["team1"], fx["team2"], _overs(fx), p.theme(),
                                 projection=projection, width=p.width, height=p.height)
    return _respond(request, p, "win_probability_worm", svg, {
        "match_id": match_id, "source": source,
        "series": [round(s["home_win"], 3) for s in series],
        "points": series, "projection": projection,
    })


@router.get("/score-projection", summary="Current score and projected total")
@limiter.limit("120/minute")
def score_projection(request: Request, match_id: str, p: RenderParams = Depends(),
                     principal: ApiPrincipal = Depends(require_graphsynth)):
    from cricveda_core.graphsynth import render
    from cricveda_core.graphsynth.data import overs_text

    fx = fixture_by_match_id(match_id)
    snaps, source = _series(fx, principal)
    if not snaps:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No live data for this match yet.")
    s = snaps[-1]
    batting = fx["team1"] if s["batting"] == "home" else fx["team2"]
    t = p.theme()
    projected = {"p10": s["proj_p10"], "median": s["proj_p50"], "p90": s["proj_p90"]}
    target = s["first_innings_total"] + 1 if s["innings"] == 2 and s["first_innings_total"] is not None else None
    svg = render.score_projection(batting, s["runs"], s["wickets"], overs_text(s["legal_balls"]), projected, t,
                                  target=target, color=t.home if s["batting"] == "home" else t.away,
                                  width=p.width, height=p.height)
    return _respond(request, p, "score_projection", svg, {
        "match_id": match_id, "source": source, "batting": batting,
        "score": {"runs": s["runs"], "wickets": s["wickets"], "overs": overs_text(s["legal_balls"])},
        "projection": {"score": s["proj_p50"], "band": round((s["proj_p90"] - s["proj_p10"]) / 2), **projected},
        "target": target,
    })


class StateIn(BaseModel):
    match_id: str
    innings: Literal[1, 2]
    batting: Literal["home", "away"]
    runs: int = Field(..., ge=0, le=600)
    wickets: int = Field(..., ge=0, le=10)
    overs: str = Field(..., examples=["12.3"])
    first_innings_total: int | None = Field(None, ge=0, le=600)

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


def record_state(fx: dict, body: StateIn, scope: str, source: str) -> dict:
    """Shared by customer pushes and admin scoring."""
    from cricveda_core.graphsynth.live import MatchState, snapshot
    from cricveda_api.routes.simulate_v2 import _squad

    state = MatchState(body.innings, body.batting, body.runs, body.wickets, body.legal_balls(),
                       body.first_innings_total)
    try:
        snap = snapshot(get_ball_model(), fx, _squad(fx), state)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    return store.put_snapshot({**snap, "upcoming_id": fx["upcoming_id"], "scope": scope, "source": source})


@router.post("/state", summary="Push your live match state", status_code=status.HTTP_201_CREATED)
@limiter.limit("240/minute")
def push_state(request: Request, body: StateIn, principal: ApiPrincipal = Depends(require_graphsynth)):
    fx = fixture_by_match_id(body.match_id)
    row = record_state(fx, body, scope_for(principal), "customer")
    return {"request_id": request.state.request_id, "match_id": body.match_id,
            "win_probability": {fx["team1"]: row["win_prob_home"], fx["team2"]: round(1 - row["win_prob_home"], 3)},
            "projection": {"p10": row["proj_p10"], "median": row["proj_p50"], "p90": row["proj_p90"]},
            "visible_to": "your account only"}


@router.delete("/state", summary="Clear your pushed live data for a match", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def clear_state(request: Request, match_id: str, principal: ApiPrincipal = Depends(require_graphsynth)):
    fx = fixture_by_match_id(match_id)
    store.delete_snapshots(fx["upcoming_id"], scope_for(principal))


# ── historical ───────────────────────────────────────────────────────────────

def _historical(match_id: str):
    from cricveda_core.graphsynth.data import batting_order, innings_by_over

    m = _HIST.match(match_id)
    if not m:
        raise HTTPException(status_code=422, detail="Historical graphics take a completed match id like m-1234567.")
    match = store.historical_match(int(m.group(1)))
    if not match:
        raise HTTPException(status_code=404, detail=f"Unknown match_id '{match_id}'")
    fmt = ((match.get("leagues") or {}).get("format") or "T20").upper()
    overs = 50 if fmt == "ODI" else 20
    teams = batting_order(match["team1"], match["team2"], match.get("toss_winner"), match.get("toss_decision"))
    innings = innings_by_over(store.match_deliveries(int(m.group(1))), teams, overs)
    if not innings:
        raise HTTPException(status_code=404, detail="No ball-by-ball data for this match.")
    suffix = f" · {match['team1']} v {match['team2']} · {match.get('match_date', '')}"
    return match, fmt, innings, suffix


@router.get("/manhattan", summary="Runs per over (completed match)")
@limiter.limit("60/minute")
def manhattan(request: Request, match_id: str, p: RenderParams = Depends(),
              _principal: ApiPrincipal = Depends(require_graphsynth)):
    from cricveda_core.graphsynth import render
    _, _, innings, suffix = _historical(match_id)
    svg = render.manhattan(innings, p.theme(), title_suffix=suffix, width=p.width, height=p.height)
    return _respond(request, p, "manhattan", svg, {"match_id": match_id, "innings": innings})


@router.get("/worm", summary="Cumulative runs (completed match)")
@limiter.limit("60/minute")
def worm(request: Request, match_id: str, p: RenderParams = Depends(),
         _principal: ApiPrincipal = Depends(require_graphsynth)):
    from cricveda_core.graphsynth import render
    _, _, innings, suffix = _historical(match_id)
    svg = render.run_worm(innings, p.theme(), title_suffix=suffix, width=p.width, height=p.height)
    return _respond(request, p, "run_worm", svg, {"match_id": match_id, "innings": innings})


@router.get("/phases", summary="Phase breakdown (completed match)")
@limiter.limit("60/minute")
def phases(request: Request, match_id: str, p: RenderParams = Depends(),
           _principal: ApiPrincipal = Depends(require_graphsynth)):
    from cricveda_core.graphsynth import render
    from cricveda_core.graphsynth.data import phase_rows
    _, fmt, innings, _ = _historical(match_id)
    rows = phase_rows(innings, fmt)
    svg = render.phase_breakdown(rows, p.theme(), width=p.width, height=p.height)
    return _respond(request, p, "phase_breakdown", svg, {"match_id": match_id, "teams": rows})


@router.get("/player-form", summary="Recent form chart")
@limiter.limit("60/minute")
def player_form(request: Request, player_id: str, last: int = Query(10, ge=3, le=30),
                p: RenderParams = Depends(), _principal: ApiPrincipal = Depends(require_graphsynth)):
    from cricveda_core.graphsynth import render
    from cricveda_core.graphsynth.data import form_rows

    pid = player_internal_id(player_id)
    rows = form_rows(store.player_points(pid, last), last=last)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No match history for '{player_id}'")
    name = (store.player_names([pid]).get(pid) or {}).get("name") or player_id
    svg = render.player_form(name, rows, p.theme(), width=p.width, height=p.height)
    return _respond(request, p, "player_form", svg, {"player_id": player_id, "name": name, "matches": rows})
