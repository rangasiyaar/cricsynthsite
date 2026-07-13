"""Oracle endpoints — probabilistic match-state analysis from ball-by-ball data.

GET /v1/oracle/win-probability     — live chase / 1st-innings win probability
GET /v1/oracle/collapse-probability — probability of a batting collapse from current state
"""
from __future__ import annotations

import statistics
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from cricveda_api.auth import require_api_key
from cricveda_api.cache import cache_get, cache_key, cache_set
from cricveda_api.deps import limiter

router = APIRouter()

_TTL = 21600  # 6 hours

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_div(numerator: float, denominator: float, fallback: float = 0.0) -> float:
    return numerator / denominator if denominator != 0 else fallback


def _confidence(sample_size: int) -> str:
    if sample_size > 100:
        return "high"
    if sample_size >= 30:
        return "medium"
    return "low"


def _total_overs(fmt: str) -> int:
    return 20 if fmt.upper() == "T20" else 50


def _parse_over_ball(over_ball: float | None) -> float:
    """Return over_ball as a float for comparison. over_ball like 9.3 = 9th over 3rd ball."""
    if over_ball is None:
        return 0.0
    return float(over_ball)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class WinProbabilityResponse(BaseModel):
    win_probability: float           # 0.0–1.0
    runs_needed: int | None
    balls_remaining: int | None
    required_rr: float | None
    blueprint: list[dict]            # [{"over": int, "target_runs_by_end": int}, ...]
    sample_size: int
    confidence: str                  # "high" / "medium" / "low"


class CollapseProbabilityResponse(BaseModel):
    collapse_probability: float      # 0.0–1.0
    definition: str                  # "3+ wickets in next 30 balls"
    most_common_trigger: str | None  # e.g. "caught"
    expected_runs_if_collapse: float | None
    expected_runs_if_no_collapse: float | None
    sample_size: int
    confidence: str


# ---------------------------------------------------------------------------
# Endpoint 1: Win Probability
# ---------------------------------------------------------------------------

@router.get(
    "/oracle/win-probability",
    response_model=WinProbabilityResponse,
    summary="Live win probability from match state",
    description=(
        "Estimates the batting team's win probability from the current match state using "
        "historical ball-by-ball data. Provide the innings, over, wickets fallen, runs scored "
        "so far, and (for a chase) the target. Results cached for **6 hours**."
    ),
)
@limiter.limit("30/minute")
async def get_win_probability(
    request: Request,
    format: str = Query(..., description="Match format: `T20` or `ODI`"),
    innings: int = Query(..., ge=1, le=2, description="Innings number (1 or 2)"),
    over: int = Query(..., ge=1, le=50, description="Current over (1-indexed, so 1 = first over just bowled)"),
    wickets: int = Query(..., ge=0, le=10, description="Wickets fallen so far"),
    runs: int = Query(0, ge=0, description="Runs scored so far by batting team"),
    target: int | None = Query(None, ge=1, description="Chase target (required for innings=2)"),
    _key_id: str = Depends(require_api_key),
):
    """Compute win probability for the batting team given current match state."""
    fmt = format.upper()
    if fmt not in ("T20", "ODI"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="format must be 'T20' or 'ODI'",
        )
    if innings == 2 and target is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="target is required for innings=2",
        )

    total_overs = _total_overs(fmt)
    if over > total_overs:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"over cannot exceed {total_overs} for {fmt}",
        )

    # Cache key — bucket runs/target to nearest 10 to improve hit rate
    runs_bucket = (runs // 10) * 10
    target_bucket = ((target or 0) // 10) * 10
    ck = cache_key("win_prob", fmt, innings, over, wickets, runs_bucket, target_bucket)
    cached = cache_get(ck)
    if cached:
        return WinProbabilityResponse(**cached)

    # ── Chase metrics ────────────────────────────────────────────────────────
    runs_needed: int | None = None
    balls_remaining: int | None = None
    required_rr: float | None = None
    blueprint: list[dict] = []

    if innings == 2 and target is not None:
        runs_needed = max(target - runs, 0)
        balls_remaining = (total_overs - over) * 6
        required_rr = round(_safe_div(runs_needed, balls_remaining / 6), 2) if balls_remaining > 0 else None

        # Blueprint: what score is needed by milestone overs
        milestone_overs: list[int]
        if fmt == "T20":
            milestone_overs = [o for o in (10, 15, 18, 19) if o > over]
        else:
            milestone_overs = [o for o in (20, 30, 40, 45, 48, 49) if o > over]

        for mo in milestone_overs:
            balls_used_at_mo = mo * 6
            total_balls = total_overs * 6
            # Linear interpolation: assume constant scoring rate
            if total_balls > 0:
                needed_at_mo = runs + round(runs_needed * (balls_used_at_mo - over * 6) / max(balls_remaining, 1))
                # Cap at target - 1 (still need one more run after the milestone)
                blueprint.append({"over": mo, "target_runs_by_end": min(needed_at_mo, target - 1)})

    # ── Fetch league IDs for this format ────────────────────────────────────
    from cricveda_ingest.db import get_client
    client = get_client()

    league_rows = client.table("leagues").select("league_id").eq("format", fmt).execute().data
    if not league_rows:
        result = WinProbabilityResponse(
            win_probability=0.5,
            runs_needed=runs_needed,
            balls_remaining=balls_remaining,
            required_rr=required_rr,
            blueprint=blueprint,
            sample_size=0,
            confidence="low",
        )
        cache_set(ck, result.model_dump(), ttl_seconds=_TTL)
        return result

    league_ids = [r["league_id"] for r in league_rows]

    # ── Fetch matches for these leagues ─────────────────────────────────────
    match_rows = (
        client.table("matches")
        .select("match_id, team1, team2, winner")
        .in_("league_id", league_ids)
        .limit(2000)
        .execute()
        .data
    )
    if not match_rows:
        result = WinProbabilityResponse(
            win_probability=0.5,
            runs_needed=runs_needed,
            balls_remaining=balls_remaining,
            required_rr=required_rr,
            blueprint=blueprint,
            sample_size=0,
            confidence="low",
        )
        cache_set(ck, result.model_dump(), ttl_seconds=_TTL)
        return result

    match_map: dict[str, dict] = {r["match_id"]: r for r in match_rows}
    match_ids = list(match_map.keys())

    # ── Fetch deliveries for the relevant innings (batch in chunks of 2000) ─
    # over_ball threshold: balls bowled strictly before the current over
    # e.g. over=6 means overs 1-5 completed → over_ball < 6.0 (i.e. < 6)
    over_threshold = float(over - 1) + 0.9999  # everything up to end of (over-1)th over

    all_deliveries: list[dict] = []
    batch_size = 2000
    offset = 0

    # We fetch in pages until we have data for a representative sample
    # Limit total fetched deliveries to 10 000 to stay well within free-tier budget
    max_deliveries = 10000

    while len(all_deliveries) < max_deliveries:
        batch = (
            client.table("deliveries")
            .select("match_id, innings, over_ball, runs_batter, runs_total, wicket_type")
            .eq("innings", innings)
            .in_("match_id", match_ids[:500])   # Supabase .in_() can handle ~500 ids safely
            .limit(batch_size)
            .offset(offset)
            .execute()
            .data
        )
        if not batch:
            break
        all_deliveries.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size

    if not all_deliveries:
        result = WinProbabilityResponse(
            win_probability=0.5,
            runs_needed=runs_needed,
            balls_remaining=balls_remaining,
            required_rr=required_rr,
            blueprint=blueprint,
            sample_size=0,
            confidence="low",
        )
        cache_set(ck, result.model_dump(), ttl_seconds=_TTL)
        return result

    # ── Group deliveries by match and compute state at `over` ───────────────
    # "State at over" = runs and wickets accumulated in deliveries with over_ball <= over_threshold
    match_state: dict[str, dict] = {}

    for d in all_deliveries:
        mid = d["match_id"]
        ob = _parse_over_ball(d.get("over_ball"))
        if mid not in match_state:
            match_state[mid] = {"runs": 0, "wickets": 0}
        if ob <= over_threshold:
            match_state[mid]["runs"] += int(d.get("runs_total") or 0)
            if d.get("wicket_type") is not None:
                match_state[mid]["wickets"] += 1

    # ── Find matches with similar state (wickets ±1, runs ±15) ──────────────
    similar_match_ids: list[str] = []
    for mid, state in match_state.items():
        if mid not in match_map:
            continue
        w_diff = abs(state["wickets"] - wickets)
        r_diff = abs(state["runs"] - runs)
        if w_diff <= 1 and r_diff <= 15:
            similar_match_ids.append(mid)

    sample_size = len(similar_match_ids)

    if sample_size == 0:
        # Widen the search to ±2 wickets, ±30 runs before giving up
        for mid, state in match_state.items():
            if mid not in match_map:
                continue
            w_diff = abs(state["wickets"] - wickets)
            r_diff = abs(state["runs"] - runs)
            if w_diff <= 2 and r_diff <= 30:
                similar_match_ids.append(mid)
        sample_size = len(similar_match_ids)

    # ── Compute win rate for the batting team ────────────────────────────────
    wins = 0
    for mid in similar_match_ids:
        m = match_map[mid]
        winner = m.get("winner")
        if winner is None:
            continue
        if innings == 1:
            # 1st innings batting team = team1 (convention) — we consider team2 as chasing
            # Win = team1 won (they set the total and defended it)
            if winner == m.get("team1"):
                wins += 1
        else:
            # 2nd innings batting team = team2 (chasing) — Win = team2 won
            if winner == m.get("team2"):
                wins += 1

    win_probability = round(_safe_div(wins, sample_size, 0.5), 4)

    # ── Clamp and sanity-check against required run rate ────────────────────
    if innings == 2 and required_rr is not None:
        # Adjust naively: very high RRR → push probability down
        max_rr = 36.0 if fmt == "T20" else 20.0  # theoretical max
        if required_rr > max_rr:
            win_probability = min(win_probability, 0.02)
        elif balls_remaining == 0:
            win_probability = 1.0 if (runs >= (target or 0)) else 0.0

    result = WinProbabilityResponse(
        win_probability=float(max(0.0, min(1.0, win_probability))),
        runs_needed=runs_needed,
        balls_remaining=balls_remaining,
        required_rr=required_rr,
        blueprint=blueprint,
        sample_size=sample_size,
        confidence=_confidence(sample_size),
    )
    cache_set(ck, result.model_dump(), ttl_seconds=_TTL)
    return result


# ---------------------------------------------------------------------------
# Endpoint 2: Collapse Probability
# ---------------------------------------------------------------------------

@router.get(
    "/oracle/collapse-probability",
    response_model=CollapseProbabilityResponse,
    summary="Probability of a batting collapse from current state",
    description=(
        "Estimates the probability that the batting team will lose 3+ wickets in the next 30 balls, "
        "based on historical matches with a similar score and wickets at the same over. "
        "Also returns the most common first-wicket trigger and expected run totals in collapse vs "
        "non-collapse scenarios. Results cached for **6 hours**."
    ),
)
@limiter.limit("30/minute")
async def get_collapse_probability(
    request: Request,
    format: str = Query(..., description="Match format: `T20` or `ODI`"),
    innings: int = Query(..., ge=1, le=2, description="Innings number (1 or 2)"),
    over: int = Query(..., ge=1, le=50, description="Current over (1-indexed)"),
    wickets: int = Query(..., ge=0, le=10, description="Wickets fallen so far"),
    score: int = Query(..., ge=0, description="Runs scored so far"),
    _key_id: str = Depends(require_api_key),
):
    """Compute batting collapse probability from current match state."""
    fmt = format.upper()
    if fmt not in ("T20", "ODI"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="format must be 'T20' or 'ODI'",
        )

    total_overs = _total_overs(fmt)
    if over > total_overs:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"over cannot exceed {total_overs} for {fmt}",
        )

    ck = cache_key("collapse_prob", fmt, innings, over, wickets, score)
    cached = cache_get(ck)
    if cached:
        return CollapseProbabilityResponse(**cached)

    _default = CollapseProbabilityResponse(
        collapse_probability=0.0,
        definition="3+ wickets in next 30 balls",
        most_common_trigger=None,
        expected_runs_if_collapse=None,
        expected_runs_if_no_collapse=None,
        sample_size=0,
        confidence="low",
    )

    # ── Fetch league IDs for this format ────────────────────────────────────
    from cricveda_ingest.db import get_client
    client = get_client()

    league_rows = client.table("leagues").select("league_id").eq("format", fmt).execute().data
    if not league_rows:
        cache_set(ck, _default.model_dump(), ttl_seconds=_TTL)
        return _default

    league_ids = [r["league_id"] for r in league_rows]

    # ── Fetch match IDs ──────────────────────────────────────────────────────
    match_rows = (
        client.table("matches")
        .select("match_id")
        .in_("league_id", league_ids)
        .limit(2000)
        .execute()
        .data
    )
    if not match_rows:
        cache_set(ck, _default.model_dump(), ttl_seconds=_TTL)
        return _default

    match_ids = [r["match_id"] for r in match_rows]

    # ── Fetch deliveries for this innings in batches ─────────────────────────
    # We need both "before over" (to establish state) and "30 balls after over" (to detect collapse).
    # The window end = over + 5 overs (= 30 balls).
    window_end_over = over + 5  # exclusive outer boundary

    all_deliveries: list[dict] = []
    batch_size = 2000
    offset = 0
    max_deliveries = 10000

    while len(all_deliveries) < max_deliveries:
        batch = (
            client.table("deliveries")
            .select("match_id, innings, over_ball, runs_total, wicket_type")
            .eq("innings", innings)
            .in_("match_id", match_ids[:500])
            .limit(batch_size)
            .offset(offset)
            .execute()
            .data
        )
        if not batch:
            break
        all_deliveries.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size

    if not all_deliveries:
        cache_set(ck, _default.model_dump(), ttl_seconds=_TTL)
        return _default

    # ── Group deliveries by match ────────────────────────────────────────────
    # For each match:
    #   - Compute state AT `over`: runs_at_over, wickets_at_over
    #   - Check the window (over, over+5]: count wickets and runs in next 30 balls
    # over_ball is NUMERIC like 9.3 meaning over 10 ball 3 (0-indexed over, 1-indexed ball)
    # over_ball < over → deliveries bowled before current over starts
    # over_ball in [over, over+5) → the 30-ball window

    over_threshold = float(over - 1) + 0.9999   # end of (over-1) = before `over` begins
    window_start = float(over - 1) + 0.00001    # start of ball after over_threshold
    window_end = float(over + 5 - 1) + 0.9999  # end of 5th over after current

    # Build per-match delivery index
    by_match: dict[str, list[dict]] = {}
    for d in all_deliveries:
        mid = d["match_id"]
        by_match.setdefault(mid, []).append(d)

    # ── Find matches with similar state ─────────────────────────────────────
    similar_states: list[dict] = []

    for mid, deliveries in by_match.items():
        # State at `over`
        runs_at = 0
        wickets_at = 0
        for d in deliveries:
            ob = _parse_over_ball(d.get("over_ball"))
            if ob <= over_threshold:
                runs_at += int(d.get("runs_total") or 0)
                if d.get("wicket_type") is not None:
                    wickets_at += 1

        # Similar? (±1 wicket, ±20 runs)
        if abs(wickets_at - wickets) > 1 or abs(runs_at - score) > 20:
            continue

        # Compute collapse window: wickets and runs in next 30 balls
        window_wickets = 0
        window_runs = 0
        first_wicket_type: str | None = None

        # Sort deliveries in window by over_ball for ordered processing
        window_deliveries = sorted(
            [d for d in deliveries if window_start <= _parse_over_ball(d.get("over_ball")) <= window_end],
            key=lambda d: _parse_over_ball(d.get("over_ball")),
        )

        balls_counted = 0
        for d in window_deliveries:
            if balls_counted >= 30:
                break
            window_runs += int(d.get("runs_total") or 0)
            if d.get("wicket_type") is not None:
                window_wickets += 1
                if first_wicket_type is None:
                    first_wicket_type = d["wicket_type"]
            balls_counted += 1

        is_collapse = window_wickets >= 3

        similar_states.append({
            "match_id": mid,
            "is_collapse": is_collapse,
            "window_runs": window_runs,
            "first_wicket_type": first_wicket_type,
        })

    sample_size = len(similar_states)

    if sample_size == 0:
        # Widen to ±2 wickets, ±35 runs
        for mid, deliveries in by_match.items():
            runs_at = 0
            wickets_at = 0
            for d in deliveries:
                ob = _parse_over_ball(d.get("over_ball"))
                if ob <= over_threshold:
                    runs_at += int(d.get("runs_total") or 0)
                    if d.get("wicket_type") is not None:
                        wickets_at += 1
            if abs(wickets_at - wickets) > 2 or abs(runs_at - score) > 35:
                continue
            window_wickets = 0
            window_runs = 0
            first_wicket_type = None
            window_deliveries = sorted(
                [d for d in deliveries if window_start <= _parse_over_ball(d.get("over_ball")) <= window_end],
                key=lambda d: _parse_over_ball(d.get("over_ball")),
            )
            balls_counted = 0
            for d in window_deliveries:
                if balls_counted >= 30:
                    break
                window_runs += int(d.get("runs_total") or 0)
                if d.get("wicket_type") is not None:
                    window_wickets += 1
                    if first_wicket_type is None:
                        first_wicket_type = d["wicket_type"]
                balls_counted += 1
            similar_states.append({
                "match_id": mid,
                "is_collapse": window_wickets >= 3,
                "window_runs": window_runs,
                "first_wicket_type": first_wicket_type,
            })
        sample_size = len(similar_states)

    if sample_size == 0:
        cache_set(ck, _default.model_dump(), ttl_seconds=_TTL)
        return _default

    # ── Compute collapse probability ─────────────────────────────────────────
    collapse_states = [s for s in similar_states if s["is_collapse"]]
    no_collapse_states = [s for s in similar_states if not s["is_collapse"]]

    collapse_probability = round(_safe_div(len(collapse_states), sample_size), 4)

    # Most common first-wicket trigger across collapse cases
    trigger_counter: Counter = Counter(
        s["first_wicket_type"]
        for s in collapse_states
        if s["first_wicket_type"] is not None
    )
    most_common_trigger: str | None = trigger_counter.most_common(1)[0][0] if trigger_counter else None

    # Expected runs in window for collapse vs no-collapse scenarios
    expected_runs_if_collapse: float | None = None
    if collapse_states:
        runs_list = [s["window_runs"] for s in collapse_states]
        expected_runs_if_collapse = round(sum(runs_list) / len(runs_list), 1)

    expected_runs_if_no_collapse: float | None = None
    if no_collapse_states:
        runs_list = [s["window_runs"] for s in no_collapse_states]
        expected_runs_if_no_collapse = round(sum(runs_list) / len(runs_list), 1)

    result = CollapseProbabilityResponse(
        collapse_probability=float(max(0.0, min(1.0, collapse_probability))),
        definition="3+ wickets in next 30 balls",
        most_common_trigger=most_common_trigger,
        expected_runs_if_collapse=expected_runs_if_collapse,
        expected_runs_if_no_collapse=expected_runs_if_no_collapse,
        sample_size=sample_size,
        confidence=_confidence(sample_size),
    )
    cache_set(ck, result.model_dump(), ttl_seconds=_TTL)
    return result
