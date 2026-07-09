"""Inference pipeline — generate predictions for an upcoming match.

Loads a trained XGBoost model, builds feature vectors for all squad players,
writes predictions to the `predictions` table in Supabase.

Usage:
    uv run python -m cricveda_core.models.predict --upcoming-id 1
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import click
import pandas as pd
import xgboost as xgb

from cricveda_core.models.train import PLAYER_FP_FEATURES

log = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "models"
_TMP_MODEL = Path("/tmp/player_fp_latest.json")


def load_latest_model(models_dir: Path = MODELS_DIR) -> tuple[xgb.XGBRegressor, str]:
    """Load the most recently saved player_fp model.

    Search order:
    1. /tmp/player_fp_latest.json  (downloaded from Supabase Storage at API startup)
    2. data/models/player_fp_*.json (local training output)
    """
    if _TMP_MODEL.exists():
        model = xgb.XGBRegressor()
        model.load_model(str(_TMP_MODEL))
        return model, "latest"

    model_files = sorted(models_dir.glob("player_fp_*.json"))
    if not model_files:
        raise FileNotFoundError(f"No player_fp model found in {models_dir}. Run train.py first.")
    latest = model_files[-1]
    log.info("Loading model: %s", latest)
    model = xgb.XGBRegressor()
    model.load_model(str(latest))
    return model, latest.stem.replace("player_fp_", "")


def predict_for_upcoming(upcoming_id: int) -> list[dict]:
    """
    Generate fantasy point predictions for all players in an upcoming match.

    Returns list of prediction dicts ready for Supabase upsert.
    """
    from cricveda_ingest.db import get_client
    client = get_client()

    # Load upcoming match details
    um = client.table("upcoming_matches").select("*").eq("upcoming_id", upcoming_id).execute()
    if not um.data:
        raise ValueError(f"upcoming_id {upcoming_id} not found")
    match = um.data[0]

    # Load squad
    squad = (
        client.table("squad_selections")
        .select("player_id, team, credits, batting_order, is_playing_xi")
        .eq("upcoming_id", upcoming_id)
        .eq("is_playing_xi", True)
        .execute()
    )
    if not squad.data:
        raise ValueError(f"No squad found for upcoming_id {upcoming_id}")

    player_ids = [r["player_id"] for r in squad.data]
    player_teams = {r["player_id"]: r["team"] for r in squad.data}
    player_credits = {r["player_id"]: r["credits"] for r in squad.data}

    match_date = pd.to_datetime(match["match_date"]).date()

    log.info("Building feature pipeline for %s vs %s on %s (%d players)...",
             match["team1"], match["team2"], match_date, len(player_ids))

    from cricveda_core.features.pipeline import FeaturePipeline
    pipe = FeaturePipeline.from_supabase()

    X = pipe.build_inference_matrix(
        player_ids=player_ids,
        player_teams=player_teams,
        team1=match["team1"],
        team2=match["team2"],
        match_date=match_date,
        venue_id=match.get("venue_id"),
        league_id=match["league_id"],
        toss_winner=match.get("toss_winner"),
        toss_decision=match.get("toss_decision"),
    )

    model, version = load_latest_model()
    X_feat = X[PLAYER_FP_FEATURES].copy()
    preds = model.predict(X_feat)

    predictions = []
    for pid, pred_pts in zip(X.index, preds):
        predictions.append({
            "player_id": int(pid),
            "upcoming_id": upcoming_id,
            "predicted_points": round(float(pred_pts), 2),
            "credits": player_credits.get(pid, 8.0),
            "team": player_teams.get(pid, match["team1"]),
            "model_version": version,
            "predicted_at": datetime.now().isoformat(),
        })

    # Sort by predicted points for easy review
    predictions.sort(key=lambda x: x["predicted_points"], reverse=True)

    log.info("Top 5 predicted players:")
    for p in predictions[:5]:
        log.info("  player_id=%s  pts=%.1f  credits=%.1f  team=%s",
                 p["player_id"], p["predicted_points"], p["credits"], p["team"])

    return predictions


def write_predictions_to_db(upcoming_id: int, predictions: list[dict]) -> None:
    """Write predictions to Supabase upcoming_predictions table."""
    from cricveda_ingest.db import get_client
    client = get_client()

    # We store predictions in a simple format alongside upcoming_matches
    # Using the existing `predictions` table with match_id as upcoming_id for now
    rows = [
        {
            "player_id": p["player_id"],
            "match_id": upcoming_id,     # upcoming_id used as proxy until match is confirmed
            "predicted_points": p["predicted_points"],
            "confidence": None,
            "model_version": p["model_version"],
        }
        for p in predictions
    ]
    client.table("predictions").upsert(
        rows, on_conflict="player_id,match_id,model_version"
    ).execute()
    log.info("Wrote %d predictions to DB", len(rows))


# ============================================================
# CLI
# ============================================================

@click.command()
@click.option("--upcoming-id", required=True, type=int, help="upcoming_matches.upcoming_id to predict for")
@click.option("--write-db", is_flag=True, default=False, help="Write predictions to Supabase")
def main(upcoming_id: int, write_db: bool) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    predictions = predict_for_upcoming(upcoming_id)

    click.echo(f"\nPredictions for upcoming match {upcoming_id}:")
    click.echo(f"{'Player ID':<12} {'Predicted Pts':>14} {'Credits':>8} {'Team':<20}")
    click.echo("-" * 60)
    for p in predictions:
        click.echo(f"{p['player_id']:<12} {p['predicted_points']:>14.1f} {p['credits']:>8.1f} {p['team']:<20}")

    if write_db:
        write_predictions_to_db(upcoming_id, predictions)
        click.echo("\n✅ Predictions written to Supabase.")


if __name__ == "__main__":
    main()
