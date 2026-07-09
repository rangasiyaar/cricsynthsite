"""Opposition strength and batter/bowler matchup features."""
from __future__ import annotations

from datetime import date

import pandas as pd

PACE_STYLES = {"right-arm-fast", "right-arm-medium", "left-arm-fast"}
SPIN_STYLES = {"right-arm-off-break", "right-arm-leg-break", "slow-left-arm"}


# ============================================================
# Opposition team strength
# ============================================================

def build_opposition_features(
    player_team: str,
    opposition_team: str,
    cutoff_date: date,
    matches_df: pd.DataFrame,
    fp_df: pd.DataFrame,
    n_matches: int = 5,
) -> dict[str, float]:
    """
    Opposition team's recent aggregate batting and bowling strength.

    Uses fantasy_points aggregated per team per match as a proxy for team strength.
    """
    # Find recent matches involving the opposition team
    opp_matches = matches_df[
        ((matches_df["team1"] == opposition_team) | (matches_df["team2"] == opposition_team)) &
        (pd.to_datetime(matches_df["match_date"]).dt.date < cutoff_date)
    ].sort_values("match_date").tail(n_matches)

    opp_match_ids = opp_matches["match_id"].tolist()

    if not opp_match_ids:
        return _empty_opposition_features()

    opp_fp = fp_df[fp_df["match_id"].isin(opp_match_ids)]

    opp_bat_avg = float(opp_fp["batting_points"].mean()) if len(opp_fp) > 0 else 15.0
    opp_bowl_avg = float(opp_fp["bowling_points"].mean()) if len(opp_fp) > 0 else 8.0

    return {
        "opp_bat_avg5": opp_bat_avg,
        "opp_bowl_eco5": opp_bowl_avg,   # proxy via bowling fantasy points
        "opp_bowl_wkts5": 0.0,           # requires delivery-level aggregation (done in pipeline)
    }


def build_player_vs_opposition_features(
    player_id: int,
    opposition_team: str,
    cutoff_date: date,
    matches_df: pd.DataFrame,
    fp_df: pd.DataFrame,
) -> dict[str, float]:
    """Player's historical performance against this specific team."""
    opp_match_ids = set(
        matches_df[
            ((matches_df["team1"] == opposition_team) | (matches_df["team2"] == opposition_team)) &
            (pd.to_datetime(matches_df["match_date"]).dt.date < cutoff_date)
        ]["match_id"].tolist()
    )

    player_fp_vs_opp = fp_df[
        (fp_df["player_id"] == player_id) &
        (fp_df["match_id"].isin(opp_match_ids))
    ]

    n = len(player_fp_vs_opp)
    return {
        "player_vs_opp_fp_avg": float(player_fp_vs_opp["total_points"].mean()) if n > 0 else float("nan"),
        "player_vs_opp_matches": n,
    }


def build_opposition_pace_ratio(
    opposition_team: str,
    cutoff_date: date,
    matches_df: pd.DataFrame,
    deliveries_df: pd.DataFrame,
    player_bowling_styles: dict[int, str],
    n_matches: int = 5,
) -> float:
    """Fraction of opposition deliveries bowled by pace bowlers in recent matches."""
    opp_match_ids = matches_df[
        ((matches_df["team1"] == opposition_team) | (matches_df["team2"] == opposition_team)) &
        (pd.to_datetime(matches_df["match_date"]).dt.date < cutoff_date)
    ].sort_values("match_date").tail(n_matches)["match_id"].tolist()

    if not opp_match_ids:
        return 0.5

    opp_del = deliveries_df[
        (deliveries_df["match_id"].isin(opp_match_ids)) &
        (deliveries_df["bowler_id"].notna())
    ]

    total = len(opp_del)
    if total == 0:
        return 0.5

    pace_count = opp_del["bowler_id"].map(
        lambda bid: player_bowling_styles.get(int(bid), "") in PACE_STYLES
    ).sum()

    return float(pace_count / total)


# ============================================================
# Batter vs bowling style matchup
# ============================================================

def build_batter_matchup_features(
    player_id: int,
    cutoff_date: date,
    deliveries_df: pd.DataFrame,
    matches_df: pd.DataFrame,
    player_bowling_styles: dict[int, str],
) -> dict[str, float]:
    """
    Compute batter's strike rate vs pace vs spin, and vs left-arm bowlers.
    Uses delivery-level data where this player was the striker.
    """
    historical_matches = matches_df[
        pd.to_datetime(matches_df["match_date"]).dt.date < cutoff_date
    ]["match_id"].tolist()

    batter_del = deliveries_df[
        (deliveries_df["striker_id"] == player_id) &
        (deliveries_df["match_id"].isin(historical_matches)) &
        (~deliveries_df["extras_type"].isin(["wides"]))  # batter doesn't face wides
    ].copy()

    if len(batter_del) == 0:
        return _empty_batter_matchup()

    batter_del["bowler_style"] = batter_del["bowler_id"].map(
        lambda bid: player_bowling_styles.get(int(bid), "") if pd.notna(bid) else ""
    )

    pace_del = batter_del[batter_del["bowler_style"].isin(PACE_STYLES)]
    spin_del = batter_del[batter_del["bowler_style"].isin(SPIN_STYLES)]
    left_arm_del = batter_del[batter_del["bowler_style"].isin({"left-arm-fast", "slow-left-arm"})]

    return {
        "bat_vs_pace_sr": _sr_from_deliveries(pace_del),
        "bat_vs_spin_sr": _sr_from_deliveries(spin_del),
        "bat_vs_lefts_sr": _sr_from_deliveries(left_arm_del),
    }


def build_bowler_matchup_features(
    player_id: int,
    cutoff_date: date,
    deliveries_df: pd.DataFrame,
    matches_df: pd.DataFrame,
    player_batting_hands: dict[int, str],
) -> dict[str, float]:
    """Bowler's economy rate vs left-handed and right-handed batters."""
    historical_matches = matches_df[
        pd.to_datetime(matches_df["match_date"]).dt.date < cutoff_date
    ]["match_id"].tolist()

    bowler_del = deliveries_df[
        (deliveries_df["bowler_id"] == player_id) &
        (deliveries_df["match_id"].isin(historical_matches)) &
        (~deliveries_df["extras_type"].isin(["wides", "noballs"]))
    ].copy()

    if len(bowler_del) == 0:
        return {"bowl_vs_left_eco": 7.5, "bowl_vs_right_eco": 7.5}

    bowler_del["striker_hand"] = bowler_del["striker_id"].map(
        lambda sid: player_batting_hands.get(int(sid), "") if pd.notna(sid) else ""
    )

    left_del = bowler_del[bowler_del["striker_hand"] == "Left hand"]
    right_del = bowler_del[bowler_del["striker_hand"] == "Right hand"]

    return {
        "bowl_vs_left_eco": _economy_from_deliveries(left_del),
        "bowl_vs_right_eco": _economy_from_deliveries(right_del),
    }


# ============================================================
# Helpers
# ============================================================

def _sr_from_deliveries(del_df: pd.DataFrame) -> float:
    balls = len(del_df)
    if balls < 10:
        return float("nan")
    runs = del_df["runs_batter"].sum()
    return float(runs / balls * 100)


def _economy_from_deliveries(del_df: pd.DataFrame) -> float:
    balls = len(del_df)
    if balls < 12:
        return float("nan")
    runs = del_df["runs_total"].sum()
    overs = balls / 6.0
    return float(runs / overs)


def _empty_opposition_features() -> dict[str, float]:
    return {
        "opp_bat_avg5": 15.0,
        "opp_bowl_eco5": 8.0,
        "opp_bowl_wkts5": 0.0,
    }


def _empty_batter_matchup() -> dict[str, float]:
    return {
        "bat_vs_pace_sr": float("nan"),
        "bat_vs_spin_sr": float("nan"),
        "bat_vs_lefts_sr": float("nan"),
    }
