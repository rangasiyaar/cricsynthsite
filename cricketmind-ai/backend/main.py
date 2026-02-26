"""CricVeda AI 1.0 — FastAPI Backend

REST API for cricket fixtures, scorecards, squads, and AI predictions.
Wraps existing Sportmonks client and CrewAI pipeline.

Run: uvicorn backend.main:app --reload --port 8000
"""

import sys
from pathlib import Path

# Ensure backend modules are importable
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from data.sportmonks_client import SportmonksClient
from utils.config import SPORTMONKS_API_KEY, GEMINI_API_KEY, PREDICTIONS_DIR
from utils.logger import get_logger

logger = get_logger(__name__)

app = FastAPI(
    title="CricVeda AI 1.0",
    description="Cricket analytics and AI-powered player predictions",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_client = SportmonksClient() if SPORTMONKS_API_KEY else None


def _require_client() -> SportmonksClient:
    if not _client:
        raise HTTPException(status_code=503, detail="SPORTMONKS_API_KEY not configured")
    return _client


# -- Health -------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "sportmonks": bool(SPORTMONKS_API_KEY),
        "gemini": bool(GEMINI_API_KEY),
    }


# -- Fixtures -----------------------------------------------------------------

@app.get("/api/fixtures/upcoming")
def fixtures_upcoming(limit: int = 5):
    client = _require_client()
    fixtures = client.get_upcoming_fixtures()
    return {"data": fixtures[:limit]}


@app.get("/api/fixtures/live")
def fixtures_live():
    client = _require_client()
    return {"data": client.get_live_fixtures()}


@app.get("/api/fixtures/recent")
def fixtures_recent(limit: int = 10):
    client = _require_client()
    fixtures = client.get_recent_fixtures(limit=limit)
    return {"data": fixtures[:limit]}


# -- Fixture Detail -----------------------------------------------------------

@app.get("/api/fixtures/{fixture_id}/detail")
def fixture_detail(fixture_id: int):
    client = _require_client()
    detail = client.get_fixture_detail(fixture_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Fixture not found")
    return {"data": detail}


@app.get("/api/fixtures/{fixture_id}/scorecard")
def fixture_scorecard(fixture_id: int):
    client = _require_client()
    sc = client.get_fixture_scorecard(fixture_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Scorecard not available")
    return {"data": sc}


@app.get("/api/fixtures/{fixture_id}/squads")
def fixture_squads(fixture_id: int):
    client = _require_client()
    lineups = client.get_fixture_lineups(fixture_id)
    if not lineups:
        lineups = client.get_fixture_squads(fixture_id)
    return {"data": lineups}


# -- Predictions --------------------------------------------------------------

@app.post("/api/predict/{fixture_id}")
def predict(fixture_id: int):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY not configured")
    _require_client()

    try:
        from orchestrator.pipeline import run_prediction
        result = run_prediction(str(fixture_id), format_type="t20")
        if result:
            return {"data": result}
        raise HTTPException(status_code=500, detail="Prediction returned no result")
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error("Prediction failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/predictions")
def list_predictions():
    predictions = []
    if PREDICTIONS_DIR.exists():
        import json
        for f in sorted(PREDICTIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    predictions.append({
                        "match_id": data.get("match_id", f.stem),
                        "match": data.get("match", f.stem),
                        "format": data.get("format", ""),
                        "venue": data.get("venue", ""),
                        "date": data.get("date", ""),
                        "generated_at": data.get("prediction_generated_at", ""),
                    })
            except Exception:
                continue
    return {"data": predictions}


@app.get("/api/predictions/{match_id}")
def get_prediction(match_id: str):
    import json
    if PREDICTIONS_DIR.exists():
        for f in PREDICTIONS_DIR.glob("*.json"):
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    if data.get("match_id") == match_id or f.stem == match_id:
                        return {"data": data}
            except Exception:
                continue
    raise HTTPException(status_code=404, detail="Prediction not found")
