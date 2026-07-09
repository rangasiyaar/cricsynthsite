"""Walk-forward backtesting harness.

Evaluates model quality by simulating real prediction conditions:
- Train on data before window start
- Predict window (90 days by default)
- Advance window by 30 days
- Report Spearman rank correlation + top-11 overlap per window

Usage:
    uv run python -m cricveda_core.evaluation.backtest
    uv run python -m cricveda_core.evaluation.backtest --start 2023-01-01 --end 2024-01-01
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

import click
import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.stats import spearmanr
from sklearn.metrics import mean_squared_error

from cricveda_core.models.train import PLAYER_FP_FEATURES, train_player_fp_model

log = logging.getLogger(__name__)


def run_backtest(
    df: pd.DataFrame,
    start_date: date,
    end_date: date,
    window_days: int = 90,
    step_days: int = 30,
    min_train_rows: int = 1000,
) -> pd.DataFrame:
    """
    Walk-forward backtest over rolling windows.

    Args:
        df: Full feature matrix with target_points and match_date.
        start_date: First window start (train cutoff).
        end_date: Last window end.
        window_days: Size of each validation window in days.
        step_days: How far to advance the window each iteration.

    Returns:
        DataFrame with one row per window: window_start, window_end,
        n_train, n_val, rmse, spearman, top11_overlap.
    """
    df = df.copy()
    df["match_date"] = pd.to_datetime(df["match_date"]).dt.date

    results = []
    cursor = start_date

    while cursor + timedelta(days=window_days) <= end_date:
        window_end = cursor + timedelta(days=window_days)

        train_df = df[df["match_date"] < cursor]
        val_df = df[(df["match_date"] >= cursor) & (df["match_date"] < window_end)]

        if len(train_df) < min_train_rows or len(val_df) < 50:
            cursor += timedelta(days=step_days)
            continue

        # Quick model fit (fewer estimators for speed during backtest)
        X_train = train_df[PLAYER_FP_FEATURES].copy()
        y_train = train_df["target_points"].values
        X_val = val_df[PLAYER_FP_FEATURES].copy()
        y_val = val_df["target_points"].values

        model = xgb.XGBRegressor(
            n_estimators=200,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.8,
            colsample_bytree=0.8,
            tree_method="hist",
            n_jobs=-1,
            random_state=42,
        )
        model.fit(X_train, y_train, verbose=False)
        preds = model.predict(X_val)

        rmse = float(np.sqrt(mean_squared_error(y_val, preds)))
        spearman, _ = spearmanr(y_val, preds)
        top11 = _top11_overlap(val_df, preds)

        results.append({
            "window_start": cursor,
            "window_end": window_end,
            "n_train": len(train_df),
            "n_val": len(val_df),
            "rmse": round(rmse, 2),
            "spearman": round(float(spearman), 4),
            "top11_overlap_pct": round(top11 * 100, 1),
        })

        log.info(
            "Window %s→%s | train=%d val=%d | RMSE=%.2f Spearman=%.3f Top11=%.1f%%",
            cursor, window_end, len(train_df), len(val_df), rmse, spearman, top11 * 100,
        )

        cursor += timedelta(days=step_days)

    return pd.DataFrame(results)


def _top11_overlap(val_df: pd.DataFrame, preds: np.ndarray) -> float:
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


def print_summary(results_df: pd.DataFrame) -> None:
    if results_df.empty:
        log.warning("No backtest windows completed.")
        return
    click.echo("\n=== Backtest Results ===")
    click.echo(results_df.to_string(index=False))
    click.echo(f"\nMean Spearman:    {results_df['spearman'].mean():.3f}")
    click.echo(f"Mean RMSE:        {results_df['rmse'].mean():.2f}")
    click.echo(f"Mean Top-11 (%):  {results_df['top11_overlap_pct'].mean():.1f}")

    spearman_mean = results_df["spearman"].mean()
    if spearman_mean >= 0.4:
        click.echo("\n✅ Model quality: GOOD (Spearman ≥ 0.4)")
    elif spearman_mean >= 0.3:
        click.echo("\n⚠️  Model quality: ACCEPTABLE (Spearman ≥ 0.3)")
    else:
        click.echo("\n❌ Model quality: POOR (Spearman < 0.3) — more data or features needed")


# ============================================================
# CLI
# ============================================================

@click.command()
@click.option("--start", default="2022-01-01", help="Backtest start date")
@click.option("--end", default="2024-01-01", help="Backtest end date")
@click.option("--window", default=90, help="Validation window days")
@click.option("--step", default=30, help="Step size days")
def main(start: str, end: str, window: int, step: int) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    log.info("Loading feature pipeline from Supabase...")
    from cricveda_core.features.pipeline import FeaturePipeline
    pipe = FeaturePipeline.from_supabase()

    log.info("Building training matrix...")
    df = pipe.build_training_matrix()

    results = run_backtest(
        df,
        start_date=date.fromisoformat(start),
        end_date=date.fromisoformat(end),
        window_days=window,
        step_days=step,
    )

    print_summary(results)


if __name__ == "__main__":
    main()
