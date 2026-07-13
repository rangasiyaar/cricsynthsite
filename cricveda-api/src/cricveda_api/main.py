"""CricVeda FastAPI application."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from scalar_fastapi import get_scalar_api_reference
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from cricveda_api.deps import limiter

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

_DESCRIPTION = """
## CricVeda Cricket Intelligence API

25 unique ball-by-ball analytics endpoints powered by Cricsheet data across
22 leagues, all T20 and ODI formats, professional and domestic.

### Authentication
Pass your API key in every request header:
```
X-API-Key: cv_live_your_key_here
```

### Rate Limits
Free tier: **100 requests / day** per key.
All responses include `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers.

### Base URL
```
https://api.cricsynthesis.in/v1
```

### Endpoints at a glance
| Group | Endpoint | What it returns |
|---|---|---|
| Oracle | `GET /oracle/win-probability` | Historical win % from any match state |
| Oracle | `GET /oracle/collapse-probability` | Probability of 3+ wickets in next 30 balls |
| Players | `GET /players/{id}/clutch` | Performance in high-leverage moments only |
| Players | `GET /players/{id}/phase-profile` | Powerplay / middle / death breakdown |
| Players | `GET /players/{id}/pressure-fingerprint` | Bowler dot-streak and pressure patterns |
| Players | `GET /players/{id}/dismissal-map` | When and how a batter gets out |
| Players | `GET /players/{id}/momentum` | Cross-format time-decayed form score |
| Players | `GET /players/{id}/nemesis` | Who dismisses/owns this player most |
| Players | `GET /players/{id}/consistency` | Risk profile: safe / boom-or-bust / volatile |
| Players | `GET /players/{id}/win-contribution` | Leverage-weighted match impact score |
| Players | `GET /players/{id}/scoring-rhythm` | Quiet patches, acceleration curve |
| Players | `GET /players/{id}/milestone-behaviour` | SR change near 25 / 50 / 100 |
| Players | `GET /players/{id}/league-adjusted-performance` | Z-score across leagues |
| Players | `GET /players/{id}/position-analysis` | Performance by batting position |
| Players | `GET /players/{id}/inherited-pressure` | Performance by match state at arrival |
| Players | `GET /players/{id}/format-switch-impact` | Performance delta on T20↔ODI switch |
| Players | `GET /players/{id}/spell-analysis` | Economy and decay per bowler spell |
| Players | `GET /players/{id}/scoring-zones` | SR by balls-faced bucket |
| Venues | `GET /venues/{id}/toss-intelligence` | Toss alpha and best decision at this venue |
| Venues | `GET /venues/{id}/day-night-analysis` | Dew factor and 2nd innings death-over premium |
| Teams | `GET /teams/{name}/batting-depth` | Top-order dependency score |
| Matches | `GET /matches/{id}/pitch-reading` | Surface classification from first 3 overs |
| Matches | `GET /matches/{id}/momentum-curve` | Ball-by-ball WP with turning point |
| Leaderboards | `GET /leagues/{id}/final-over-specialists` | Over-20-only rankings (bowler or batter) |
| Matchups | `GET /matchups/optimal-bowler` | Best bowler to bring on vs a specific batter |
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    from cricveda_ingest.db import get_client
    get_client()
    logging.getLogger(__name__).info("CricVeda API started")
    yield


app = FastAPI(
    title="CricVeda API",
    description=_DESCRIPTION,
    version="1.0.0",
    lifespan=lifespan,
    contact={"name": "CricSynthesis", "url": "https://cricsynthesis.in"},
    license_info={"name": "Proprietary"},
    docs_url=None,
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Oracle", "description": "Probabilistic match-state analysis — win probability and collapse risk."},
        {"name": "Players", "description": "16 unique player analytics endpoints powered by ball-by-ball data."},
        {"name": "Venues", "description": "Venue toss intelligence and day/night dew factor analysis."},
        {"name": "Teams", "description": "Team batting depth and structural analytics."},
        {"name": "Matches", "description": "Per-match pitch reading and ball-by-ball momentum curves."},
        {"name": "Leaderboards", "description": "Phase-specific and situational player rankings."},
        {"name": "Matchups", "description": "Head-to-head optimal bowler recommendations."},
        {"name": "Keys", "description": "API key management for authenticated users."},
        {"name": "System", "description": "Health and operational endpoints."},
    ],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["X-API-Key"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
from cricveda_api.routes import (  # noqa: E402
    keys,
    leaderboards,
    matchups,
    matches,
    oracle,
    players,
    teams,
    venues,
)

app.include_router(oracle.router,       prefix="/v1", tags=["Oracle"])
app.include_router(players.router,      prefix="/v1", tags=["Players"])
app.include_router(venues.router,       prefix="/v1", tags=["Venues"])
app.include_router(teams.router,        prefix="/v1", tags=["Teams"])
app.include_router(matches.router,      prefix="/v1", tags=["Matches"])
app.include_router(leaderboards.router, prefix="/v1", tags=["Leaderboards"])
app.include_router(matchups.router,     prefix="/v1", tags=["Matchups"])
app.include_router(keys.router,         prefix="/v1", tags=["Keys"])


@app.get("/health", tags=["System"])
def health():
    """Service liveness check."""
    return {"status": "ok", "service": "cricveda-api", "version": "1.0.0"}


def _custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        contact=app.contact,
        license_info=app.license_info,
        tags=app.openapi_tags,
        routes=app.routes,
    )
    schema.setdefault("components", {}).setdefault("securitySchemes", {})
    schema["components"]["securitySchemes"]["ApiKeyAuth"] = {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
        "description": "Pass your CricVeda API key in this header.",
    }
    schema["security"] = [{"ApiKeyAuth": []}]
    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi


@app.get("/docs", include_in_schema=False)
async def scalar_playground() -> HTMLResponse:
    """Interactive API playground powered by Scalar."""
    return get_scalar_api_reference(
        openapi_url="/openapi.json",
        title="CricVeda API — Playground",
        dark_mode=True,
        persist_auth=True,
        default_open_all_tags=True,
        servers=[{"url": "https://api.cricsynthesis.in", "description": "Production"}],
        authentication={
            "preferredSecurityScheme": "ApiKeyAuth",
            "apiKey": {"token": ""},
        },
    )
