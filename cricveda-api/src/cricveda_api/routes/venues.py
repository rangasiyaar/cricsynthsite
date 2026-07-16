"""Venue analytics endpoints.

GET /v1/venues/{venue_id}/toss-intelligence  — toss win rate, batting/fielding preference
GET /v1/venues/{venue_id}/day-night-analysis — dew factor proxy, 2nd innings advantage
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
# Response models
# ---------------------------------------------------------------------------


class TossIntelligenceResponse(BaseModel):
    venue_id: int
    venue_name: str | None
    format: str
    total_matches: int
    batting_first_win_pct: float
    fielding_first_win_pct: float
    toss_alpha: float  # how much toss matters (-0.5 to +0.5)
    best_toss_decision: str  # "bat" or "field"
    win_rate_when_winning_toss: float
    confidence: str  # "high" / "medium" / "low"
    season_breakdown: list[dict]


class DayNightResponse(BaseModel):
    venue_id: int
    venue_name: str | None
    total_matches: int
    batting_second_win_pct: float
    death_overs_1st_innings_rr: float
    death_overs_2nd_innings_rr: float
    dew_factor_score: float  # 0-10
    dew_effect_interpretation: str
    strongest_effect_phase: str  # "overs_16-20" / "overs_17-20" etc


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _confidence(n: int) -> str:
    if n >= 30:
        return "high"
    if n >= 15:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Endpoint A: Toss Intelligence
# ---------------------------------------------------------------------------


@router.get(
    "/venues/{venue_id}/toss-intelligence",
    response_model=TossIntelligenceResponse,
    summary="Toss win rate and batting/fielding preference at a venue",
    description=(
        "Analyses historical match data at the given venue to quantify how much the toss matters "
        "and which decision (bat/field) is historically optimal. `toss_alpha` ranges from -0.5 to "
        "+0.5; values above 0.1 indicate the toss is meaningfully advantageous here. "
        "Results cached for **60 minutes**."
    ),
)
@limiter.limit("60/minute")
async def get_toss_intelligence(
    request: Request,
    venue_id: int,
    format: str = Query("T20", description="Match format: `T20` or `ODI`"),
    _key_id: str = Depends(require_api_key),
):
    """Return toss win rates and batting/fielding preference statistics for a venue."""
    fmt = format.upper()
    if fmt not in ("T20", "ODI"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="format must be T20 or ODI",
        )

    ck = cache_key("toss_intelligence", venue_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    # Venue metadata
    venue_rows = (
        client.table("venues")
        .select("venue_id,name")
        .eq("venue_id", venue_id)
        .limit(1)
        .execute()
    )
    venue_name: str | None = venue_rows.data[0]["name"] if venue_rows.data else None

    # Format-filtered league IDs
    league_rows = (
        client.table("leagues")
        .select("league_id")
        .eq("format", fmt)
        .execute()
    )
    league_ids = [r["league_id"] for r in league_rows.data]
    if not league_ids:
        result = TossIntelligenceResponse(
            venue_id=venue_id,
            venue_name=venue_name,
            format=fmt,
            total_matches=0,
            batting_first_win_pct=0.0,
            fielding_first_win_pct=0.0,
            toss_alpha=0.0,
            best_toss_decision="bat",
            win_rate_when_winning_toss=0.0,
            confidence="low",
            season_breakdown=[],
        )
        cache_set(ck, result.model_dump(), ttl_seconds=3600)
        return result

    # Matches at venue in these leagues
    matches = (
        client.table("matches")
        .select("match_id,season,team1,team2,winner,toss_winner,toss_decision")
        .eq("venue_id", venue_id)
        .in_("league_id", league_ids)
        .limit(500)
        .execute()
    ).data

    total = len(matches)
    if total == 0:
        result = TossIntelligenceResponse(
            venue_id=venue_id,
            venue_name=venue_name,
            format=fmt,
            total_matches=0,
            batting_first_win_pct=0.0,
            fielding_first_win_pct=0.0,
            toss_alpha=0.0,
            best_toss_decision="bat",
            win_rate_when_winning_toss=0.0,
            confidence="low",
            season_breakdown=[],
        )
        cache_set(ck, result.model_dump(), ttl_seconds=3600)
        return result

    # Toss-winner win rate
    toss_wins = sum(
        1 for m in matches
        if m.get("winner") and m.get("toss_winner") and m["winner"] == m["toss_winner"]
    )
    valid_toss = sum(1 for m in matches if m.get("winner") and m.get("toss_winner"))
    win_rate_toss = round(toss_wins / valid_toss, 4) if valid_toss else 0.5
    toss_alpha = round(win_rate_toss - 0.5, 4)

    # Batting-first wins:
    # Case 1: toss_decision=="bat" and winner==toss_winner → toss winner batted 1st and won
    # Case 2: toss_decision=="field" and winner!=toss_winner → toss loser batted 1st and won
    batting_first_wins = 0
    fielding_first_wins = 0
    valid_outcome = 0
    bat_decision_wins = 0
    bat_decision_total = 0
    field_decision_wins = 0
    field_decision_total = 0

    for m in matches:
        winner = m.get("winner")
        toss_winner = m.get("toss_winner")
        decision = m.get("toss_decision", "").lower()
        if not winner or not toss_winner or not decision:
            continue
        valid_outcome += 1

        toss_winner_won = winner == toss_winner

        if decision == "bat":
            # toss winner batted first
            bat_decision_total += 1
            if toss_winner_won:
                bat_decision_wins += 1
                batting_first_wins += 1
            else:
                fielding_first_wins += 1
        elif decision == "field":
            # toss winner fielded first; toss loser batted first
            field_decision_total += 1
            if toss_winner_won:
                field_decision_wins += 1
                fielding_first_wins += 1
            else:
                batting_first_wins += 1

    batting_first_win_pct = round(batting_first_wins / valid_outcome, 4) if valid_outcome else 0.5
    fielding_first_win_pct = round(1.0 - batting_first_win_pct, 4)

    # Per-decision win rate (when the toss winner chose that option)
    bat_win_rate = (bat_decision_wins / bat_decision_total) if bat_decision_total else 0.0
    field_win_rate = (field_decision_wins / field_decision_total) if field_decision_total else 0.0
    best_toss_decision = "bat" if bat_win_rate >= field_win_rate else "field"

    # Season breakdown — last 3 seasons
    seasons: dict[str, dict] = {}
    for m in matches:
        s = str(m.get("season", "unknown"))
        winner = m.get("winner")
        toss_winner = m.get("toss_winner")
        if not winner or not toss_winner:
            continue
        if s not in seasons:
            seasons[s] = {"season": s, "matches": 0, "toss_wins": 0}
        seasons[s]["matches"] += 1
        if winner == toss_winner:
            seasons[s]["toss_wins"] += 1

    sorted_seasons = sorted(seasons.values(), key=lambda x: x["season"], reverse=True)[:3]
    season_breakdown = []
    for s in sorted_seasons:
        n = s["matches"]
        tw = s["toss_wins"]
        season_breakdown.append({
            "season": s["season"],
            "matches": n,
            "toss_win_rate": round(tw / n, 4) if n else 0.0,
        })

    result = TossIntelligenceResponse(
        venue_id=venue_id,
        venue_name=venue_name,
        format=fmt,
        total_matches=total,
        batting_first_win_pct=batting_first_win_pct,
        fielding_first_win_pct=fielding_first_win_pct,
        toss_alpha=toss_alpha,
        best_toss_decision=best_toss_decision,
        win_rate_when_winning_toss=round(win_rate_toss, 4),
        confidence=_confidence(valid_outcome),
        season_breakdown=season_breakdown,
    )

    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# Endpoint B: Day/Night Analysis (dew factor proxy)
# ---------------------------------------------------------------------------


@router.get(
    "/venues/{venue_id}/day-night-analysis",
    response_model=DayNightResponse,
    summary="Dew factor proxy and 2nd-innings advantage at a venue",
    description=(
        "Approximates dew-factor impact by comparing death-overs run rates in the 1st vs 2nd "
        "innings across all matches at this venue. A higher `dew_factor_score` (0–10) suggests "
        "teams chasing have a meaningful advantage in the death overs, consistent with dew on "
        "the ball making it harder to grip and bowl accurately. Results cached for **60 minutes**."
    ),
)
@limiter.limit("60/minute")
async def get_day_night_analysis(
    request: Request,
    venue_id: int,
    format: str = Query("T20", description="Match format: `T20` or `ODI`"),
    _key_id: str = Depends(require_api_key),
):
    """Return dew factor proxy and 2nd-innings advantage statistics."""
    fmt = format.upper()
    if fmt not in ("T20", "ODI"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="format must be T20 or ODI",
        )

    ck = cache_key("day_night_analysis", venue_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    # Venue metadata
    venue_rows = (
        client.table("venues")
        .select("venue_id,name")
        .eq("venue_id", venue_id)
        .limit(1)
        .execute()
    )
    venue_name: str | None = venue_rows.data[0]["name"] if venue_rows.data else None

    # Format-filtered league IDs
    league_rows = (
        client.table("leagues")
        .select("league_id")
        .eq("format", fmt)
        .execute()
    )
    league_ids = [r["league_id"] for r in league_rows.data]

    # Matches at venue
    matches = (
        client.table("matches")
        .select("match_id,team1,team2,winner,toss_winner,toss_decision")
        .eq("venue_id", venue_id)
        .in_("league_id", league_ids)
        .limit(500)
        .execute()
    ).data

    total = len(matches)

    _empty = DayNightResponse(
        venue_id=venue_id,
        venue_name=venue_name,
        total_matches=0,
        batting_second_win_pct=0.0,
        death_overs_1st_innings_rr=0.0,
        death_overs_2nd_innings_rr=0.0,
        dew_factor_score=0.0,
        dew_effect_interpretation="Insufficient data",
        strongest_effect_phase="overs_16-20",
    )

    if total == 0:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    match_ids = [m["match_id"] for m in matches]

    # Batting-second win pct
    batting_second_wins = 0
    valid_outcome = 0
    for m in matches:
        winner = m.get("winner")
        toss_winner = m.get("toss_winner")
        decision = (m.get("toss_decision") or "").lower()
        if not winner or not toss_winner or not decision:
            continue
        valid_outcome += 1
        # team batting second = toss loser if decision=="bat", or toss winner if decision=="field"
        if decision == "field":
            batting_second_team = toss_winner
        else:
            # decision == "bat": toss winner batted 1st
            batting_second_team = m["team2"] if m["team1"] == toss_winner else m["team1"]
        if winner == batting_second_team:
            batting_second_wins += 1

    batting_second_win_pct = round(batting_second_wins / valid_outcome, 4) if valid_outcome else 0.5

    # Death overs threshold: T20 = over_ball >= 15.0 (overs 16-20); ODI = over_ball >= 40.0
    # over_ball is stored as over.ball e.g. 15.1 = over 16 ball 1
    death_floor = 15.0 if fmt == "T20" else 40.0
    death_ceil = 20.0 if fmt == "T20" else 50.0

    # We batch in chunks of 50 match_ids (Supabase IN limit safety)
    def _chunk(lst: list, n: int):
        for i in range(0, len(lst), n):
            yield lst[i : i + n]

    inn1_balls: list[int] = []
    inn2_balls: list[int] = []

    for chunk in _chunk(match_ids, 50):
        rows = (
            client.table("deliveries")
            .select("innings,over_ball,runs_total,extras_type")
            .in_("match_id", chunk)
            .gte("over_ball", death_floor)
            .lt("over_ball", death_ceil)
            .limit(5000)
            .execute()
        ).data

        for row in rows:
            extras_type = row.get("extras_type") or ""
            if extras_type == "wides":
                continue  # exclude wides from ball count
            runs = row.get("runs_total") or 0
            inn = row.get("innings")
            if inn == 1:
                inn1_balls.append(runs)
            elif inn == 2:
                inn2_balls.append(runs)

    # Run rates (runs per ball * 6 = runs per over)
    death_1st_rr = round(sum(inn1_balls) / len(inn1_balls) * 6, 2) if inn1_balls else 0.0
    death_2nd_rr = round(sum(inn2_balls) / len(inn2_balls) * 6, 2) if inn2_balls else 0.0

    # Dew factor proxy: normalised difference, clamped 0-10
    if death_1st_rr > 0:
        raw_diff = (death_2nd_rr - death_1st_rr) / death_1st_rr * 10
    else:
        raw_diff = 0.0
    dew_score = round(max(0.0, min(10.0, raw_diff)), 2)

    # Interpretation
    if dew_score >= 7:
        interpretation = "Strong dew effect — chasing teams have a significant advantage in the death overs"
    elif dew_score >= 4:
        interpretation = "Moderate dew effect — some advantage for teams batting second in the death overs"
    elif dew_score >= 1:
        interpretation = "Mild dew effect — slight advantage for teams batting second; not decisive"
    elif dew_score <= 0 and death_1st_rr > 0:
        interpretation = "No dew effect detected — 1st innings death overs are equally or more productive"
    else:
        interpretation = "Insufficient delivery data to assess dew effect"

    phase_label = "overs_16-20" if fmt == "T20" else "overs_41-50"

    result = DayNightResponse(
        venue_id=venue_id,
        venue_name=venue_name,
        total_matches=total,
        batting_second_win_pct=batting_second_win_pct,
        death_overs_1st_innings_rr=death_1st_rr,
        death_overs_2nd_innings_rr=death_2nd_rr,
        dew_factor_score=dew_score,
        dew_effect_interpretation=interpretation,
        strongest_effect_phase=phase_label,
    )

    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# Response model — Par Score
# ---------------------------------------------------------------------------


class ParScoreResponse(BaseModel):
    venue_id: int
    venue_name: str | None
    format: str
    matches_analyzed: int
    par_progression: list[dict]     # [{over, par_runs}]
    avg_first_innings_total: float
    winning_threshold: float
    confidence: str


# ---------------------------------------------------------------------------
# Endpoint: Par Score
# ---------------------------------------------------------------------------


@router.get(
    "/venues/{venue_id}/par-score",
    response_model=ParScoreResponse,
    summary="Over-by-over median par progression at a venue",
)
@limiter.limit("60/minute")
async def get_par_score(
    request: Request,
    venue_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Median 1st-innings score at the end of each over, plus the winning threshold."""
    fmt = format.upper()
    if fmt not in ("T20", "ODI"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="format must be T20 or ODI")

    ck = cache_key("venue_par_score", venue_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    v = client.table("venues").select("name").eq("venue_id", venue_id).execute().data or []
    venue_name = v[0]["name"] if v else None

    lg = client.table("leagues").select("league_id").eq("format", fmt).execute().data or []
    league_ids = [r["league_id"] for r in lg]

    _empty = ParScoreResponse(
        venue_id=venue_id, venue_name=venue_name, format=fmt, matches_analyzed=0,
        par_progression=[], avg_first_innings_total=0.0, winning_threshold=0.0,
        confidence="low",
    )
    if not league_ids:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    matches = (client.table("matches")
               .select("match_id,team1,team2,toss_winner,toss_decision,winner")
               .eq("venue_id", venue_id).in_("league_id", league_ids)
               .limit(300).execute().data or [])
    if not matches:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    match_ids = [m["match_id"] for m in matches]
    max_over = 20 if fmt == "T20" else 50

    def _chunk(lst, n):
        for i in range(0, len(lst), n):
            yield lst[i:i + n]

    from collections import defaultdict
    inn1: dict = defaultdict(list)
    for chunk in _chunk(match_ids, 50):
        rows = (client.table("deliveries")
                .select("match_id,over_ball,runs_total")
                .in_("match_id", chunk).eq("innings", 1)
                .limit(6000).execute().data or [])
        for d in rows:
            inn1[d["match_id"]].append(d)

    # cumulative score at end of each over, per match
    per_over_scores: dict = defaultdict(list)   # over -> list of cumulative totals
    match_totals: dict = {}
    for mid, dels in inn1.items():
        by_over: dict = defaultdict(int)
        for d in dels:
            ov = int(float(d.get("over_ball") or 0)) + 1   # over number 1..N
            by_over[ov] += d.get("runs_total") or 0
        cumulative = 0
        for ov in range(1, max_over + 1):
            cumulative += by_over.get(ov, 0)
            per_over_scores[ov].append(cumulative)
        match_totals[mid] = cumulative

    par_progression = []
    for ov in range(1, max_over + 1):
        scores = per_over_scores.get(ov, [])
        if scores:
            par_progression.append({"over": ov, "par_runs": round(statistics.median(scores), 1)})

    totals = list(match_totals.values())
    avg_total = round(statistics.mean(totals), 1) if totals else 0.0

    # winning threshold: median 1st-innings total in matches the batting-first team won
    def _batted_first(m):
        decision = (m.get("toss_decision") or "").lower()
        tw = m.get("toss_winner") or ""
        t1, t2 = m.get("team1") or "", m.get("team2") or ""
        if decision == "bat":
            return tw if tw in (t1, t2) else None
        if decision == "field":
            return (t2 if tw == t1 else t1) if tw in (t1, t2) else None
        return None

    won_first_totals = []
    for m in matches:
        bf = _batted_first(m)
        if bf and m.get("winner") == bf and m["match_id"] in match_totals:
            won_first_totals.append(match_totals[m["match_id"]])
    winning_threshold = round(statistics.median(won_first_totals), 1) if won_first_totals else avg_total

    result = ParScoreResponse(
        venue_id=venue_id, venue_name=venue_name, format=fmt, matches_analyzed=len(inn1),
        par_progression=par_progression, avg_first_innings_total=avg_total,
        winning_threshold=winning_threshold, confidence=_confidence(len(inn1)),
    )
    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result
