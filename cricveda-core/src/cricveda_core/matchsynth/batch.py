"""Pre-simulate upcoming fixtures so POST /v2/simulate/match answers instantly.

For each scheduled fixture in the next N days with both XIs entered, run the
default simulation (fixture toss if known, else both batting orders) and
store it in `match_simulations`. Fixtures are skipped when their stored
result is newer than the fixture/squad and was made by the current model.

Usage:
    uv run python -m cricveda_core.matchsynth.batch
    uv run python -m cricveda_core.matchsynth.batch --fixture ipl-2026-m042 --dry-run
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import click
import pandas as pd

from cricveda_core.matchsynth.ball_model import BallModel
from cricveda_core.matchsynth.fixture import SquadRow, simulate_fixture, toss_key_from_fixture

log = logging.getLogger(__name__)
MODELS_DIR = Path(__file__).resolve().parents[4] / "data" / "models"
ITERATIONS = 10000


def _client():
    from cricveda_ingest.db import get_client
    return get_client()


def load_squad(upcoming_id: int) -> list[SquadRow]:
    rows = (
        _client().table("squad_selections")
        .select("player_id, team, batting_order, is_playing_xi, is_confirmed, player_meta(primary_role, bowling_style)")
        .eq("upcoming_id", upcoming_id).execute().data
    )
    return [SquadRow(r["player_id"], r["team"], r.get("batting_order"), r["is_playing_xi"], r["is_confirmed"],
                     (r.get("player_meta") or {}).get("primary_role"), (r.get("player_meta") or {}).get("bowling_style"))
            for r in rows]


def is_due(fixture: dict, stored: dict | None, model_version: str) -> bool:
    if stored is None or stored.get("model_version") != model_version:
        return True
    updated = fixture.get("updated_at")
    return bool(updated) and pd.to_datetime(updated, utc=True) > pd.to_datetime(stored["generated_at"], utc=True)


def complete_xis(fixture: dict, squad: list[SquadRow]) -> bool:
    return all(sum(1 for p in squad if p.team == t and p.is_playing_xi) >= 11
               for t in (fixture["team1"], fixture["team2"]))


def row_for(fixture: dict, toss_key: str | None, result: dict, model_version: str) -> dict:
    return {"upcoming_id": fixture["upcoming_id"], "toss_key": toss_key or "", "iterations": result["iterations"],
            "model_version": model_version, "result": result,
            "generated_at": datetime.now(timezone.utc).isoformat()}


@click.command()
@click.option("--days-ahead", default=7, show_default=True)
@click.option("--fixture", "slug", default=None, help="Only this fixture; always recomputed.")
@click.option("--dry-run", is_flag=True)
@click.option("--models-dir", default=str(MODELS_DIR), show_default=True)
def main(days_ahead: int, slug: str | None, dry_run: bool, models_dir: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    model = BallModel.load(Path(models_dir) / "ball_model_latest.npz")
    c = _client()
    q = c.table("upcoming_matches").select("*").eq("status", "scheduled")
    if slug:
        q = q.eq("slug", slug)
    else:
        today = date.today()
        q = q.gte("match_date", today.isoformat()).lte("match_date", (today + timedelta(days=days_ahead)).isoformat())
    for fx in q.execute().data:
        toss = toss_key_from_fixture(fx)
        stored = (c.table("match_simulations").select("model_version, generated_at")
                  .eq("upcoming_id", fx["upcoming_id"]).eq("toss_key", toss or "").limit(1).execute().data)
        if not slug and not is_due(fx, stored[0] if stored else None, model.version):
            continue
        squad = load_squad(fx["upcoming_id"])
        if not complete_xis(fx, squad):
            log.info("%s: XIs incomplete — skipped", fx.get("slug"))
            continue
        result = simulate_fixture(model, fx, squad, ITERATIONS, toss)
        log.info("%s: %s", fx.get("slug"), result["win_probability"])
        if not dry_run:
            c.table("match_simulations").upsert(row_for(fx, toss, result, model.version),
                                                on_conflict="upcoming_id,toss_key").execute()


if __name__ == "__main__":
    main()


def fixtures_needing_simulation(days_ahead: int = 7) -> list[dict]:
    """Cheap check (no model needed): fixtures never simulated or changed since."""
    c = _client()
    today = date.today()
    fixtures = (c.table("upcoming_matches").select("upcoming_id, slug, updated_at, toss_winner, toss_decision, team1")
                .eq("status", "scheduled").gte("match_date", today.isoformat())
                .lte("match_date", (today + timedelta(days=days_ahead)).isoformat()).execute().data)
    due = []
    for fx in fixtures:
        stored = (c.table("match_simulations").select("model_version, generated_at")
                  .eq("upcoming_id", fx["upcoming_id"]).eq("toss_key", toss_key_from_fixture(fx) or "")
                  .limit(1).execute().data)
        if is_due(fx, stored[0] if stored else None, stored[0]["model_version"] if stored else ""):
            due.append(fx)
    return due
