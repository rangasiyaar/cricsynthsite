"""Match analytics routes — pitch reading and momentum curve."""
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
# Response models
# ---------------------------------------------------------------------------

class PitchReadingResponse(BaseModel):
    match_id: int
    overs_analyzed: int
    classification: str  # "batting-friendly"/"pace-friendly"/"balanced"/"insufficient_data"
    confidence: str  # "low"/"medium"/"high"
    actual_run_rate: float
    wickets_in_sample: int
    wicket_types: dict  # {"caught": 2, "bowled": 1, ...}
    pace_indicator: float  # 0-1, higher = more seam/swing
    vs_venue_baseline: str | None  # "above"/"below"/"at" average, if venue data available
    interpretation: str  # human-readable sentence


class MomentumPoint(BaseModel):
    delivery_num: int
    innings: int
    over_ball: float
    event: str  # "boundary"/"wicket"/"dot"/"normal"
    runs_this_ball: int
    wicket_type: str | None
    wp_batting_team: float  # 0-1
    wp_delta: float  # change from previous


class MomentumCurveResponse(BaseModel):
    match_id: int
    team1: str
    team2: str
    winner: str | None
    total_deliveries: int
    curve: list[MomentumPoint]
    turning_point: MomentumPoint | None
    top_momentum_swings: list[MomentumPoint]  # top 3 by abs(wp_delta)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _r2(value: float) -> float:
    """Round to 2 decimal places."""
    return round(value, 2)


def _is_wide(delivery: dict) -> bool:
    return delivery.get("extras_type") == "wide"


# ---------------------------------------------------------------------------
# ENDPOINT 1: pitch-reading
# ---------------------------------------------------------------------------

@router.get(
    "/matches/{match_id}/pitch-reading",
    response_model=PitchReadingResponse,
    summary="Pitch reading from early overs",
    description=(
        "Reads the pitch from the first N completed overs of innings 1 and returns a "
        "classification (batting-friendly / pace-friendly / balanced). "
        "Results are cached for **6 hours**. "
        "Use `after_over` to control how many overs to analyse (default 3)."
    ),
)
@limiter.limit("60/minute")
async def get_pitch_reading(
    request: Request,
    match_id: int,
    after_over: int = Query(3, ge=1, le=20, description="Read pitch from first N completed overs"),
    _key_id: str = Depends(require_api_key),
) -> PitchReadingResponse:
    """Return a pitch classification based on early-overs deliveries."""
    ck = cache_key("pitch_reading", match_id, after_over)
    cached = cache_get(ck)
    if cached:
        return PitchReadingResponse(**cached)

    from cricveda_ingest.db import get_client
    client = get_client()

    # 1. Validate match exists
    match_rows = (
        client.table("matches")
        .select("match_id, venue_id, team1, team2")
        .eq("match_id", match_id)
        .limit(1)
        .execute()
        .data
    )
    if not match_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found")
    match = match_rows[0]

    # 2. Fetch venue data
    venue_data: dict | None = None
    if match.get("venue_id") is not None:
        venue_rows = (
            client.table("venues")
            .select("avg_first_innings_score, avg_pace_economy, avg_spin_economy")
            .eq("venue_id", match["venue_id"])
            .limit(1)
            .execute()
            .data
        )
        venue_data = venue_rows[0] if venue_rows else None

    # 3. Fetch deliveries: innings=1, over_ball < after_over (first N overs)
    deliveries = (
        client.table("deliveries")
        .select(
            "runs_total, runs_batter, runs_extras, extras_type, wicket_type, over_ball"
        )
        .eq("match_id", match_id)
        .eq("innings", 1)
        .lt("over_ball", after_over)
        .limit(100)
        .execute()
        .data
    )

    # 4. Insufficient data guard
    if len(deliveries) < 12:
        result = PitchReadingResponse(
            match_id=match_id,
            overs_analyzed=0,
            classification="insufficient_data",
            confidence="low",
            actual_run_rate=0.0,
            wickets_in_sample=0,
            wicket_types={},
            pace_indicator=0.0,
            vs_venue_baseline=None,
            interpretation="Insufficient deliveries to classify pitch.",
        )
        cache_set(ck, result.model_dump(), ttl_seconds=21600)
        return result

    # 5. Compute metrics
    total_runs = sum(d["runs_total"] for d in deliveries)

    # Legal balls exclude wides
    legal_balls = sum(1 for d in deliveries if not _is_wide(d))
    legal_balls = max(1, legal_balls)

    actual_run_rate = _r2((total_runs / legal_balls) * 6)

    # Wicket type distribution (ignore None)
    wicket_type_dist: dict[str, int] = {}
    for d in deliveries:
        wt = d.get("wicket_type")
        if wt:
            wicket_type_dist[wt] = wicket_type_dist.get(wt, 0) + 1

    total_wickets = sum(wicket_type_dist.values())
    bowled_count = wicket_type_dist.get("bowled", 0)
    lbw_count = wicket_type_dist.get("lbw", 0)
    caught_count = wicket_type_dist.get("caught", 0)

    pace_indicator = _r2((bowled_count + lbw_count) / max(1, total_wickets))
    bounce_indicator = caught_count / max(1, total_wickets)

    overs_analyzed = after_over

    # 6. Classification
    venue_avg_pace_eco: float | None = None
    if venue_data:
        raw = venue_data.get("avg_pace_economy")
        venue_avg_pace_eco = float(raw) if raw is not None else None

    baseline = venue_avg_pace_eco if venue_avg_pace_eco is not None else 7.5

    if pace_indicator > 0.5 and actual_run_rate < baseline:
        classification = "pace-friendly"
    elif bounce_indicator > 0.5:
        classification = "pace-friendly"
    elif actual_run_rate > 9.0:
        classification = "batting-friendly"
    elif total_wickets == 0 and actual_run_rate > 8.0:
        classification = "batting-friendly"
    else:
        classification = "balanced"

    # 7. Confidence from wickets fallen
    if total_wickets <= 1:
        confidence = "low"
    elif total_wickets <= 3:
        confidence = "medium"
    else:
        confidence = "high"

    # Venue baseline comparison
    vs_venue_baseline: str | None = None
    if venue_avg_pace_eco is not None:
        diff = actual_run_rate - venue_avg_pace_eco
        if abs(diff) <= 0.3:
            vs_venue_baseline = "at"
        elif diff > 0:
            vs_venue_baseline = "above"
        else:
            vs_venue_baseline = "below"

    # Interpretation sentence
    pace_desc_parts: list[str] = []
    if bowled_count + lbw_count > 0:
        pace_desc_parts.append(f"{bowled_count + lbw_count} bowled/LBW")
    if caught_count > 0:
        pace_desc_parts.append(f"{caught_count} caught")

    if classification == "pace-friendly" and total_wickets > 0:
        pace_desc = ", ".join(pace_desc_parts) if pace_desc_parts else "dismissals"
        interpretation = (
            f"{total_wickets} wicket{'s' if total_wickets != 1 else ''} in {after_over} "
            f"over{'s' if after_over != 1 else ''} with {pace_desc} suggests seam movement is available."
        )
    elif classification == "batting-friendly":
        if venue_avg_pace_eco is not None:
            interpretation = (
                f"{actual_run_rate} RPO in first {after_over} overs, "
                f"well above venue average of {_r2(venue_avg_pace_eco)} — this is a flat batting track."
            )
        else:
            interpretation = (
                f"{actual_run_rate} RPO in first {after_over} overs suggests a flat batting track."
            )
    else:
        interpretation = (
            f"{actual_run_rate} RPO with {total_wickets} wicket{'s' if total_wickets != 1 else ''} "
            f"in {after_over} overs — conditions appear balanced."
        )

    result = PitchReadingResponse(
        match_id=match_id,
        overs_analyzed=overs_analyzed,
        classification=classification,
        confidence=confidence,
        actual_run_rate=actual_run_rate,
        wickets_in_sample=total_wickets,
        wicket_types=wicket_type_dist,
        pace_indicator=pace_indicator,
        vs_venue_baseline=vs_venue_baseline,
        interpretation=interpretation,
    )
    cache_set(ck, result.model_dump(), ttl_seconds=21600)
    return result


# ---------------------------------------------------------------------------
# ENDPOINT 2: momentum-curve
# ---------------------------------------------------------------------------

@router.get(
    "/matches/{match_id}/momentum-curve",
    response_model=MomentumCurveResponse,
    summary="Ball-by-ball momentum / win-probability curve",
    description=(
        "Returns a ball-by-ball momentum curve with simplified win probability at each delivery. "
        "Identifies the key turning point and top 3 momentum swings. "
        "Results are cached for **6 hours**."
    ),
)
@limiter.limit("30/minute")
async def get_momentum_curve(
    request: Request,
    match_id: int,
    _key_id: str = Depends(require_api_key),
) -> MomentumCurveResponse:
    """Return a ball-by-ball win-probability momentum curve for a match."""
    ck = cache_key("momentum_curve", match_id)
    cached = cache_get(ck)
    if cached:
        # Rebuild nested models from dict
        cached_curve = [MomentumPoint(**p) for p in cached.get("curve", [])]
        tp_raw = cached.get("turning_point")
        tp = MomentumPoint(**tp_raw) if tp_raw else None
        swings_raw = cached.get("top_momentum_swings", [])
        swings = [MomentumPoint(**p) for p in swings_raw]
        return MomentumCurveResponse(
            match_id=cached["match_id"],
            team1=cached["team1"],
            team2=cached["team2"],
            winner=cached.get("winner"),
            total_deliveries=cached["total_deliveries"],
            curve=cached_curve,
            turning_point=tp,
            top_momentum_swings=swings,
        )

    from cricveda_ingest.db import get_client
    client = get_client()

    # 1. Validate match exists
    match_rows = (
        client.table("matches")
        .select("match_id, team1, team2, winner, toss_decision")
        .eq("match_id", match_id)
        .limit(1)
        .execute()
        .data
    )
    if not match_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found")
    match = match_rows[0]

    # 2. Fetch all deliveries ordered by innings, over_ball
    deliveries = (
        client.table("deliveries")
        .select(
            "innings, over_ball, striker_id, bowler_id, runs_total, runs_batter, "
            "runs_extras, extras_type, wicket_type"
        )
        .eq("match_id", match_id)
        .order("innings", desc=False)
        .order("over_ball", desc=False)
        .limit(500)
        .execute()
        .data
    )

    # 3. Match metadata
    team1: str = match.get("team1") or ""
    team2: str = match.get("team2") or ""
    winner: str | None = match.get("winner")

    # Split into innings
    innings1 = [d for d in deliveries if d["innings"] == 1]
    innings2 = [d for d in deliveries if d["innings"] == 2]

    # Total runs in innings 1 (target for innings 2)
    innings1_runs = sum(d["runs_total"] for d in innings1)
    target = innings1_runs + 1  # runs needed by chasing team

    # ---------------------------------------------------------------------------
    # Build momentum curve
    # ---------------------------------------------------------------------------
    ACHIEVABLE_RR = 8.0  # T20 baseline for win probability calc

    all_points: list[MomentumPoint] = []
    delivery_num = 0
    prev_wp: float | None = None

    # --- Innings 1 ---
    inn1_wickets = 0
    for d in innings1:
        delivery_num += 1
        wt = d.get("wicket_type")
        if wt:
            inn1_wickets += 1

        # Win probability for batting team (team1)
        # More wickets down → less favourable
        wp = _r2(max(0.05, min(0.95, 0.5 - (inn1_wickets / 10) * 0.2)))

        # Event classification
        runs = d["runs_total"]
        if runs >= 4:
            event = "boundary"
        elif wt is not None:
            event = "wicket"
        elif runs == 0:
            event = "dot"
        else:
            event = "normal"

        delta = _r2(wp - prev_wp) if prev_wp is not None else 0.0
        prev_wp = wp

        all_points.append(MomentumPoint(
            delivery_num=delivery_num,
            innings=1,
            over_ball=float(d["over_ball"]),
            event=event,
            runs_this_ball=runs,
            wicket_type=wt,
            wp_batting_team=wp,
            wp_delta=delta,
        ))

    # --- Innings 2 (if present) ---
    if innings2:
        inn2_runs = 0
        inn2_wickets = 0
        balls_bowled_inn2 = 0
        # Reset prev_wp to start of innings 2 baseline (even contest)
        prev_wp = 0.5

        for d in innings2:
            delivery_num += 1
            wt = d.get("wicket_type")
            runs = d["runs_total"]

            inn2_runs += runs
            if wt:
                inn2_wickets += 1

            # Track legal balls bowled in innings 2 with a running counter
            if d.get("extras_type") != "wide":
                balls_bowled_inn2 += 1
            balls_remaining = max(0, 120 - balls_bowled_inn2)
            runs_needed = max(0, target - inn2_runs)

            # Win probability for batting team (team2 chasing)
            if runs_needed <= 0:
                wp = 0.95  # already won / last ball win
            elif balls_remaining == 0:
                wp = 0.05  # failed chase
            else:
                required_rr = runs_needed / (balls_remaining / 6)
                wp = _r2(max(0.05, min(0.95, (ACHIEVABLE_RR / required_rr) * 0.5)))

            # Adjust down for wickets lost in innings 2
            wicket_penalty = inn2_wickets * 0.025
            wp = _r2(max(0.05, min(0.95, wp - wicket_penalty)))

            # Event classification
            if runs >= 4:
                event = "boundary"
            elif wt is not None:
                event = "wicket"
            elif runs == 0:
                event = "dot"
            else:
                event = "normal"

            delta = _r2(wp - prev_wp)
            prev_wp = wp

            all_points.append(MomentumPoint(
                delivery_num=delivery_num,
                innings=2,
                over_ball=float(d["over_ball"]),
                event=event,
                runs_this_ball=runs,
                wicket_type=wt,
                wp_batting_team=wp,
                wp_delta=delta,
            ))

    # 8. Turning point: delivery with largest |wp_delta|
    turning_point: MomentumPoint | None = None
    if all_points:
        turning_point = max(all_points, key=lambda p: abs(p.wp_delta))

    # 9. Top 3 momentum swings sorted by |wp_delta| desc
    sorted_swings = sorted(all_points, key=lambda p: abs(p.wp_delta), reverse=True)
    top_momentum_swings = sorted_swings[:3]

    result = MomentumCurveResponse(
        match_id=match_id,
        team1=team1,
        team2=team2,
        winner=winner,
        total_deliveries=len(all_points),
        curve=all_points,
        turning_point=turning_point,
        top_momentum_swings=top_momentum_swings,
    )

    # Serialise for cache
    cache_set(
        ck,
        {
            "match_id": match_id,
            "team1": team1,
            "team2": team2,
            "winner": winner,
            "total_deliveries": result.total_deliveries,
            "curve": [p.model_dump() for p in all_points],
            "turning_point": turning_point.model_dump() if turning_point else None,
            "top_momentum_swings": [p.model_dump() for p in top_momentum_swings],
        },
        ttl_seconds=21600,
    )
    return result


# ---------------------------------------------------------------------------
# Response models — Turning Points
# ---------------------------------------------------------------------------


class TurningPoint(BaseModel):
    innings: int
    over: int
    wp_before: float
    wp_after: float
    wp_swing: float
    key_event: dict
    description: str


class TurningPointsResponse(BaseModel):
    match_id: int
    team1: str
    team2: str
    winner: str | None
    turning_points: list[TurningPoint]


# ---------------------------------------------------------------------------
# ENDPOINT 3: turning-points
# ---------------------------------------------------------------------------


@router.get(
    "/matches/{match_id}/turning-points",
    response_model=TurningPointsResponse,
    summary="Biggest momentum-swing overs in a match",
)
@limiter.limit("30/minute")
async def get_turning_points(
    request: Request,
    match_id: int,
    _key_id: str = Depends(require_api_key),
):
    """Identify the 3-5 overs with the biggest win-probability swings."""
    ck = cache_key("turning_points", match_id)
    cached = cache_get(ck)
    if cached:
        pts = [TurningPoint(**p) for p in cached.get("turning_points", [])]
        return TurningPointsResponse(
            match_id=cached["match_id"], team1=cached["team1"], team2=cached["team2"],
            winner=cached.get("winner"), turning_points=pts,
        )

    from cricveda_ingest.db import get_client
    client = get_client()

    mrow = (client.table("matches")
            .select("match_id, team1, team2, winner")
            .eq("match_id", match_id).execute().data or [])
    if not mrow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Match {match_id} not found")
    match = mrow[0]

    deliveries = (client.table("deliveries")
                  .select("innings,over_ball,runs_total,wicket_type,striker_id,bowler_id")
                  .eq("match_id", match_id)
                  .order("innings").order("over_ball")
                  .limit(500).execute().data or [])
    if not deliveries:
        result = TurningPointsResponse(
            match_id=match_id, team1=match["team1"], team2=match["team2"],
            winner=match.get("winner"), turning_points=[],
        )
        cache_set(ck, result.model_dump(), ttl_seconds=21600)
        return result

    innings1 = [d for d in deliveries if d["innings"] == 1]
    innings2 = [d for d in deliveries if d["innings"] == 2]
    target = sum(d.get("runs_total") or 0 for d in innings1) + 1
    ACHIEVABLE_RR = 8.0

    def _wp_inn1_at(wkts):
        return _r2(max(0.05, min(0.95, 0.5 - (wkts / 10) * 0.2)))

    def _wp_inn2_at(runs_so_far, wkts, balls_bowled):
        total_balls = 120
        runs_needed = target - runs_so_far
        balls_remaining = max(0, total_balls - balls_bowled)
        if runs_needed <= 0:
            return 0.95
        if balls_remaining == 0:
            return 0.05
        required_rr = runs_needed / (balls_remaining / 6)
        wp = (ACHIEVABLE_RR / required_rr) * 0.5
        wp -= wkts * 0.025
        return _r2(max(0.05, min(0.95, wp)))

    # Aggregate per over
    over_points = []   # {innings, over, wp_after, key_event}
    from collections import defaultdict

    # innings 1
    inn1_by_over: dict = defaultdict(list)
    for d in innings1:
        inn1_by_over[int(float(d.get("over_ball") or 0)) + 1].append(d)
    cum_wkts = 0
    for ov in sorted(inn1_by_over):
        dels = inn1_by_over[ov]
        for d in dels:
            if d.get("wicket_type"):
                cum_wkts += 1
        wp_after = _wp_inn1_at(cum_wkts)
        key = _pick_key_event(dels)
        over_points.append({"innings": 1, "over": ov, "wp_after": wp_after, "key_event": key})

    # innings 2
    if innings2:
        inn2_by_over: dict = defaultdict(list)
        for d in innings2:
            inn2_by_over[int(float(d.get("over_ball") or 0)) + 1].append(d)
        cum_runs = 0
        cum_wkts2 = 0
        balls = 0
        for ov in sorted(inn2_by_over):
            dels = inn2_by_over[ov]
            for d in dels:
                cum_runs += d.get("runs_total") or 0
                if d.get("wicket_type"):
                    cum_wkts2 += 1
                if not _is_wide(d):
                    balls += 1
            wp_after = _wp_inn2_at(cum_runs, cum_wkts2, balls)
            key = _pick_key_event(dels)
            over_points.append({"innings": 2, "over": ov, "wp_after": wp_after, "key_event": key})

    # compute swings vs previous over (reset baseline at innings boundary)
    turning = []
    prev_wp = 0.5
    prev_inn = None
    for op in over_points:
        if op["innings"] != prev_inn:
            prev_wp = 0.5
            prev_inn = op["innings"]
        wp_before = prev_wp
        wp_after = op["wp_after"]
        swing = _r2(wp_after - wp_before)
        prev_wp = wp_after
        side = "chasing side" if op["innings"] == 2 else "batting side"
        ke = op["key_event"]
        desc = (
            f"Over {op['over']} (innings {op['innings']}): "
            f"{ke.get('runs', 0)} runs" + (f", wicket ({ke['wicket_type']})" if ke.get("wicket_type") else "")
            + f" swung win probability {'+' if swing >= 0 else ''}{swing} toward the {side}."
        )
        turning.append({
            "innings": op["innings"], "over": op["over"],
            "wp_before": _r2(wp_before), "wp_after": _r2(wp_after),
            "wp_swing": swing, "key_event": ke, "description": desc,
        })

    turning.sort(key=lambda t: abs(t["wp_swing"]), reverse=True)
    top = turning[:5]

    result = TurningPointsResponse(
        match_id=match_id, team1=match["team1"], team2=match["team2"],
        winner=match.get("winner"),
        turning_points=[TurningPoint(**t) for t in top],
    )
    cache_set(ck, result.model_dump(), ttl_seconds=21600)
    return result


def _pick_key_event(dels: list) -> dict:
    """Most impactful delivery in an over: a wicket, else the biggest-runs ball."""
    wicket = next((d for d in dels if d.get("wicket_type")), None)
    chosen = wicket or max(dels, key=lambda d: d.get("runs_total") or 0)
    over_runs = sum(d.get("runs_total") or 0 for d in dels)
    return {
        "striker_id": chosen.get("striker_id"),
        "bowler_id": chosen.get("bowler_id"),
        "runs": over_runs,
        "wicket_type": chosen.get("wicket_type"),
    }
