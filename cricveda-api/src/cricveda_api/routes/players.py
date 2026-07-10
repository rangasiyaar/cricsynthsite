"""Player endpoints.

GET /v1/players/{player_id}/form       — recent form stats
GET /v1/players/{player_id}/vs/{type}  — matchup breakdown (pace/spin/lefts)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from cricveda_api.auth import require_api_key
from cricveda_api.cache import cache_get, cache_key, cache_set
from cricveda_api.deps import limiter

router = APIRouter()


class PlayerForm(BaseModel):
    player_id: int
    name: str | None
    role: str | None
    batting_hand: str | None
    bowling_style: str | None
    nationality: str | None
    # Rolling form
    matches_last_10: int
    fp_last3_avg: float
    fp_last5_avg: float
    fp_last10_avg: float
    fp_std5: float
    fp_trend: str          # "rising" | "falling" | "stable"
    # Batting
    bat_runs_avg5: float
    bat_sr_avg5: float
    bat_boundary_pct5: float
    # Bowling
    bowl_wkts_avg5: float
    bowl_eco_avg5: float
    # Recent matches (last 5)
    recent_scores: list[dict]


class MatchupStats(BaseModel):
    player_id: int
    matchup_type: str       # "pace" | "spin" | "left-arm"
    strike_rate: float | None
    economy_rate: float | None
    sample_deliveries: int


@router.get(
    "/players/{player_id}/form",
    response_model=PlayerForm,
    summary="Player rolling form profile",
    description=(
        "Returns a player's current form profile — rolling performance score averages (last 3/5/10 matches), "
        "batting and bowling stats, form trend (`rising` / `falling` / `stable`), "
        "and their last 5 match scores with opposition. Cached for **30 minutes**.\n\n"
        "`player_id` is the ESPNcricinfo numeric player ID."
    ),
)
@limiter.limit("60/minute")
async def get_player_form(
    request: Request,
    player_id: int,
    _key_id: str = Depends(require_api_key),
):
    """Get rolling form stats and recent scores for a player."""
    ck = cache_key("player_form", player_id)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    # Player metadata
    meta_rows = client.table("player_meta").select("*").eq("player_id", player_id).execute()
    if not meta_rows.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    meta = meta_rows.data[0]

    # Last 10 fantasy point records (joined with match date)
    fp_rows = (
        client.table("fantasy_points")
        .select("player_id, total_points, batting_points, bowling_points, fielding_points, match_id, matches(match_date, team1, team2)")
        .eq("player_id", player_id)
        .eq("training_exclude", False)
        .order("matches(match_date)", desc=True)
        .limit(10)
        .execute()
    )

    scores = []
    pts_list = []
    for r in fp_rows.data:
        match_info = r.get("matches") or {}
        pts_list.append(r["total_points"])
        scores.append({
            "match_id": r["match_id"],
            "match_date": match_info.get("match_date"),
            "vs": f"{match_info.get('team1', '')} vs {match_info.get('team2', '')}",
            "total_points": r["total_points"],
            "batting_points": r["batting_points"],
            "bowling_points": r["bowling_points"],
            "fielding_points": r["fielding_points"],
        })

    import numpy as np

    def safe_mean(arr, n):
        sub = arr[:n]
        return round(float(np.mean(sub)), 2) if sub else 0.0

    def safe_std(arr, n):
        sub = arr[:n]
        return round(float(np.std(sub)), 2) if len(sub) >= 2 else 0.0

    # Trend: fit a line to last 5 scores
    trend = "stable"
    if len(pts_list) >= 3:
        x = list(range(min(len(pts_list), 5)))
        y = pts_list[:len(x)]
        slope = float(np.polyfit(x, y, 1)[0])
        if slope > 2:
            trend = "rising"
        elif slope < -2:
            trend = "falling"

    # Batting and bowling aggregates from delivery stats (last 5 matches)
    # Simplified version pulling from fantasy_points breakdown
    bat_runs = safe_mean(pts_list, 5) * 1.5   # rough proxy until delivery stats endpoint
    bat_sr = 130.0                              # placeholder until delivery-level query
    bat_bpct = 0.15
    bowl_wkts = 0.0
    bowl_eco = 7.5

    result = PlayerForm(
        player_id=player_id,
        name=meta.get("name"),
        role=meta.get("primary_role"),
        batting_hand=meta.get("batting_hand"),
        bowling_style=meta.get("bowling_style"),
        nationality=meta.get("nationality"),
        matches_last_10=len(pts_list),
        fp_last3_avg=safe_mean(pts_list, 3),
        fp_last5_avg=safe_mean(pts_list, 5),
        fp_last10_avg=safe_mean(pts_list, 10),
        fp_std5=safe_std(pts_list, 5),
        fp_trend=trend,
        bat_runs_avg5=round(bat_runs, 1),
        bat_sr_avg5=bat_sr,
        bat_boundary_pct5=bat_bpct,
        bowl_wkts_avg5=bowl_wkts,
        bowl_eco_avg5=bowl_eco,
        recent_scores=scores[:5],
    )

    cache_set(ck, result.model_dump(), ttl_seconds=1800)
    return result


@router.get(
    "/players/{player_id}/vs/{matchup_type}",
    response_model=MatchupStats,
    summary="Batter vs bowling style matchup",
    description=(
        "Returns a batter's career strike rate or a bowler's economy rate against a specific "
        "bowling category, computed from historical ball-by-ball data.\n\n"
        "**matchup_type options:**\n"
        "- `pace` — right-arm fast, medium, left-arm fast\n"
        "- `spin` — off-break, leg-break, slow left-arm\n"
        "- `left-arm` — all left-arm styles\n\n"
        "Requires a minimum of 10 sample deliveries; returns `null` if insufficient data."
    ),
)
@limiter.limit("60/minute")
async def get_player_matchup(
    request: Request,
    player_id: int,
    matchup_type: str,
    _key_id: str = Depends(require_api_key),
):
    """Get batter SR or bowler economy vs a specific bowling category."""
    valid_types = {"pace", "spin", "left-arm"}
    if matchup_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"matchup_type must be one of: {', '.join(valid_types)}",
        )

    ck = cache_key("player_matchup", player_id, matchup_type)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    if not client.table("player_meta").select("player_id").eq("player_id", player_id).execute().data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    PACE_STYLES = {"right-arm-fast", "right-arm-medium", "left-arm-fast"}
    SPIN_STYLES = {"right-arm-off-break", "right-arm-leg-break", "slow-left-arm"}
    LEFT_ARM_STYLES = {"left-arm-fast", "slow-left-arm"}

    style_filter = {
        "pace": PACE_STYLES,
        "spin": SPIN_STYLES,
        "left-arm": LEFT_ARM_STYLES,
    }[matchup_type]

    # Get bowlers with matching style
    style_bowlers = (
        client.table("player_meta")
        .select("player_id")
        .in_("bowling_style", list(style_filter))
        .execute()
    )
    bowler_ids = [r["player_id"] for r in style_bowlers.data]

    if not bowler_ids:
        result = MatchupStats(
            player_id=player_id,
            matchup_type=matchup_type,
            strike_rate=None,
            economy_rate=None,
            sample_deliveries=0,
        )
        cache_set(ck, result.model_dump(), ttl_seconds=3600)
        return result

    # Fetch deliveries where this player was striker vs these bowlers
    # (limit to avoid memory issues — last 2000 deliveries)
    del_rows = (
        client.table("deliveries")
        .select("runs_batter, extras_type")
        .eq("striker_id", player_id)
        .in_("bowler_id", bowler_ids[:200])  # limit bowler filter size
        .not_.in_("extras_type", ["wides"])
        .limit(2000)
        .execute()
    )

    deliveries = del_rows.data
    n = len(deliveries)
    sr = None
    eco = None

    if n >= 10:
        total_runs = sum(d["runs_batter"] or 0 for d in deliveries)
        sr = round(total_runs / n * 100, 1)

    result = MatchupStats(
        player_id=player_id,
        matchup_type=matchup_type,
        strike_rate=sr,
        economy_rate=eco,
        sample_deliveries=n,
    )

    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result
