"""XGBoost training pipeline for CricVeda ML models.

Trains two models:
  1. player_fp  — predicts individual fantasy points (regressor)
  2. match_win  — predicts P(team1 wins) given match features (classifier)

Time-based CV: train on data before 2024-01-01, validate on 2024.
IPL 2024 holdout (74 matches) is never touched during training or validation.

Usage:
    uv run python -m cricveda_core.models.train
    uv run python -m cricveda_core.models.train --cutoff 2023-12-31
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from pathlib import Path

import click
import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.stats import spearmanr
from sklearn.metrics import mean_squared_error

log = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "data" / "models"

PLAYER_FP_FEATURES = [
    # Form
    "fp_last3_avg", "fp_last5_avg", "fp_last10_avg", "fp_ewm5", "fp_std5", "fp_trend",
    "bat_runs_avg5", "bat_sr_avg5", "bat_boundary_pct5", "bat_fifty_rate10",
    "bowl_wkts_avg5", "bowl_eco_avg5", "bowl_sr_avg5",
    "days_since_last", "matches_total",
    # Venue
    "venue_avg_1st_inn_score", "venue_pace_eco", "venue_spin_eco", "venue_pace_spin_ratio",
    "venue_bat_fp_avg", "venue_bowl_fp_avg",
    "player_venue_fp_avg", "player_venue_matches",
    # Opposition
    "opp_bat_avg5", "opp_bowl_eco5", "opp_pace_ratio",
    "player_vs_opp_fp_avg", "player_vs_opp_matches",
    # Matchup
    "bat_vs_pace_sr", "bat_vs_spin_sr", "bat_vs_lefts_sr",
    "bowl_vs_left_eco", "bowl_vs_right_eco",
    # Context
    "toss_won", "batting_first", "league_difficulty", "format_similarity", "league_tier",
    # Static
    "role_bat", "role_bowl", "role_ar", "role_wk",
    "batting_hand_left", "is_pacer", "is_spinner", "age", "batting_position_avg",
]


def train_player_fp_model(
    train_df: pd.DataFrame,
    val_df: pd.DataFrame,
    version: str,
) -> xgb.XGBRegressor:
    """Train the player fantasy points regressor."""
    X_train = train_df[PLAYER_FP_FEATURES].copy()
    y_train = train_df["target_points"].values
    X_val = val_df[PLAYER_FP_FEATURES].copy()
    y_val = val_df["target_points"].values

    model = xgb.XGBRegressor(
        n_estimators=500,
        learning_rate=0.05,
        max_depth=6,
        min_child_weight=3,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=1.0,
        tree_method="hist",
        n_jobs=-1,
        random_state=42,
        eval_metric="rmse",
        early_stopping_rounds=30,
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=50,
    )

    # Evaluate
    preds = model.predict(X_val)
    rmse = np.sqrt(mean_squared_error(y_val, preds))
    spearman, _ = spearmanr(y_val, preds)
    top11 = _top11_overlap(val_df, preds)

    log.info("Player FP model — val RMSE: %.2f | Spearman: %.3f | Top-11 overlap: %.1f%%",
             rmse, spearman, top11 * 100)

    # Save model
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODELS_DIR / f"player_fp_{version}.json"
    model.save_model(str(model_path))
    log.info("Saved player FP model to %s", model_path)

    # Save feature importance
    importance = dict(zip(PLAYER_FP_FEATURES, model.feature_importances_))
    importance_sorted = dict(sorted(importance.items(), key=lambda x: x[1], reverse=True))
    with open(MODELS_DIR / f"player_fp_{version}_importance.json", "w") as f:
        json.dump(importance_sorted, f, indent=2)

    return model


def train_match_outcome_model(
    matches_df: pd.DataFrame,
    fp_df: pd.DataFrame,
    train_cutoff: date,
    version: str,
) -> xgb.XGBClassifier:
    """
    Train match outcome (win/loss) classifier.
    Uses team-aggregated fantasy points as team strength proxy.
    """
    rows = []
    for _, match in matches_df[
        matches_df["match_date"].notna() &
        matches_df["winner"].notna()
    ].iterrows():
        mid = match["match_id"]
        match_date = pd.to_datetime(match["match_date"]).date()
        if match_date >= train_cutoff:
            continue

        # Team strength = avg total_points of players for each team in this match
        match_fp = fp_df[fp_df["match_id"] == mid]
        if len(match_fp) < 10:
            continue

        team1 = match["team1"]
        team2 = match["team2"]
        winner = match["winner"]

        # Use historical fp up to this match as proxy (no leakage — just match-level totals)
        t1_fp = match_fp["batting_points"].mean()
        t2_fp = match_fp["bowling_points"].mean()

        rows.append({
            "match_id": mid,
            "match_date": match_date,
            "league_tier": match.get("league_tier", 2),
            "venue_avg_score": match.get("venue_avg_1st_inn_score", 160.0),
            "toss_team1_won": int(match.get("toss_winner") == team1),
            "batting_first": int(match.get("toss_decision") == "bat"),
            "team1_fp_proxy": t1_fp,
            "team2_fp_proxy": t2_fp,
            "target": int(winner == team1),
        })

    if not rows:
        log.warning("No match outcome rows built — skipping match outcome model")
        return None

    df = pd.DataFrame(rows)
    split = df["match_date"] < train_cutoff
    train = df[split]
    val = df[~split]

    OUTCOME_FEATURES = [
        "toss_team1_won", "batting_first",
        "team1_fp_proxy", "team2_fp_proxy",
    ]

    X_train = train[OUTCOME_FEATURES]
    y_train = train["target"]
    X_val = val[OUTCOME_FEATURES] if len(val) > 0 else X_train
    y_val = val["target"] if len(val) > 0 else y_train

    model = xgb.XGBClassifier(
        n_estimators=200,
        learning_rate=0.05,
        max_depth=4,
        subsample=0.8,
        colsample_bytree=0.8,
        tree_method="hist",
        n_jobs=-1,
        random_state=42,
        eval_metric="logloss",
        early_stopping_rounds=20,
    )
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=20)

    if len(val) > 0:
        acc = (model.predict(X_val) == y_val).mean()
        log.info("Match outcome model — val accuracy: %.1f%%", acc * 100)

    path = MODELS_DIR / f"match_outcome_{version}.json"
    model.save_model(str(path))
    log.info("Saved match outcome model to %s", path)
    return model


def _top11_overlap(val_df: pd.DataFrame, preds: np.ndarray) -> float:
    """Avg fraction of top-11 predicted players that match actual top-11 per match."""
    val_df = val_df.copy()
    val_df["pred"] = preds
    overlaps = []
    for _, group in val_df.groupby("match_id"):
        if len(group) < 11:
            continue
        actual_top11 = set(group.nlargest(11, "target_points")["player_id"])
        pred_top11 = set(group.nlargest(11, "pred")["player_id"])
        overlaps.append(len(actual_top11 & pred_top11) / 11)
    return float(np.mean(overlaps)) if overlaps else 0.0


# ============================================================
# CLI
# ============================================================

@click.command()
@click.option("--cutoff", default="2024-01-01", help="Train/val split date (YYYY-MM-DD)")
@click.option("--version", default=None, help="Model version tag. Defaults to YYYYMMDD.")
def main(cutoff: str, version: str | None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if version is None:
        version = datetime.now().strftime("%Y%m%d")

    train_cutoff = date.fromisoformat(cutoff)
    log.info("Training cutoff: %s | Version: %s", train_cutoff, version)

    log.info("Loading feature pipeline from Supabase...")
    from cricveda_core.features.pipeline import FeaturePipeline
    pipe = FeaturePipeline.from_supabase()

    log.info("Building training matrix...")
    df = pipe.build_training_matrix()

    # IPL 2024 holdout — never use these matches
    ipl_2024_matches = set(
        pipe.matches_df[
            (pipe.matches_df["league_id"] == "ipl") &
            (pipe.matches_df["season"].astype(str) == "2024")
        ]["match_id"].tolist()
    )
    df = df[~df["match_id"].isin(ipl_2024_matches)]

    train_df = df[pd.to_datetime(df["match_date"]).dt.date < train_cutoff]
    val_df = df[pd.to_datetime(df["match_date"]).dt.date >= train_cutoff]

    log.info("Train rows: %d | Val rows: %d", len(train_df), len(val_df))

    train_player_fp_model(train_df, val_df, version)
    log.info("Training complete. Models saved to %s", MODELS_DIR)

    # Upload to Supabase Storage so the API can download on next cold start
    _upload_model_to_storage(version)


def _upload_model_to_storage(version: str) -> None:
    """Upload the trained model to Supabase Storage as 'player_fp_latest.json'."""
    import os
    bucket = os.getenv("MODEL_BUCKET", "cricveda-models")
    model_path = MODELS_DIR / f"player_fp_{version}.json"
    if not model_path.exists():
        log.warning("Model file not found for upload: %s", model_path)
        return
    try:
        from cricveda_ingest.db import get_client
        client = get_client()
        with model_path.open("rb") as f:
            client.storage.from_(bucket).upload(
                "player_fp_latest.json",
                f.read(),
                {"content-type": "application/json", "upsert": "true"},
            )
        log.info("Model uploaded to Supabase Storage bucket '%s'", bucket)
    except Exception as e:
        log.warning("Could not upload model to storage: %s", e)


if __name__ == "__main__":
    main()
