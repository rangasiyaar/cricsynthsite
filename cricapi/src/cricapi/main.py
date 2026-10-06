"""CricSynthesis API — one catalog: analytics, simulation, graphics.

    uv run cricapi                       # http://localhost:8080/docs

Environment:
    CRICAPI_MODEL_DIR     fitted model (cricsim.engine fit)          default data/models/latest
    CRICAPI_PUBLISH_DIR   published match docs (cricsim.publish)     default data/publish
    CRICAPI_COVERAGE_DIR  admin coverage files                       default data/coverage
    CRICAPI_PATTERNS      Pattern Lab report.json                    default data/patterns/report.json
    CRICAPI_KEYS_FILE     API key store                              default data/keys.json
    CRICAPI_ADMIN_KEY     admin secret (admin routes are off when unset)
    CRICAPI_CORS          comma-separated allowed origins
"""
from __future__ import annotations

import hmac
import os
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from cricapi import graphics
from cricapi.store import PLANS, Content, KeyStore, Usage

Format = Literal["T20", "T10", "HUNDRED", "OD"]


@dataclass
class Settings:
    model_dir: Path = Path(os.environ.get("CRICAPI_MODEL_DIR", "data/models/latest"))
    publish_dir: Path = Path(os.environ.get("CRICAPI_PUBLISH_DIR", "data/publish"))
    coverage_dir: Path = Path(os.environ.get("CRICAPI_COVERAGE_DIR", "data/coverage"))
    patterns_file: Path = Path(os.environ.get("CRICAPI_PATTERNS", "data/patterns/report.json"))
    keys_file: Path = Path(os.environ.get("CRICAPI_KEYS_FILE", "data/keys.json"))
    admin_key: str | None = os.environ.get("CRICAPI_ADMIN_KEY")
    cors: str = os.environ.get("CRICAPI_CORS", "https://cricsynthesis.in,https://app.cricsynthesis.in,http://localhost:3000")


class _State:
    def __init__(self, s: Settings):
        self.settings = s
        self.keys = KeyStore(s.keys_file)
        self.usage = Usage()
        self.content = Content(s.publish_dir, s.coverage_dir, s.patterns_file)

    @cached_property
    def model(self):
        from cricsim.engine.model import Model
        if not (self.settings.model_dir / "model.npz").exists():
            raise HTTPException(503, "Model not loaded yet")
        return Model.load(self.settings.model_dir)


# ── request bodies ─────────────────────────────────────────────────────────────

class Team(BaseModel):
    name: str
    players: list[str] = Field(min_length=11, max_length=11, description="Cricsheet player ids, batting order")
    bowlers: list[str] | None = None


class Condition(BaseModel):
    type: Literal["team_score", "player_runs", "player_wickets", "phase_wickets", "batting_first"]
    team: int | None = Field(None, ge=0, le=1)
    player: str | None = None
    phase: Literal["Powerplay", "Middle", "Death"] | None = None
    at_least: int | None = None
    at_most: int | None = None


class SimulateRequest(BaseModel):
    format: Format = "T20"
    gender: Literal["male", "female"] = "male"
    teams: list[Team] = Field(min_length=2, max_length=2)
    venue_id: str | None = None
    comp_key: str | None = None
    batting_first: int | None = Field(None, ge=0, le=1)
    overs: int | None = Field(None, ge=1, le=50)
    attributes: dict[str, dict] = {}
    scenario: dict | None = Field(None, description="Pitch, dew, form, start state … see /v1 catalog")
    n: int = Field(10_000, ge=100, le=50_000)
    conditions: list[Condition] = []


class ProjectionRequest(BaseModel):
    format: Format = "T20"
    gender: Literal["male", "female"] = "male"
    position: int | None = Field(None, ge=1, le=11)
    opposition: list[str] | None = Field(None, min_length=11, max_length=11)
    venue_id: str | None = None
    comp_key: str | None = None
    n: int = Field(4_000, ge=100, le=20_000)


CATALOG = {
    "name": "CricSynthesis API", "version": "1",
    "about": "Analytics and projections from ball-by-ball simulation. We don't sell live scores or raw data.",
    "auth": "Send your key as X-API-Key (or Authorization: Bearer).",
    "plans": PLANS,
    "endpoints": {
        "analytics": [
            {"GET /v1/players?q=": "search players"},
            {"GET /v1/players/{id}": "profile: cross-league/format rating, experience, style"},
            {"POST /v1/players/{id}/projection": "run / wicket distribution in a typical match (or v an opposition XI)"},
            {"GET /v1/matchups?batter=&bowler=&format=&phase=": "per-ball outcome probabilities v an average pairing"},
            {"GET /v1/patterns": "Pattern Lab: which cricket beliefs hold up in 6M balls"},
        ],
        "simulation": [
            {"POST /v1/simulate": "simulate any limited-overs match (XIs, venue, scenario, conditions)"},
            {"GET /v1/matches": "covered upcoming matches"},
            {"GET /v1/matches/{id}": "full pre-computed match centre"},
            {"GET /v1/matches/{id}/pack": "engine pack for client-side what-if simulation"},
        ],
        "graphics": [
            {"GET /v1/graphics/matches/{id}/{win|scores}.svg": "share cards"},
            {"GET /v1/graphics/matches/{id}/wickets/{team}.svg": "wicket-timing heatmap"},
            {"GET /v1/graphics/matches/{id}/players/{player}.svg": "player probability card"},
        ],
    },
    "scenario_fields": ["boundary_mult", "wicket_mult", "spin_wicket_mult", "pace_wicket_mult", "dew", "extras_mult",
                        "player_form", "exclude_bowlers", "batting_order", "target", "conditions", "start"],
    "data": "Ball-by-ball data from Cricsheet (cricsheet.org); playing styles from the cricketdata R package / ESPNcricinfo.",
}


def create_app(settings: Settings | None = None) -> FastAPI:
    st = _State(settings or Settings())
    app = FastAPI(title="CricSynthesis API", version="1", docs_url="/docs", redoc_url="/redoc",
                  description=CATALOG["about"])
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in st.settings.cors.split(",") if o.strip()],
                       allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["X-API-Key", "Authorization",
                                                                                       "X-Admin-Key", "Content-Type"])
    app.state.cs = st

    def account(x_api_key: str | None = Header(None), authorization: str | None = Header(None)) -> dict:
        key = x_api_key or (authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None)
        rec = st.keys.lookup(key) if key else None
        if not rec:
            raise HTTPException(401, "Missing or invalid API key")
        plan = PLANS[rec["plan"]]
        if st.usage.hit(rec["hash"]) > plan["daily_requests"]:
            raise HTTPException(429, f"Daily limit of {plan['daily_requests']} requests reached for the {rec['plan']} plan")
        return {**rec, "limits": plan}

    def admin(x_admin_key: str | None = Header(None)) -> None:
        want = st.settings.admin_key
        if not want or not x_admin_key or not hmac.compare_digest(want, x_admin_key):
            raise HTTPException(403, "Admin only")

    # ── public ──
    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/v1")
    def catalog():
        return CATALOG

    # ── analytics ──
    @app.get("/v1/players")
    def players(q: str = Query(..., min_length=2), limit: int = Query(20, le=50), acct=Depends(account)):
        from cricsim.engine.analytics import search_players
        return {"players": search_players(st.model, q, limit)}

    @app.get("/v1/players/{pid}")
    def player(pid: str, format: Format = "T20", acct=Depends(account)):
        from cricsim.engine.analytics import _who
        from cricsim.engine.summary import profile
        if not st.model.knows(pid):
            raise HTTPException(404, "Unknown player")
        return {**_who(st.model, pid), "profile": profile(st.model, pid, format)}

    @app.post("/v1/players/{pid}/projection")
    def player_projection(pid: str, body: ProjectionRequest, acct=Depends(account)):
        from cricsim.engine.analytics import projection
        return projection(st.model, pid, body.format, body.gender, body.position, body.opposition, body.venue_id,
                          body.comp_key, n=min(body.n, acct["limits"]["max_simulations"]))

    @app.get("/v1/matchups")
    def matchups(batter: str, bowler: str, format: Format = "T20", gender: Literal["male", "female"] = "male",
                 phase: Literal["powerplay", "middle", "death"] = "middle", acct=Depends(account)):
        from cricsim.engine.analytics import matchup
        return matchup(st.model, batter, bowler, format, gender, phase)

    @app.get("/v1/patterns")
    def patterns(acct=Depends(account)):
        p = st.content.patterns()
        if p is None:
            raise HTTPException(404, "Pattern Lab report not published yet")
        return p

    # ── simulation ──
    @app.post("/v1/simulate")
    def simulate_match(body: SimulateRequest, acct=Depends(account)):
        from cricsim.engine.io import spec_from_dict
        from cricsim.engine.simulate import simulate
        from cricsim.engine.summary import masks, summarize
        try:
            spec, scenario = spec_from_dict(body.model_dump())
        except (TypeError, ValueError) as e:
            raise HTTPException(422, str(e))
        n = min(body.n, acct["limits"]["max_simulations"])
        sims = simulate(st.model, spec, n=n, scenario=scenario)
        out = summarize(sims, st.model)
        if body.conditions:
            mask = None
            for c in body.conditions:
                if c.type == "team_score":
                    m = masks.team_score(sims, c.team or 0, c.at_least, c.at_most)
                elif c.type == "player_runs":
                    m = masks.player_runs(sims, c.player or "", c.at_least or 0)
                elif c.type == "player_wickets":
                    m = masks.player_wickets(sims, c.player or "", c.at_least or 0)
                elif c.type == "phase_wickets":
                    m = masks.phase_wickets(sims, c.team or 0, c.phase or "Powerplay", c.at_least or 0)
                else:
                    m = masks.batting_first(sims, c.team or 0)
                mask = m if mask is None else mask & m
            share = float(mask.mean())
            out["conditional"] = {"share_of_simulations": round(share, 4),
                                  "summary": summarize(sims, st.model, mask) if mask.sum() >= 50 else None}
        out["meta"]["plan"] = acct["plan"]
        return out

    @app.get("/v1/matches")
    def matches(acct=Depends(account)):
        return {"matches": [m for m in st.content.index()["matches"] if m.get("published", True)]}

    def _doc(match_id: str) -> dict:
        d = st.content.match(match_id)
        if not d or not d.get("published", True):
            raise HTTPException(404, "Match not found")
        return d

    @app.get("/v1/matches/{match_id}")
    def match(match_id: str, acct=Depends(account)):
        return _doc(match_id)

    @app.get("/v1/matches/{match_id}/pack")
    def match_pack(match_id: str, acct=Depends(account)):
        _doc(match_id)
        return st.content.pack(match_id)

    # ── graphics ──
    def _svg(svg: str | None) -> Response:
        if svg is None:
            raise HTTPException(404, "Not found")
        return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=600"})

    @app.get("/v1/graphics/matches/{match_id}/{card}.svg")
    def card(match_id: str, card: Literal["win", "scores"], theme: Literal["dark", "light"] = "dark",
             acct=Depends(account)):
        return _svg(graphics.CARDS[card](_doc(match_id), theme, acct["limits"]["watermark"]))

    @app.get("/v1/graphics/matches/{match_id}/wickets/{team}.svg")
    def wickets(match_id: str, team: int, theme: Literal["dark", "light"] = "dark", acct=Depends(account)):
        if team not in (0, 1):
            raise HTTPException(404, "team is 0 or 1")
        return _svg(graphics.wickets_card(_doc(match_id), team, theme, acct["limits"]["watermark"]))

    @app.get("/v1/graphics/matches/{match_id}/players/{pid}.svg")
    def player_card(match_id: str, pid: str, theme: Literal["dark", "light"] = "dark", acct=Depends(account)):
        return _svg(graphics.player_card(_doc(match_id), pid, theme, acct["limits"]["watermark"]))

    # ── admin: decide which matches are covered, publish them, issue keys ──
    @app.get("/admin/coverage", dependencies=[Depends(admin)])
    def coverage_list():
        return {"matches": st.content.coverage_list()}

    @app.put("/admin/coverage/{match_id}", dependencies=[Depends(admin)])
    async def coverage_put(match_id: str, request: Request):
        from cricsim.engine.io import spec_from_dict
        doc = await request.json()
        doc["id"] = match_id
        try:
            spec_from_dict(doc)
        except (TypeError, ValueError, KeyError) as e:
            raise HTTPException(422, f"Invalid match: {e}")
        st.content.put_coverage(match_id, doc)
        return {"ok": True, "id": match_id}

    @app.delete("/admin/coverage/{match_id}", dependencies=[Depends(admin)])
    def coverage_delete(match_id: str):
        if not st.content.delete_coverage(match_id):
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @app.post("/admin/coverage/{match_id}/publish", dependencies=[Depends(admin)])
    def coverage_publish(match_id: str, n: int = Query(20_000, ge=1000, le=50_000)):
        import json as _json

        from cricsim.publish import publish_match
        cov = st.content.coverage(match_id)
        if not cov:
            raise HTTPException(404, "Not covered")
        card = publish_match(st.model, cov, st.settings.publish_dir, n=n)
        idx = st.content.index()
        idx["matches"] = [m for m in idx["matches"] if m["id"] != match_id] + [card]
        idx["matches"].sort(key=lambda c: (c.get("date") or "", c.get("start_time") or ""))
        (st.settings.publish_dir / "index.json").write_text(_json.dumps(idx))
        return card

    @app.get("/admin/players", dependencies=[Depends(admin)])
    def admin_players(q: str = Query(..., min_length=2), limit: int = Query(15, le=50)):
        from cricsim.engine.analytics import search_players
        return {"players": search_players(st.model, q, limit)}

    @app.post("/admin/keys", dependencies=[Depends(admin)])
    def new_key(owner: str, plan: Literal["free", "pro", "business"] = "free"):
        return {"key": st.keys.create(owner, plan), "plan": plan, "note": "Shown once — store it now."}

    return app


app = create_app()


def run() -> None:
    import uvicorn
    uvicorn.run("cricapi.main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
