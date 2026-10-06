"""Loads the MatchSynth ball model once per process.

Looks in data/models (local dev) then /tmp, and otherwise downloads
`ball_model_latest.npz` from the Supabase Storage bucket the training
workflow uploads to.
"""
from __future__ import annotations

import logging
import os
import threading
from pathlib import Path

from fastapi import HTTPException, status

log = logging.getLogger(__name__)

_LOCAL = Path(__file__).resolve().parents[3] / "data" / "models" / "ball_model_latest.npz"
_TMP = Path("/tmp/ball_model_latest.npz")
_lock = threading.Lock()
_model = None


def _download() -> Path:
    from cricveda_ingest.db import get_client
    bucket = os.getenv("MODEL_BUCKET", "cricveda-models")
    data = get_client().storage.from_(bucket).download("ball_model_latest.npz")
    _TMP.write_bytes(data)
    return _TMP


def get_ball_model():
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is None:
            from cricveda_core.matchsynth.ball_model import BallModel
            try:
                path = _LOCAL if _LOCAL.exists() else (_TMP if _TMP.exists() else _download())
                _model = BallModel.load(path)
                log.info("MatchSynth model %s loaded from %s", _model.version, path)
            except Exception as e:
                log.error("MatchSynth model unavailable: %s", e)
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="The MatchSynth model isn't available yet. Try again shortly.",
                )
    return _model


def set_ball_model(model) -> None:
    """For tests and for hot-reloading after retraining."""
    global _model
    _model = model
