"""Train the MatchSynth ball-outcome model.

Usage:
    uv run python -m cricveda_core.matchsynth.train
    uv run python -m cricveda_core.matchsynth.train --cutoff 2024-01-01 --no-upload

Trains on balls before the cutoff, validates on later balls, and reports on
the IPL 2024 holdout, which is never used for fitting.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path

import click
import pandas as pd

from cricveda_core.matchsynth.ball_model import BallModel, build_ball_states

log = logging.getLogger(__name__)
MODELS_DIR = Path(__file__).resolve().parents[4] / "data" / "models"


def load_states() -> tuple[pd.DataFrame, pd.DataFrame]:
    from cricveda_ingest.db import fetch_all

    log.info("Loading matches, leagues, players...")
    matches = pd.DataFrame(fetch_all("matches", "match_id, league_id, season, match_date", order="match_id"))
    leagues = pd.DataFrame(fetch_all("leagues", "league_id, format", order="league_id"))
    players = pd.DataFrame(fetch_all("player_meta", "player_id, bowling_style", order="player_id"))
    log.info("Loading deliveries...")
    deliveries = pd.DataFrame(fetch_all(
        "deliveries",
        "delivery_id, match_id, innings, over_ball, striker_id, bowler_id, runs_total, extras_type, wicket_type",
        order="delivery_id",
    ))
    log.info("%d deliveries in %d matches", len(deliveries), len(matches))
    styles = dict(zip(players["player_id"], players["bowling_style"]))
    return build_ball_states(deliveries, matches, leagues, styles), matches


def train(states: pd.DataFrame, matches: pd.DataFrame, cutoff: str, version: str) -> BallModel:
    m = matches.set_index("match_id")
    is_holdout = (m["league_id"] == "ipl") & (m["season"].astype(str) == "2024")
    holdout_ids = set(m.index[is_holdout])
    dates = pd.to_datetime(states["match_id"].map(m["match_date"]))
    holdout = states[states["match_id"].isin(holdout_ids)]
    rest = states[~states["match_id"].isin(holdout_ids)]
    train_part = rest[dates.loc[rest.index] < pd.Timestamp(cutoff)]
    val = rest[dates.loc[rest.index] >= pd.Timestamp(cutoff)]
    log.info("Balls — train %d | validation %d | IPL 2024 holdout %d", len(train_part), len(val), len(holdout))

    model = BallModel.fit(train_part, version=version)
    model.metrics = {
        "validation": model.evaluate(val) if len(val) else {},
        "holdout_ipl_2024": model.evaluate(holdout) if len(holdout) else {},
    }
    for name, r in model.metrics.items():
        if r:
            log.info("%s: log-loss %.4f vs situation-only %.4f (%.2f%% better)",
                     name, r["log_loss"], r["context_only_log_loss"], r["improvement_pct"])
    return model


def upload(path: Path) -> None:
    bucket = os.getenv("MODEL_BUCKET", "cricveda-models")
    from cricveda_ingest.db import get_client
    get_client().storage.from_(bucket).upload(
        "ball_model_latest.npz", path.read_bytes(),
        {"content-type": "application/octet-stream", "upsert": "true"},
    )
    log.info("Uploaded %s to bucket '%s'", path.name, bucket)


@click.command()
@click.option("--cutoff", default="2024-01-01", show_default=True, help="Train on balls before this date.")
@click.option("--version", default=None, help="Defaults to YYYYMMDD.")
@click.option("--no-upload", is_flag=True)
def main(cutoff: str, version: str | None, no_upload: bool) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    version = version or datetime.now().strftime("%Y%m%d")
    states, matches = load_states()
    model = train(states, matches, cutoff, version)
    model.save(MODELS_DIR / f"ball_model_{version}.npz")
    latest = MODELS_DIR / "ball_model_latest.npz"
    model.save(latest)
    log.info("Saved %s", latest)
    if not no_upload:
        upload(latest)


if __name__ == "__main__":
    main()
