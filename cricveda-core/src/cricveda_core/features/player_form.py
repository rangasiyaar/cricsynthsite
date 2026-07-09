"""Player rolling form feature computation.

Reads from `fantasy_points` and `deliveries` tables and returns a DataFrame
of per-player form features as of a given cutoff date (no data leakage).

All queries are scoped to `cutoff_date` — only historical data is used.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd


# ============================================================
# Raw data fetchers (accept pre-loaded DataFrames for efficiency)
# ============================================================

def build_player_form_features(
    player_ids: list[int],
    cutoff_date: date,
    fp_df: pd.DataFrame,
    delivery_stats_df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Compute all rolling form features for a list of players as of cutoff_date.

    Args:
        player_ids: Players to compute features for.
        cutoff_date: Only use data strictly before this date.
        fp_df: fantasy_points joined with matches — must have columns:
               player_id, match_id, match_date, total_points, batting_points,
               bowling_points, fielding_points, training_exclude, league_id, format
        delivery_stats_df: Per-player-per-match batting/bowling aggregates — must have:
               player_id, match_id, match_date, format,
               runs, balls_faced, fours, sixes, dismissed,
               legal_deliveries, runs_conceded, wickets, maiden_overs

    Returns:
        DataFrame with one row per player_id, indexed by player_id.
    """
    # Filter to cutoff
    fp = fp_df[
        (fp_df["player_id"].isin(player_ids)) &
        (pd.to_datetime(fp_df["match_date"]).dt.date < cutoff_date) &
        (~fp_df["training_exclude"].fillna(False))
    ].copy()
    fp = fp.sort_values(["player_id", "match_date"])

    ds = delivery_stats_df[
        (delivery_stats_df["player_id"].isin(player_ids)) &
        (pd.to_datetime(delivery_stats_df["match_date"]).dt.date < cutoff_date)
    ].copy()
    ds = ds.sort_values(["player_id", "match_date"])

    rows: list[dict[str, Any]] = []

    for pid in player_ids:
        pf = fp[fp["player_id"] == pid]
        pd_ = ds[ds["player_id"] == pid]
        rows.append(_compute_player_features(pid, pf, pd_, cutoff_date))

    return pd.DataFrame(rows).set_index("player_id")


def _compute_player_features(
    player_id: int,
    fp: pd.DataFrame,
    ds: pd.DataFrame,
    cutoff_date: date,
) -> dict[str, Any]:
    feat: dict[str, Any] = {"player_id": player_id}

    # ---- Fantasy points rolling averages ----
    pts = fp["total_points"].values
    n = len(pts)

    feat["matches_total"] = n
    feat["fp_last3_avg"] = float(np.mean(pts[-3:])) if n >= 1 else 0.0
    feat["fp_last5_avg"] = float(np.mean(pts[-5:])) if n >= 1 else 0.0
    feat["fp_last10_avg"] = float(np.mean(pts[-10:])) if n >= 1 else 0.0
    feat["fp_std5"] = float(np.std(pts[-5:])) if n >= 2 else 0.0

    # Exponential weighted mean (more recent = higher weight)
    if n >= 1:
        weights = np.array([0.3 ** (n - 1 - i) for i in range(n)])
        feat["fp_ewm5"] = float(np.average(pts, weights=weights))
    else:
        feat["fp_ewm5"] = 0.0

    # Linear trend on last 5 points (positive = improving)
    if n >= 3:
        x = np.arange(min(n, 5))
        y = pts[-5:]
        feat["fp_trend"] = float(np.polyfit(x, y, 1)[0])
    else:
        feat["fp_trend"] = 0.0

    # Days since last match
    if n >= 1:
        last_date = pd.to_datetime(fp["match_date"].iloc[-1]).date()
        feat["days_since_last"] = (cutoff_date - last_date).days
    else:
        feat["days_since_last"] = 999  # never played

    # ---- Batting rolling stats ----
    bat = ds[ds["runs"].notna()]
    if len(bat) >= 1:
        last5 = bat.tail(5)
        last10 = bat.tail(10)

        feat["bat_runs_avg5"] = float(last5["runs"].mean())
        # Strike rate only when balls_faced >= 10
        sr_mask = last5["balls_faced"] >= 10
        if sr_mask.any():
            sr_vals = (last5.loc[sr_mask, "runs"] / last5.loc[sr_mask, "balls_faced"]) * 100
            feat["bat_sr_avg5"] = float(sr_vals.mean())
        else:
            feat["bat_sr_avg5"] = 0.0

        total_balls5 = last5["balls_faced"].sum()
        total_boundaries5 = (last5["fours"] + last5["sixes"]).sum()
        feat["bat_boundary_pct5"] = float(total_boundaries5 / total_balls5) if total_balls5 > 0 else 0.0

        # 50+ rate in last 10
        feat["bat_fifty_rate10"] = float((last10["runs"] >= 50).mean())
    else:
        feat["bat_runs_avg5"] = 0.0
        feat["bat_sr_avg5"] = 0.0
        feat["bat_boundary_pct5"] = 0.0
        feat["bat_fifty_rate10"] = 0.0

    # ---- Bowling rolling stats ----
    bowl = ds[ds["wickets"].notna()]
    if len(bowl) >= 1:
        last5b = bowl.tail(5)

        feat["bowl_wkts_avg5"] = float(last5b["wickets"].mean())

        # Economy only when overs >= 2 (12 legal deliveries)
        eco_mask = last5b["legal_deliveries"] >= 12
        if eco_mask.any():
            eco_overs = last5b.loc[eco_mask, "legal_deliveries"] / 6
            eco_vals = last5b.loc[eco_mask, "runs_conceded"] / eco_overs
            feat["bowl_eco_avg5"] = float(eco_vals.mean())
        else:
            feat["bowl_eco_avg5"] = 0.0

        # Bowling SR (balls per wicket)
        wkts5 = last5b["wickets"].sum()
        balls5 = last5b["legal_deliveries"].sum()
        feat["bowl_sr_avg5"] = float(balls5 / wkts5) if wkts5 > 0 else 0.0
    else:
        feat["bowl_wkts_avg5"] = 0.0
        feat["bowl_eco_avg5"] = 0.0
        feat["bowl_sr_avg5"] = 0.0

    return feat


# ============================================================
# Training data builder — returns feature matrix + targets
# ============================================================

def build_training_rows(
    fp_df: pd.DataFrame,
    delivery_stats_df: pd.DataFrame,
    min_prior_matches: int = 3,
) -> pd.DataFrame:
    """
    Build a row per (player_id, match_id) for training.

    For each match, compute form features using ONLY data strictly before that match
    (no leakage). Requires at least min_prior_matches historical matches per player.

    Returns DataFrame with columns: player_id, match_id, match_date, target_points,
    + all form feature columns.
    """
    fp_sorted = fp_df[~fp_df["training_exclude"].fillna(False)].sort_values(["player_id", "match_date"])
    rows: list[dict] = []

    for (pid,), group in fp_sorted.groupby("player_id"):
        group = group.reset_index(drop=True)
        for i in range(min_prior_matches, len(group)):
            cutoff = pd.to_datetime(group.at[i, "match_date"]).date()
            historical_fp = group.iloc[:i]
            historical_ds = delivery_stats_df[
                (delivery_stats_df["player_id"] == pid) &
                (pd.to_datetime(delivery_stats_df["match_date"]).dt.date < cutoff)
            ]
            feat = _compute_player_features(pid, historical_fp, historical_ds, cutoff)
            feat["match_id"] = group.at[i, "match_id"]
            feat["match_date"] = cutoff
            feat["target_points"] = group.at[i, "total_points"]
            rows.append(feat)

    return pd.DataFrame(rows)
