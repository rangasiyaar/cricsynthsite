"""Matchup analytics endpoints.

GET /v1/matchups/optimal-bowler — rank a list of bowlers against a specific batter
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


class OptimalBowlerResponse(BaseModel):
    batter_id: int
    batter_name: str | None
    ranked_bowlers: list[dict]  # player_id, name, balls_faced, runs, dismissals,
    #                             sr_conceded, dismissal_rate, confidence, rank
    recommendation: str
    caveat: str | None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _chunk(lst: list, n: int):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def _confidence_label(balls: int) -> str:
    if balls >= 20:
        return "high"
    if balls >= 10:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Endpoint: Optimal Bowler
# ---------------------------------------------------------------------------


@router.get(
    "/matchups/optimal-bowler",
    response_model=OptimalBowlerResponse,
    summary="Rank bowlers by effectiveness against a specific batter",
    description=(
        "Given a batter ID and a comma-separated list of bowler IDs (up to 10), returns each "
        "bowler ranked by their historical effectiveness against that specific batter — primary "
        "sort by dismissal rate (desc), secondary by strike rate conceded (asc).\n\n"
        "Minimum sample sizes required:\n"
        "- **high confidence**: ≥ 20 balls\n"
        "- **medium confidence**: 10–19 balls\n"
        "- **low confidence**: < 10 balls (still included, flagged)\n\n"
        "Results cached for **30 minutes** (fantasy-sensitive data).\n\n"
        "**Example**: `?batter_id=253802&bowler_ids=234651,291553,53540&format=T20`"
    ),
)
@limiter.limit("60/minute")
async def get_optimal_bowler(
    request: Request,
    batter_id: int = Query(..., description="Player ID of the batter to analyse against"),
    bowler_ids: str = Query(..., description="Comma-separated list of bowler player IDs (max 10)"),
    format: str | None = Query(None, description="Optional format filter: `T20` or `ODI`"),
    _key_id: str = Depends(require_api_key),
):
    """Rank a set of bowlers by historical effectiveness against a batter."""
    # Parse bowler IDs
    try:
        ids = [int(x.strip()) for x in bowler_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bowler_ids must be a comma-separated list of integers",
        )

    if not ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bowler_ids must contain at least one bowler ID",
        )
    if len(ids) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 bowler IDs allowed per request",
        )

    if format:
        fmt = format.upper()
        if fmt not in ("T20", "ODI"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="format must be T20 or ODI",
            )
    else:
        fmt = None

    ck = cache_key("optimal_bowler", batter_id, str(sorted(ids)), fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    # Optional: if format filter requested, gather match_ids in that format
    format_match_ids: list[int] | None = None
    if fmt:
        league_rows = (
            client.table("leagues")
            .select("league_id")
            .eq("format", fmt)
            .execute()
        )
        league_ids = [r["league_id"] for r in league_rows.data]
        if league_ids:
            match_rows = (
                client.table("matches")
                .select("match_id")
                .in_("league_id", league_ids)
                .limit(5000)
                .execute()
            ).data
            format_match_ids = [r["match_id"] for r in match_rows]

    # Fetch batter name
    batter_meta = (
        client.table("player_meta")
        .select("player_id,name")
        .eq("player_id", batter_id)
        .limit(1)
        .execute()
    )
    batter_name: str | None = batter_meta.data[0].get("name") if batter_meta.data else None

    # For each bowler, fetch deliveries vs this batter
    bowler_results: list[dict] = []

    for bowler_id in ids:
        query = (
            client.table("deliveries")
            .select("match_id,runs_batter,runs_total,wicket_type,extras_type")
            .eq("striker_id", batter_id)
            .eq("bowler_id", bowler_id)
            .limit(500)
        )
        rows = query.execute().data

        # Filter by format if requested
        if format_match_ids is not None:
            format_set = set(format_match_ids)
            rows = [r for r in rows if r.get("match_id") in format_set]

        balls = 0
        runs = 0
        dismissals = 0

        for d in rows:
            extras_type = d.get("extras_type") or ""
            is_wide = extras_type == "wides"
            if not is_wide:
                balls += 1
                runs += d.get("runs_batter") or 0
                if d.get("wicket_type"):
                    dismissals += 1

        sr_conceded = round(runs / balls * 100, 2) if balls > 0 else 0.0
        # dismissal_rate: dismissals per 10 balls (higher = more dangerous to this batter)
        dismissal_rate = round(dismissals / balls * 10, 2) if balls > 0 else 0.0
        confidence = _confidence_label(balls)

        bowler_results.append({
            "player_id": bowler_id,
            "balls_faced": balls,
            "runs": runs,
            "dismissals": dismissals,
            "sr_conceded": sr_conceded,
            "dismissal_rate": dismissal_rate,
            "confidence": confidence,
        })

    # Sort: primary = dismissal_rate desc, secondary = sr_conceded asc
    bowler_results.sort(key=lambda x: (-x["dismissal_rate"], x["sr_conceded"]))

    # Assign ranks
    for i, row in enumerate(bowler_results):
        row["rank"] = i + 1

    # Fetch bowler names
    bowler_pid_list = [r["player_id"] for r in bowler_results]
    name_map: dict[int, str] = {}
    for chunk in _chunk(bowler_pid_list, 50):
        nr = (
            client.table("player_meta")
            .select("player_id,name")
            .in_("player_id", chunk)
            .execute()
        ).data
        for r in nr:
            name_map[r["player_id"]] = r.get("name") or str(r["player_id"])

    for row in bowler_results:
        row["name"] = name_map.get(row["player_id"], str(row["player_id"]))

    # Build recommendation string
    best = bowler_results[0] if bowler_results else None
    if best and best["balls_faced"] > 0:
        best_name = best["name"]
        d_count = best["dismissals"]
        b_count = best["balls_faced"]
        if d_count > 0:
            recommendation = (
                f"{best_name} is the most effective option against this batter "
                f"({d_count} dismissal{'s' if d_count != 1 else ''} in {b_count} balls, "
                f"SR conceded: {best['sr_conceded']})"
            )
        else:
            recommendation = (
                f"{best_name} concedes the lowest strike rate against this batter "
                f"({best['sr_conceded']} SR in {b_count} balls)"
            )
    else:
        recommendation = "Insufficient head-to-head data to make a firm recommendation"

    # Caveat if any bowler has low confidence
    low_confidence_bowlers = [
        r["name"] for r in bowler_results if r["confidence"] == "low"
    ]
    if low_confidence_bowlers:
        caveat = (
            f"Low sample size for: {', '.join(low_confidence_bowlers)} — "
            "treat these rankings with caution"
        )
    else:
        caveat = None

    result = OptimalBowlerResponse(
        batter_id=batter_id,
        batter_name=batter_name,
        ranked_bowlers=bowler_results,
        recommendation=recommendation,
        caveat=caveat,
    )

    cache_set(ck, result.model_dump(), ttl_seconds=1800)
    return result
