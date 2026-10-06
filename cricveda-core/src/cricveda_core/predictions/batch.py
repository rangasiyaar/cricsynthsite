"""Pre-compute CricVeda v2 predictions for upcoming fixtures.

For every scheduled fixture with a squad entered in the admin panel, predict
each player's P10/median/P90 runs, wickets and fantasy points and the derived
scores, then write them to `player_predictions`. The API only looks these up,
so requests stay fast and the API never loads the models.

Variants per player, so the API can honour the request's `context`:
    batting_position  0 = as entered in the squad (projected); 1–7 for batters
                      and all-rounders, to answer "what if he bats at 3?"
    include_conditions with / without venue and toss features

Only fixtures whose squad or details changed since they were last predicted
(or that were predicted more than a day ago) are recomputed, so the job is
cheap to run often.

Usage:
    uv run python -m cricveda_core.predictions.batch                 # next 7 days
    uv run python -m cricveda_core.predictions.batch --fixture ipl-2026-m042 --dry-run
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING

import click
import numpy as np
import pandas as pd

from cricveda_core.predictions import derive

if TYPE_CHECKING:  # xgboost isn't needed to check which fixtures are due
    from cricveda_core.predictions.quantile import QuantileModels

log = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).resolve().parents[4] / "data" / "models"

# The model's batting-position feature is the average over in which a batter
# first faces a ball. Typical T20 values for each slot in the order.
POSITION_FIRST_OVER = {1: 0.0, 2: 0.0, 3: 2.5, 4: 5.0, 5: 7.5, 6: 10.0, 7: 12.5,
                       8: 14.5, 9: 16.0, 10: 17.0, 11: 18.0}
VARIANT_POSITIONS = range(1, 8)
BATTING_ROLES = {"BAT", "WK", "AR"}
REPREDICT_AFTER = timedelta(hours=24)


@dataclass
class SquadPlayer:
    player_id: int
    team: str
    role: str
    batting_order: int | None
    is_playing_xi: bool
    is_confirmed: bool


def _derive_rows(
    fixture: dict,
    players: list[SquadPlayer],
    preds: dict[str, np.ndarray],
    X: pd.DataFrame,
    models: QuantileModels,
    batting_position: int,
    include_conditions: bool,
    captain: np.ndarray,
    generated_at: str,
) -> list[dict]:
    ref = models.reference
    rows = []
    for i, p in enumerate(players):
        x = X.iloc[i]
        pts = preds["points"][i]
        runs = preds["runs"][i] if "runs" in preds else [None] * 3
        wkts = preds["wickets"][i] if "wickets" in preds else [None] * 3
        form_score, trend = derive.form(float(x.get("fp_ewm5", 0) or 0), float(x.get("fp_trend", 0) or 0),
                                        ref.get("fp_ewm5", []))
        composite = derive.composite_score(
            derive.percentile(float(pts[1]), ref.get("points_p50", [])),
            form_score,
            derive.percentile(float(pts[0]), ref.get("points_p10", [])),
        )
        rows.append({
            "upcoming_id": fixture["upcoming_id"],
            "player_id": int(p.player_id),
            "batting_position": batting_position,
            "include_conditions": include_conditions,
            "team": p.team,
            "role": p.role,
            "metric": derive.primary_metric(p.role),
            "runs_p10": _num(runs[0]), "runs_p50": _num(runs[1]), "runs_p90": _num(runs[2]),
            "wickets_p10": _num(wkts[0]), "wickets_p50": _num(wkts[1]), "wickets_p90": _num(wkts[2]),
            "points_p10": _num(pts[0]), "points_p50": _num(pts[1]), "points_p90": _num(pts[2]),
            "form_score": form_score,
            "form_trend": trend,
            "composite_score": composite,
            "tier": derive.tier(composite),
            "captain_value": round(float(captain[i]), 2),
            "confidence": derive.confidence(float(x.get("matches_total", 0) or 0),
                                            float(pts[0]), float(pts[1]), float(pts[2]), p.is_confirmed),
            "xi_status": "confirmed" if p.is_confirmed else "projected",
            "model_version": models.version,
            "generated_at": generated_at,
        })
    return rows


def _num(v) -> float | None:
    return None if v is None else round(float(v), 1)


def _with_position(X: pd.DataFrame, positions: list[int | None]) -> pd.DataFrame:
    X = X.copy()
    for i, pos in enumerate(positions):
        if pos in POSITION_FIRST_OVER:
            X.iloc[i, X.columns.get_loc("batting_position_avg")] = POSITION_FIRST_OVER[pos]
    return X


def predict_fixture(pipe, models: QuantileModels, fixture: dict, squad: list[SquadPlayer]) -> list[dict]:
    """All prediction rows (every variant) for one fixture."""
    xi = [p for p in squad if p.is_playing_xi]
    if not xi:
        return []
    generated_at = datetime.now(timezone.utc).isoformat()
    match_date = pd.to_datetime(fixture["match_date"]).date()
    rows: list[dict] = []

    for include_conditions in (True, False):
        X = pipe.build_inference_matrix(
            player_ids=[p.player_id for p in xi],
            player_teams={p.player_id: p.team for p in xi},
            team1=fixture["team1"], team2=fixture["team2"], match_date=match_date,
            venue_id=fixture.get("venue_id") if include_conditions else None,
            league_id=fixture.get("league_id") or "t20i",
            toss_winner=fixture.get("toss_winner") if include_conditions else None,
            toss_decision=fixture.get("toss_decision") if include_conditions else None,
        ).loc[[p.player_id for p in xi]]

        # Projected: positions as entered in the admin panel.
        X0 = _with_position(X, [p.batting_order for p in xi])
        base = models.predict(X0)
        captain = derive.captain_values(base["points"])
        rows += _derive_rows(fixture, xi, base, X0, models, 0, include_conditions, captain, generated_at)

        # What-if positions for batters / all-rounders, one batch predict for all of them.
        idx = [i for i, p in enumerate(xi) if p.role in BATTING_ROLES]
        if not idx:
            continue
        variant_X, variant_meta = [], []
        for pos in VARIANT_POSITIONS:
            for i in idx:
                variant_X.append(_with_position(X0.iloc[[i]], [pos]))
                variant_meta.append((i, pos))
        VX = pd.concat(variant_X)
        vpreds = models.predict(VX)
        for k, (i, pos) in enumerate(variant_meta):
            # captain value with this player's new range swapped into the match
            pool = base["points"].copy()
            pool[i] = vpreds["points"][k]
            cv = derive.captain_values(pool, n_sims=2000)
            one = {t: q[k:k + 1] for t, q in vpreds.items()}
            rows += _derive_rows(fixture, [xi[i]], one, VX.iloc[[k]], models, pos,
                                 include_conditions, cv[i:i + 1], generated_at)
    return rows


# ── Supabase I/O ─────────────────────────────────────────────────────────────

def _client():
    from cricveda_ingest.db import get_client
    return get_client()


def fixtures_needing_predictions(days_ahead: int, slug: str | None = None) -> list[dict]:
    c = _client()
    q = c.table("upcoming_matches").select("*").eq("status", "scheduled")
    if slug:
        q = q.eq("slug", slug)
    else:
        today = date.today()
        q = q.gte("match_date", today.isoformat()).lte("match_date", (today + timedelta(days=days_ahead)).isoformat())
    fixtures = q.execute().data
    if slug:
        return fixtures
    due = []
    for fx in fixtures:
        last = (
            c.table("player_predictions").select("generated_at").eq("upcoming_id", fx["upcoming_id"])
            .order("generated_at", desc=True).limit(1).execute().data
        )
        if not last:
            due.append(fx)
            continue
        last_at = pd.to_datetime(last[0]["generated_at"], utc=True)
        changed = fx.get("updated_at") and pd.to_datetime(fx["updated_at"], utc=True) > last_at
        stale = datetime.now(timezone.utc) - last_at > REPREDICT_AFTER
        if changed or stale:
            due.append(fx)
    return due


def load_squad(upcoming_id: int) -> list[SquadPlayer]:
    rows = (
        _client().table("squad_selections")
        .select("player_id, team, batting_order, is_playing_xi, is_confirmed, player_meta(primary_role)")
        .eq("upcoming_id", upcoming_id).execute().data
    )
    return [
        SquadPlayer(
            player_id=r["player_id"], team=r["team"],
            role=((r.get("player_meta") or {}).get("primary_role") or "").upper(),
            batting_order=r.get("batting_order"), is_playing_xi=r["is_playing_xi"],
            is_confirmed=r["is_confirmed"],
        )
        for r in rows
    ]


def write_predictions(upcoming_id: int, rows: list[dict]) -> None:
    c = _client()
    c.table("player_predictions").delete().eq("upcoming_id", upcoming_id).execute()
    for start in range(0, len(rows), 500):
        c.table("player_predictions").insert(rows[start:start + 500]).execute()


@click.command()
@click.option("--days-ahead", default=7, show_default=True, help="Predict fixtures in the next N days.")
@click.option("--fixture", "slug", default=None, help="Only this fixture (public match ID); always recomputed.")
@click.option("--dry-run", is_flag=True, help="Compute but don't write to Supabase.")
@click.option("--models-dir", default=str(MODELS_DIR), show_default=True)
def main(days_ahead: int, slug: str | None, dry_run: bool, models_dir: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    fixtures = fixtures_needing_predictions(days_ahead, slug)
    if not fixtures:
        log.info("Nothing to predict — every upcoming fixture is up to date.")
        return
    from cricveda_core.predictions.quantile import QuantileModels

    models = QuantileModels.load(Path(models_dir), "latest")
    log.info("Model %s | %d fixture(s) to predict", models.version, len(fixtures))

    from cricveda_core.features.pipeline import FeaturePipeline
    pipe = FeaturePipeline.from_supabase()

    for fx in fixtures:
        squad = load_squad(fx["upcoming_id"])
        if not any(p.is_playing_xi for p in squad):
            log.info("%s: no XI entered yet — skipped", fx.get("slug"))
            continue
        rows = predict_fixture(pipe, models, fx, squad)
        log.info("%s: %d prediction rows", fx.get("slug"), len(rows))
        if not dry_run:
            write_predictions(fx["upcoming_id"], rows)


if __name__ == "__main__":
    main()
