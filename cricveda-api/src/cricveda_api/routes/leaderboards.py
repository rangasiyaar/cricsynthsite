"""Leaderboard endpoints.

GET /v1/leagues/{league_id}/final-over-specialists — best bowlers/batters in the final over
"""
from __future__ import annotations

import math
import statistics

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from cricveda_api.auth import require_api_key
from cricveda_api.cache import cache_get, cache_key, cache_set
from cricveda_api.deps import limiter

router = APIRouter()


# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------


class FinalOverSpecialistResponse(BaseModel):
    league_id: str
    season: str | None
    role: str
    over_analyzed: str  # e.g. "20th over (T20)" or "50th over (ODI)"
    specialists: list[dict]  # player_id, name, balls, economy/sr, wickets/sixes, qualification


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _chunk(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


# ---------------------------------------------------------------------------
# Endpoint: Final Over Specialists
# ---------------------------------------------------------------------------


@router.get(
    "/leagues/{league_id}/final-over-specialists",
    response_model=FinalOverSpecialistResponse,
    summary="Best bowlers and batters in the final over of the 2nd innings",
    description=(
        "Ranks players by their performance in the final over of the 2nd innings — the highest "
        "pressure moment in limited-overs cricket. For T20 this is over 20 (over_ball 19.0–19.6); "
        "for ODI it is over 50 (over_ball 49.0–49.6).\n\n"
        "**role=bowler** — ranked by economy rate (asc), minimum 10 balls bowled.\n\n"
        "**role=batter** — ranked by strike rate (desc), minimum 10 balls faced.\n\n"
        "Results cached for **60 minutes**."
    ),
)
@limiter.limit("60/minute")
async def get_final_over_specialists(
    request: Request,
    league_id: str,
    season: str | None = Query(None, description="Season string, e.g. `2024`"),
    role: str = Query("bowler", description="`bowler` or `batter`"),
    limit: int = Query(10, ge=1, le=25, description="Number of results (max 25)"),
    _key_id: str = Depends(require_api_key),
):
    """Return the top final-over specialists (bowlers or batters) in a league."""
    if role not in ("bowler", "batter"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="role must be 'bowler' or 'batter'",
        )

    ck = cache_key("final_over_specialists", league_id, season, role, limit)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    # Validate league and determine format
    league_rows = (
        client.table("leagues")
        .select("league_id,format")
        .eq("league_id", league_id)
        .limit(1)
        .execute()
    )
    if not league_rows.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"League '{league_id}' not found",
        )
    league_format = league_rows.data[0].get("format", "T20").upper()

    # Final over thresholds
    if league_format == "ODI":
        over_floor = 49.0
        over_ceil = 50.0
        over_label = "50th over (ODI)"
    else:
        over_floor = 19.0
        over_ceil = 20.0
        over_label = "20th over (T20)"

    # Fetch match IDs for this league (optionally filtered by season)
    match_query = (
        client.table("matches")
        .select("match_id")
        .eq("league_id", league_id)
        .limit(1000)
    )
    if season:
        match_query = match_query.eq("season", season)

    match_rows = match_query.execute().data
    match_ids = [r["match_id"] for r in match_rows]

    _empty = FinalOverSpecialistResponse(
        league_id=league_id,
        season=season,
        role=role,
        over_analyzed=over_label,
        specialists=[],
    )

    if not match_ids:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    # Fetch deliveries in the final over of the 2nd innings, in chunks
    all_deliveries: list[dict] = []
    for chunk in _chunk(match_ids, 50):
        rows = (
            client.table("deliveries")
            .select("match_id,innings,over_ball,striker_id,bowler_id,runs_batter,runs_total,wicket_type,extras_type")
            .in_("match_id", chunk)
            .eq("innings", 2)
            .gte("over_ball", over_floor)
            .lt("over_ball", over_ceil)
            .limit(5000)
            .execute()
        ).data
        all_deliveries.extend(rows)

    if not all_deliveries:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    MIN_BALLS = 10

    if role == "bowler":
        # Group by bowler_id
        from collections import defaultdict
        bowler_stats: dict[int, dict] = defaultdict(lambda: {
            "balls": 0,
            "runs_total": 0,
            "wickets": 0,
        })

        for d in all_deliveries:
            bid = d.get("bowler_id")
            if bid is None:
                continue
            extras_type = d.get("extras_type") or ""
            # Wides don't count as a valid ball for economy denominator
            is_wide = extras_type == "wides"
            if not is_wide:
                bowler_stats[bid]["balls"] += 1
            # Runs still charged regardless
            bowler_stats[bid]["runs_total"] += d.get("runs_total") or 0
            if d.get("wicket_type") and not is_wide:
                bowler_stats[bid]["wickets"] += 1

        # Filter minimum balls and compute economy
        qualified = []
        for pid, s in bowler_stats.items():
            balls = s["balls"]
            if balls < MIN_BALLS:
                continue
            economy = round(s["runs_total"] / balls * 6, 2)
            qualified.append({
                "player_id": pid,
                "balls": balls,
                "runs_conceded": s["runs_total"],
                "wickets": s["wickets"],
                "economy": economy,
                "qualification": f"{balls} balls in final over",
            })

        # Sort by economy asc (lower = better)
        qualified.sort(key=lambda x: x["economy"])
        top = qualified[:limit]

        # Fetch player names
        pids = [x["player_id"] for x in top]
        name_map: dict[int, str] = {}
        for chunk in _chunk(pids, 50):
            nr = (
                client.table("player_meta")
                .select("player_id,name")
                .in_("player_id", chunk)
                .execute()
            ).data
            for r in nr:
                name_map[r["player_id"]] = r.get("name") or str(r["player_id"])

        for row in top:
            row["name"] = name_map.get(row["player_id"], str(row["player_id"]))

        specialists = top

    else:  # role == "batter"
        from collections import defaultdict
        batter_stats: dict[int, dict] = defaultdict(lambda: {
            "balls": 0,
            "runs": 0,
            "sixes": 0,
            "fours": 0,
        })

        for d in all_deliveries:
            sid = d.get("striker_id")
            if sid is None:
                continue
            extras_type = d.get("extras_type") or ""
            is_wide = extras_type == "wides"
            if not is_wide:
                batter_stats[sid]["balls"] += 1
            runs_batter = d.get("runs_batter") or 0
            batter_stats[sid]["runs"] += runs_batter
            if runs_batter == 6:
                batter_stats[sid]["sixes"] += 1
            elif runs_batter == 4:
                batter_stats[sid]["fours"] += 1

        qualified = []
        for pid, s in batter_stats.items():
            balls = s["balls"]
            if balls < MIN_BALLS:
                continue
            sr = round(s["runs"] / balls * 100, 2)
            qualified.append({
                "player_id": pid,
                "balls": balls,
                "runs": s["runs"],
                "sixes": s["sixes"],
                "fours": s["fours"],
                "strike_rate": sr,
                "qualification": f"{balls} balls in final over",
            })

        # Sort by strike rate desc (higher = better)
        qualified.sort(key=lambda x: x["strike_rate"], reverse=True)
        top = qualified[:limit]

        # Fetch player names
        pids = [x["player_id"] for x in top]
        name_map: dict[int, str] = {}
        for chunk in _chunk(pids, 50):
            nr = (
                client.table("player_meta")
                .select("player_id,name")
                .in_("player_id", chunk)
                .execute()
            ).data
            for r in nr:
                name_map[r["player_id"]] = r.get("name") or str(r["player_id"])

        for row in top:
            row["name"] = name_map.get(row["player_id"], str(row["player_id"]))

        specialists = top

    result = FinalOverSpecialistResponse(
        league_id=league_id,
        season=season,
        role=role,
        over_analyzed=over_label,
        specialists=specialists,
    )

    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result
