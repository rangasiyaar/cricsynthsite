"""Master feature pipeline.

Orchestrates all feature groups → single pandas DataFrame per (player, match).
Used for both training (historical data) and inference (upcoming matches).

The pipeline pattern: load all raw data once → compute features → return DataFrame.
No repeated DB calls per player — everything is batch-loaded up front.

Usage:
    from cricveda_core.features.pipeline import FeaturePipeline
    pipe = FeaturePipeline.from_supabase()
    X_train = pipe.build_training_matrix()
    X_pred  = pipe.build_inference_matrix(upcoming_match_id=42)
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Any

import numpy as np
import pandas as pd

from cricveda_core.domain.models import BowlingStyle, PlayerRole
from cricveda_core.features.matchup import (
    build_batter_matchup_features,
    build_bowler_matchup_features,
    build_opposition_features,
    build_opposition_pace_ratio,
    build_player_vs_opposition_features,
)
from cricveda_core.features.player_form import build_training_rows
from cricveda_core.features.venue import build_player_venue_features, build_venue_features

log = logging.getLogger(__name__)

PACE_STYLES = {"right-arm-fast", "right-arm-medium", "left-arm-fast"}
SPIN_STYLES = {"right-arm-off-break", "right-arm-leg-break", "slow-left-arm"}


class FeaturePipeline:
    """
    Holds all raw data in memory and produces feature matrices on demand.

    Load once, compute many — avoids repeated round-trips to Supabase.
    """

    def __init__(
        self,
        fp_df: pd.DataFrame,
        matches_df: pd.DataFrame,
        deliveries_df: pd.DataFrame,
        player_meta_df: pd.DataFrame,
        leagues_df: pd.DataFrame,
        delivery_stats_df: pd.DataFrame,
    ) -> None:
        self.fp_df = fp_df
        self.matches_df = matches_df
        self.deliveries_df = deliveries_df
        self.player_meta_df = player_meta_df
        self.leagues_df = leagues_df
        self.delivery_stats_df = delivery_stats_df

        # Build lookup dicts used throughout feature computation
        self.bowling_styles: dict[int, str] = dict(
            zip(player_meta_df["player_id"], player_meta_df["bowling_style"].fillna(""))
        )
        self.batting_hands: dict[int, str] = dict(
            zip(player_meta_df["player_id"], player_meta_df["batting_hand"].fillna(""))
        )
        self.player_roles: dict[int, str] = dict(
            zip(player_meta_df["player_id"], player_meta_df["primary_role"].fillna(""))
        )
        self.player_dobs: dict[int, Any] = dict(
            zip(player_meta_df["player_id"], player_meta_df["dob"])
        )
        self.league_configs: dict[str, dict] = {
            row["league_id"]: row.to_dict()
            for _, row in leagues_df.iterrows()
        }

    # ============================================================
    # Static features per player
    # ============================================================

    def _player_static(self, player_id: int, match_date: date) -> dict[str, float]:
        role = self.player_roles.get(player_id, "")
        hand = self.batting_hands.get(player_id, "")
        style = self.bowling_styles.get(player_id, "")
        dob = self.player_dobs.get(player_id)

        age = float("nan")
        if dob is not None and pd.notna(dob):
            try:
                dob_date = pd.to_datetime(dob).date()
                age = (match_date - dob_date).days / 365.25
            except Exception:
                pass

        # Infer avg batting position from deliveries (opener = low over number when first faced)
        batter_dels = self.deliveries_df[self.deliveries_df["striker_id"] == player_id]
        if len(batter_dels) > 0:
            first_over = batter_dels.groupby("match_id")["over_ball"].min()
            batting_pos = float(first_over.mean())
        else:
            batting_pos = float("nan")

        return {
            "role_bat": int(role == "BAT"),
            "role_bowl": int(role == "BOWL"),
            "role_ar": int(role == "AR"),
            "role_wk": int(role == "WK"),
            "batting_hand_left": int(hand == "Left hand"),
            "is_pacer": int(style in PACE_STYLES),
            "is_spinner": int(style in SPIN_STYLES),
            "age": age,
            "batting_position_avg": batting_pos,
        }

    # ============================================================
    # Match context features
    # ============================================================

    def _match_context(
        self,
        player_team: str,
        toss_winner: str | None,
        toss_decision: str | None,
        league_id: str,
    ) -> dict[str, float]:
        league = self.league_configs.get(league_id, {})
        toss_won = int(player_team == toss_winner) if toss_winner else 0
        batting_first = 0
        if toss_winner and toss_decision:
            if player_team == toss_winner and toss_decision == "bat":
                batting_first = 1
            elif player_team != toss_winner and toss_decision == "field":
                batting_first = 1

        return {
            "toss_won": toss_won,
            "batting_first": batting_first,
            "league_difficulty": league.get("difficulty_multiplier", 1.0),
            "format_similarity": league.get("format_similarity_weight", 1.0),
            "league_tier": league.get("tier", 2),
        }

    # ============================================================
    # Build one feature row for (player_id, match context)
    # ============================================================

    def build_row(
        self,
        player_id: int,
        player_team: str,
        opposition_team: str,
        cutoff_date: date,
        venue_id: int | None,
        league_id: str,
        toss_winner: str | None = None,
        toss_decision: str | None = None,
    ) -> dict[str, Any]:
        row: dict[str, Any] = {"player_id": player_id}

        # Static player features
        row.update(self._player_static(player_id, cutoff_date))

        # Match context
        row.update(self._match_context(player_team, toss_winner, toss_decision, league_id))

        # Venue features
        if venue_id is not None:
            venue_feats = build_venue_features(
                venue_id, self.deliveries_df, self.matches_df, self.fp_df, self.bowling_styles
            )
            row.update(venue_feats)
            player_venue = build_player_venue_features(
                player_id, venue_id, cutoff_date,
                self.deliveries_df, self.matches_df, self.fp_df,
            )
            row.update(player_venue)
        else:
            row.update({
                "venue_avg_1st_inn_score": float("nan"),
                "venue_pace_eco": float("nan"),
                "venue_spin_eco": float("nan"),
                "venue_pace_spin_ratio": float("nan"),
                "venue_bat_fp_avg": float("nan"),
                "venue_bowl_fp_avg": float("nan"),
                "player_venue_fp_avg": float("nan"),
                "player_venue_matches": 0,
            })

        # Opposition features
        opp_feats = build_opposition_features(
            player_team, opposition_team, cutoff_date, self.matches_df, self.fp_df
        )
        row.update(opp_feats)

        row["opp_pace_ratio"] = build_opposition_pace_ratio(
            opposition_team, cutoff_date, self.matches_df, self.deliveries_df, self.bowling_styles
        )

        player_vs_opp = build_player_vs_opposition_features(
            player_id, opposition_team, cutoff_date, self.matches_df, self.fp_df
        )
        row.update(player_vs_opp)

        # Batter matchup features
        batter_matchup = build_batter_matchup_features(
            player_id, cutoff_date, self.deliveries_df, self.matches_df, self.bowling_styles
        )
        row.update(batter_matchup)

        # Bowler matchup features
        bowler_matchup = build_bowler_matchup_features(
            player_id, cutoff_date, self.deliveries_df, self.matches_df, self.batting_hands
        )
        row.update(bowler_matchup)

        return row

    # ============================================================
    # Build full training matrix
    # ============================================================

    def build_training_matrix(self) -> pd.DataFrame:
        """
        Build the full (player, match) feature matrix for training.

        Returns a DataFrame with all feature columns + target_points + match_date.
        Leakage-safe: each row only uses data before its match_date.
        """
        log.info("Building training rows (rolling form features)...")
        form_df = build_training_rows(self.fp_df, self.delivery_stats_df)

        log.info("Adding venue, matchup, static features...")
        enriched_rows = []

        # Build a match lookup once
        match_meta = self.matches_df.set_index("match_id")[
            ["team1", "team2", "venue_id", "league_id", "toss_winner", "toss_decision"]
        ].to_dict("index")

        for _, base_row in form_df.iterrows():
            pid = base_row["player_id"]
            mid = base_row["match_id"]
            cutoff = base_row["match_date"]

            meta = match_meta.get(mid, {})
            league_id = meta.get("league_id", "t20i")
            venue_id = meta.get("venue_id")
            toss_winner = meta.get("toss_winner")
            toss_decision = meta.get("toss_decision")

            # Determine player's team for this match (which team they appeared in)
            player_deliveries = self.deliveries_df[
                (self.deliveries_df["match_id"] == mid) &
                (self.deliveries_df["striker_id"] == pid)
            ]
            if len(player_deliveries) == 0:
                player_deliveries = self.deliveries_df[
                    (self.deliveries_df["match_id"] == mid) &
                    (self.deliveries_df["bowler_id"] == pid)
                ]

            # Infer team from which team the player appeared for
            team1, team2 = meta.get("team1", ""), meta.get("team2", "")
            player_team = team1  # fallback
            opposition_team = team2

            enriched = self.build_row(
                pid, player_team, opposition_team, cutoff,
                venue_id, league_id, toss_winner, toss_decision,
            )
            enriched["match_id"] = mid
            enriched["match_date"] = cutoff
            enriched["target_points"] = base_row["target_points"]
            # Merge form features into enriched row
            for col in base_row.index:
                if col not in ("player_id", "match_id", "match_date", "target_points"):
                    enriched[col] = base_row[col]

            enriched_rows.append(enriched)

        df = pd.DataFrame(enriched_rows)
        log.info("Training matrix shape: %s", df.shape)
        return df

    # ============================================================
    # Build inference matrix for upcoming match
    # ============================================================

    def build_inference_matrix(
        self,
        player_ids: list[int],
        player_teams: dict[int, str],
        team1: str,
        team2: str,
        match_date: date,
        venue_id: int | None,
        league_id: str,
        toss_winner: str | None = None,
        toss_decision: str | None = None,
    ) -> pd.DataFrame:
        """
        Build feature matrix for an upcoming match (no target).

        Args:
            player_ids: All players in both squads.
            player_teams: {player_id: team_name}
        """
        rows = []
        for pid in player_ids:
            player_team = player_teams.get(pid, team1)
            opposition_team = team2 if player_team == team1 else team1

            row = self.build_row(
                pid, player_team, opposition_team, match_date,
                venue_id, league_id, toss_winner, toss_decision,
            )

            # Add form features using all data before match_date
            player_fp = self.fp_df[
                (self.fp_df["player_id"] == pid) &
                (pd.to_datetime(self.fp_df["match_date"]).dt.date < match_date) &
                (~self.fp_df["training_exclude"].fillna(False))
            ].sort_values("match_date")

            player_ds = self.delivery_stats_df[
                (self.delivery_stats_df["player_id"] == pid) &
                (pd.to_datetime(self.delivery_stats_df["match_date"]).dt.date < match_date)
            ].sort_values("match_date")

            from cricveda_core.features.player_form import _compute_player_features
            form_feats = _compute_player_features(pid, player_fp, player_ds, match_date)
            for k, v in form_feats.items():
                if k != "player_id":
                    row[k] = v

            rows.append(row)

        return pd.DataFrame(rows).set_index("player_id")

    # ============================================================
    # Factory — load from Supabase
    # ============================================================

    @classmethod
    def from_supabase(cls) -> "FeaturePipeline":
        """Load all required tables from Supabase and return a ready pipeline."""
        from cricveda_ingest.db import get_client
        client = get_client()

        log.info("Loading fantasy_points...")
        fp_raw = client.table("fantasy_points").select(
            "player_id, match_id, batting_points, bowling_points, fielding_points, total_points, training_exclude, "
            "matches(match_date, league_id, team1, team2, venue_id, rain_affected)"
        ).execute()
        fp_rows = []
        for r in fp_raw.data:
            m = r.pop("matches", {}) or {}
            r.update(m)
            fp_rows.append(r)
        fp_df = pd.DataFrame(fp_rows)

        log.info("Loading matches...")
        matches_raw = client.table("matches").select("*").execute()
        matches_df = pd.DataFrame(matches_raw.data)

        log.info("Loading player_meta...")
        player_raw = client.table("player_meta").select("*").execute()
        player_df = pd.DataFrame(player_raw.data)

        log.info("Loading leagues...")
        leagues_raw = client.table("leagues").select("*").execute()
        leagues_df = pd.DataFrame(leagues_raw.data)

        log.info("Loading deliveries (this may take a while)...")
        # Only load the columns needed for feature computation (not raw name strings)
        delivery_raw = client.table("deliveries").select(
            "delivery_id, match_id, innings, over_ball, striker_id, bowler_id, "
            "runs_batter, runs_total, extras_type, wicket_type"
        ).not_.is_("striker_id", "null").execute()
        deliveries_df = pd.DataFrame(delivery_raw.data)

        log.info("Building per-player-per-match delivery aggregates...")
        delivery_stats_df = _aggregate_delivery_stats(deliveries_df, matches_df)

        return cls(fp_df, matches_df, deliveries_df, player_df, leagues_df, delivery_stats_df)


def _aggregate_delivery_stats(
    deliveries_df: pd.DataFrame,
    matches_df: pd.DataFrame,
) -> pd.DataFrame:
    """Build per-player per-match batting and bowling aggregates from deliveries."""
    match_dates = matches_df.set_index("match_id")[["match_date", "league_id"]].to_dict("index")

    rows = []

    # Batting stats per player per match (as striker)
    bat = deliveries_df[deliveries_df["striker_id"].notna()].copy()
    bat = bat[~bat["extras_type"].isin(["wides"])]  # batter doesn't face wides
    bat_agg = bat.groupby(["striker_id", "match_id"]).agg(
        runs=("runs_batter", "sum"),
        balls_faced=("runs_batter", "count"),
        fours=("runs_batter", lambda x: (x == 4).sum()),
        sixes=("runs_batter", lambda x: (x == 6).sum()),
    ).reset_index().rename(columns={"striker_id": "player_id"})

    # Dismissals — check if striker got out in any delivery this match
    wickets = deliveries_df[deliveries_df["wicket_type"].notna() & deliveries_df["striker_id"].notna()]
    dismissed_set = set(zip(wickets["striker_id"], wickets["match_id"]))
    bat_agg["dismissed"] = bat_agg.apply(
        lambda r: int((r["player_id"], r["match_id"]) in dismissed_set), axis=1
    )

    # Bowling stats per player per match (as bowler)
    bowl_legal = deliveries_df[
        deliveries_df["bowler_id"].notna() &
        ~deliveries_df["extras_type"].isin(["wides", "noballs"])
    ].copy()
    bowl_agg = bowl_legal.groupby(["bowler_id", "match_id"]).agg(
        legal_deliveries=("runs_total", "count"),
        runs_conceded=("runs_total", "sum"),
    ).reset_index().rename(columns={"bowler_id": "player_id"})

    # Wickets taken by bowler (exclude non-bowler dismissal types)
    from cricveda_core.domain.models import NON_BOWLER_WICKETS
    bowler_wickets = deliveries_df[
        deliveries_df["bowler_id"].notna() &
        deliveries_df["wicket_type"].notna() &
        ~deliveries_df["wicket_type"].isin(NON_BOWLER_WICKETS)
    ]
    wkt_agg = bowler_wickets.groupby(["bowler_id", "match_id"]).size().reset_index(name="wickets")
    wkt_agg = wkt_agg.rename(columns={"bowler_id": "player_id"})
    bowl_agg = bowl_agg.merge(wkt_agg, on=["player_id", "match_id"], how="left")
    bowl_agg["wickets"] = bowl_agg["wickets"].fillna(0)

    # Merge batting and bowling
    combined = bat_agg.merge(bowl_agg, on=["player_id", "match_id"], how="outer")
    combined["match_date"] = combined["match_id"].map(lambda m: match_dates.get(m, {}).get("match_date"))
    combined["format"] = combined["match_id"].map(lambda m: match_dates.get(m, {}).get("league_id", ""))

    return combined
