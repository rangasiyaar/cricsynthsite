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

Power your cricket products with machine-learning predictions backed by
15,000+ international and domestic matches.

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
https://api.cricsynthesis.com/v1
```

### Endpoints at a glance
| Endpoint | What it returns |
|---|---|
| `GET /matches/upcoming` | Scheduled T20 / ODI fixtures |
| `GET /matches/{id}/prediction` | Per-player fantasy point predictions |
| `GET /matches/{id}/dream-team` | Optimal Dream11 XI (LP optimizer) |
| `GET /players/{id}/form` | Rolling form, trend, recent scores |
| `GET /players/{id}/vs/{type}` | Batter SR or bowler eco vs pace / spin / left-arm |
"""


def _download_model_if_available() -> None:
    """Download the latest trained model from Supabase Storage into /tmp on startup."""
    import os
    from pathlib import Path

    bucket = os.getenv("MODEL_BUCKET", "cricveda-models")
    model_path = Path("/tmp/player_fp_latest.json")

    if model_path.exists():
        logging.getLogger(__name__).info("Model already cached at %s", model_path)
        return

    try:
        from cricveda_ingest.db import get_client
        client = get_client()
        data = client.storage.from_(bucket).download("player_fp_latest.json")
        model_path.write_bytes(data)
        logging.getLogger(__name__).info("Model downloaded from Supabase Storage → %s", model_path)
    except Exception as e:
        # Non-fatal — prediction endpoints will return 404 until a model is uploaded
        logging.getLogger(__name__).warning("Model not available in storage: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from cricveda_ingest.db import get_client
    get_client()
    _download_model_if_available()
    logging.getLogger(__name__).info("CricVeda API started")
    yield


app = FastAPI(
    title="CricVeda API",
    description=_DESCRIPTION,
    version="0.1.0",
    lifespan=lifespan,
    contact={"name": "CricSynthesis", "url": "https://cricsynthesis.com"},
    license_info={"name": "Proprietary"},
    # Disable default Swagger; we use Scalar instead
    docs_url=None,
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Matches", "description": "Upcoming fixtures and metadata."},
        {"name": "Predictions", "description": "ML-powered player and match predictions."},
        {"name": "Players", "description": "Player form, stats, and matchup analysis."},
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
from cricveda_api.routes import keys, matches, players, predictions  # noqa: E402

app.include_router(matches.router, prefix="/v1", tags=["Matches"])
app.include_router(predictions.router, prefix="/v1", tags=["Predictions"])
app.include_router(players.router, prefix="/v1", tags=["Players"])
app.include_router(keys.router, prefix="/v1", tags=["Keys"])


@app.get("/health", tags=["System"])
def health():
    """Service liveness check."""
    return {"status": "ok", "service": "cricveda-api", "version": "0.1.0"}


# Inject API key security scheme into OpenAPI so Scalar shows the auth widget
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
    # Apply security globally
    schema["security"] = [{"ApiKeyAuth": []}]
    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi


# ── Interactive API playground (Scalar) ───────────────────────────────────────
@app.get("/docs", include_in_schema=False)
async def scalar_playground() -> HTMLResponse:
    """Interactive API playground powered by Scalar."""
    return get_scalar_api_reference(
        openapi_url="/openapi.json",
        title="CricVeda API — Playground",
        dark_mode=True,
        persist_auth=True,
        default_open_all_tags=True,
        servers=[{"url": "https://api.cricsynthesis.com", "description": "Production"}],
        authentication={
            "preferredSecurityScheme": "ApiKeyAuth",
            "apiKey": {"token": ""},
        },
    )
