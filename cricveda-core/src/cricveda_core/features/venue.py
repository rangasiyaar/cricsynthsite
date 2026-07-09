"""Venue and player-at-venue feature computation."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

PACE_STYLES = {"right-arm-fast", "right-arm-medium", "left-arm-fast"}
SPIN_STYLES = {"right-arm-off-break", "right-arm-leg-break", "slow-left-arm"}


def build_venue_features(
    venue_id: int,
    deliveries_df: pd.DataFrame,
    matches_df: pd.DataFrame,
    fp_df: pd.DataFrame,
    player_bowling_styles: dict[int, str],
) -> dict[str, float]:
    """
    Compute venue-level features from historical deliveries.

    Args:
        venue_id: The venue to compute features for.
        deliveries_df: All deliveries — needs match_id, runs_total, striker_id, bowler_id, extras_type, over_ball.
        matches_df: All matches — needs match_id, venue_id.
        fp_df: fantasy_points — needs player_id, match_id, batting_points, bowling_points.
        player_bowling_styles: {player_id: bowling_style_enum_value}

    Returns:
        Dict of venue feature name → value.
    """
    venue_match_ids = matches_df[matches_df["venue_id"] == venue_id]["match_id"].tolist()
    if not venue_match_ids:
        return _empty_venue_features()

    venue_del = deliveries_df[deliveries_df["match_id"].isin(venue_match_ids)].copy()

    feat: dict[str, float] = {}

    # ---- Average first innings total ----
    first_inn = venue_del[venue_del["innings"] == 1]
    if len(first_inn) > 0:
        inn_totals = first_inn.groupby("match_id")["runs_total"].sum()
        feat["venue_avg_1st_inn_score"] = float(inn_totals.mean())
    else:
        feat["venue_avg_1st_inn_score"] = 160.0  # T20 baseline

    # ---- Pace and spin economy at venue ----
    legal = venue_del[~venue_del["extras_type"].isin(["wides", "noballs"])].copy()

    pace_del = legal[legal["bowler_id"].map(
        lambda bid: player_bowling_styles.get(bid, "") in PACE_STYLES
    )]
    spin_del = legal[legal["bowler_id"].map(
        lambda bid: player_bowling_styles.get(bid, "") in SPIN_STYLES
    )]

    feat["venue_pace_eco"] = _compute_economy(pace_del)
    feat["venue_spin_eco"] = _compute_economy(spin_del)

    pace_eco = feat["venue_pace_eco"]
    spin_eco = feat["venue_spin_eco"]
    feat["venue_pace_spin_ratio"] = pace_eco / spin_eco if spin_eco > 0 else 1.0

    # ---- Avg batting/bowling fantasy points at venue ----
    venue_fp = fp_df[fp_df["match_id"].isin(venue_match_ids)]
    feat["venue_bat_fp_avg"] = float(venue_fp["batting_points"].mean()) if len(venue_fp) > 0 else 20.0
    feat["venue_bowl_fp_avg"] = float(venue_fp["bowling_points"].mean()) if len(venue_fp) > 0 else 10.0

    return feat


def build_player_venue_features(
    player_id: int,
    venue_id: int,
    cutoff_date,
    deliveries_df: pd.DataFrame,
    matches_df: pd.DataFrame,
    fp_df: pd.DataFrame,
) -> dict[str, float]:
    """
    Compute this player's historical performance at this specific venue.
    """
    venue_match_ids = set(
        matches_df[
            (matches_df["venue_id"] == venue_id) &
            (pd.to_datetime(matches_df["match_date"]).dt.date < cutoff_date)
        ]["match_id"].tolist()
    )

    player_fp_at_venue = fp_df[
        (fp_df["player_id"] == player_id) &
        (fp_df["match_id"].isin(venue_match_ids))
    ]

    n = len(player_fp_at_venue)
    return {
        "player_venue_fp_avg": float(player_fp_at_venue["total_points"].mean()) if n > 0 else float("nan"),
        "player_venue_matches": n,
    }


def _compute_economy(del_df: pd.DataFrame) -> float:
    if len(del_df) == 0:
        return 7.5
    total_runs = del_df["runs_total"].sum()
    total_overs = len(del_df) / 6.0
    return float(total_runs / total_overs) if total_overs > 0 else 7.5


def _empty_venue_features() -> dict[str, float]:
    return {
        "venue_avg_1st_inn_score": 160.0,
        "venue_pace_eco": 7.5,
        "venue_spin_eco": 7.5,
        "venue_pace_spin_ratio": 1.0,
        "venue_bat_fp_avg": 20.0,
        "venue_bowl_fp_avg": 10.0,
    }
