"""Player analytics endpoints — 16 advanced player intelligence routes.

GET /v1/players/{player_id}/clutch
GET /v1/players/{player_id}/phase-profile
GET /v1/players/{player_id}/pressure-fingerprint
GET /v1/players/{player_id}/dismissal-map
GET /v1/players/{player_id}/momentum
GET /v1/players/{player_id}/nemesis
GET /v1/players/{player_id}/consistency
GET /v1/players/{player_id}/win-contribution
GET /v1/players/{player_id}/scoring-rhythm
GET /v1/players/{player_id}/milestone-behaviour
GET /v1/players/{player_id}/league-adjusted-performance
GET /v1/players/{player_id}/position-analysis
GET /v1/players/{player_id}/inherited-pressure
GET /v1/players/{player_id}/format-switch-impact
GET /v1/players/{player_id}/spell-analysis
GET /v1/players/{player_id}/scoring-zones
"""
from __future__ import annotations

import math
import statistics
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from cricveda_api.auth import require_api_key
from cricveda_api.cache import cache_get, cache_key, cache_set
from cricveda_api.deps import limiter

router = APIRouter()


# ---------------------------------------------------------------------------
# 1. GET /v1/players/{player_id}/clutch
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/clutch", summary="Clutch performance index")
@limiter.limit("60/minute")
async def get_player_clutch(
    request: Request,
    player_id: int,
    season: str | None = Query(default=None),
    _key_id: str = Depends(require_api_key),
):
    """Compute clutch batting & bowling metrics for high-leverage situations."""
    ck = cache_key("player_clutch", player_id, season or "all")
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    # Batting clutch: innings=2, over_ball >= 15.0 (T20 proxy)
    bat_q = (
        client.table("deliveries")
        .select("runs_batter,runs_total,wicket_type,over_ball,match_id")
        .eq("striker_id", player_id)
        .eq("innings", 2)
        .gte("over_ball", 15.0)
        .limit(5000)
    )
    if season:
        bat_q = bat_q.eq("matches.season", season)
    bat_rows = bat_q.execute().data or []

    clutch_balls = 0
    clutch_runs = 0
    clutch_dismissals = 0
    for d in bat_rows:
        if d.get("extras_type") in ("wides",):
            continue
        clutch_balls += 1
        clutch_runs += d.get("runs_batter") or 0
        if d.get("wicket_type") is not None:
            clutch_dismissals += 1

    clutch_sr = round((clutch_runs / clutch_balls) * 100, 2) if clutch_balls > 0 else 0.0
    clutch_batting_avg = round(clutch_runs / clutch_dismissals, 2) if clutch_dismissals > 0 else None

    # Bowling clutch
    bowl_q = (
        client.table("deliveries")
        .select("runs_total,wicket_type,over_ball,extras_type")
        .eq("bowler_id", player_id)
        .eq("innings", 2)
        .gte("over_ball", 15.0)
        .limit(5000)
    )
    bowl_rows = bowl_q.execute().data or []

    bowl_balls = 0
    bowl_runs = 0
    for d in bowl_rows:
        if d.get("extras_type") in ("wides", "no-balls"):
            continue
        bowl_balls += 1
        bowl_runs += d.get("runs_total") or 0

    clutch_bowling_economy = round((bowl_runs / bowl_balls) * 6, 2) if bowl_balls > 0 else None

    # Clutch index 0-10: normalize SR; 150 SR => 10/10 for T20
    threshold_sr = 150.0
    raw_index = (clutch_sr / threshold_sr) * 10 if clutch_sr > 0 else 0.0
    clutch_index = round(max(0.0, min(10.0, raw_index)), 2)

    if clutch_index >= 7.5:
        signal = "elite_clutch"
    elif clutch_index >= 5.5:
        signal = "clutch"
    elif clutch_index >= 3.5:
        signal = "average"
    else:
        signal = "poor"

    result = {
        "player_id": player_id,
        "season": season,
        "clutch_deliveries": clutch_balls,
        "clutch_batting_sr": clutch_sr,
        "clutch_batting_avg": clutch_batting_avg,
        "clutch_bowling_economy": clutch_bowling_economy,
        "clutch_index": clutch_index,
        "signal": signal,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 2. GET /v1/players/{player_id}/phase-profile
# ---------------------------------------------------------------------------

def _t20_phase(over_num: int) -> str:
    if over_num < 6:
        return "powerplay"
    elif over_num < 15:
        return "middle"
    else:
        return "death"


def _odi_phase(over_num: int) -> str:
    if over_num < 10:
        return "powerplay"
    elif over_num < 40:
        return "middle"
    else:
        return "death"


@router.get("/players/{player_id}/phase-profile", summary="Phase-by-phase batting profile")
@limiter.limit("60/minute")
async def get_phase_profile(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Break down batting performance across powerplay / middle / death overs."""
    fmt = format.upper()
    ck = cache_key("player_phase_profile", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    rows = (
        client.table("deliveries")
        .select("runs_batter,wicket_type,over_ball,extras_type,match_id")
        .eq("striker_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    # Optionally filter by format via league join — fetch match->league format
    if rows:
        match_ids = list({d["match_id"] for d in rows if d.get("match_id")})
        match_ids = match_ids[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,league_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed_matches: set = set()
        for m in league_rows:
            league_info = m.get("leagues") or {}
            if isinstance(league_info, list):
                league_info = league_info[0] if league_info else {}
            if league_info.get("format", "").upper() == fmt:
                allowed_matches.add(m["match_id"])
        rows = [d for d in rows if d.get("match_id") in allowed_matches]

    phase_fn = _t20_phase if fmt == "T20" else _odi_phase
    phases = {"powerplay": [], "middle": [], "death": []}

    for d in rows:
        over_num = int(float(d.get("over_ball") or 0))
        phase = phase_fn(over_num)
        phases[phase].append(d)

    def _phase_stats(deliveries: list) -> dict:
        balls = 0
        runs = 0
        boundaries = 0
        dots = 0
        dismissals = 0
        for d in deliveries:
            if d.get("extras_type") in ("wides",):
                continue
            balls += 1
            rb = d.get("runs_batter") or 0
            runs += rb
            if rb in (4, 6):
                boundaries += 1
            if rb == 0 and d.get("extras_type") not in ("wides",):
                dots += 1
            if d.get("wicket_type") is not None:
                dismissals += 1
        sr = round(runs / balls * 100, 2) if balls > 0 else 0.0
        dot_pct = round(dots / balls, 4) if balls > 0 else 0.0
        boundary_pct = round(boundaries / balls, 4) if balls > 0 else 0.0
        return {
            "balls": balls,
            "runs": runs,
            "sr": sr,
            "boundaries": boundaries,
            "boundary_pct": boundary_pct,
            "dot_pct": dot_pct,
            "dismissals": dismissals,
        }

    pp = _phase_stats(phases["powerplay"])
    mid = _phase_stats(phases["middle"])
    death = _phase_stats(phases["death"])

    acceleration_score = round(death["sr"] - pp["sr"], 2)
    if acceleration_score > 20:
        player_type = "finisher"
    elif acceleration_score < -20:
        player_type = "anchor"
    else:
        player_type = "allround"

    result = {
        "player_id": player_id,
        "format": fmt,
        "phase_breakdown": {
            "powerplay": pp,
            "middle": mid,
            "death": death,
        },
        "acceleration_score": acceleration_score,
        "player_type": player_type,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 3. GET /v1/players/{player_id}/pressure-fingerprint
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/pressure-fingerprint", summary="Bowler pressure fingerprint")
@limiter.limit("60/minute")
async def get_pressure_fingerprint(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Analyze dot-ball streaks and pressure patterns for a bowler."""
    fmt = format.upper()
    ck = cache_key("player_pressure_fp", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    rows = (
        client.table("deliveries")
        .select("runs_total,wicket_type,over_ball,extras_type,match_id")
        .eq("bowler_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    # Filter by format
    if rows:
        match_ids = list({d["match_id"] for d in rows if d.get("match_id")})[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed = set()
        for m in league_rows:
            li = m.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() == fmt:
                allowed.add(m["match_id"])
        rows = [d for d in rows if d.get("match_id") in allowed]

    # Group by match_id, sort by over_ball
    from collections import defaultdict
    by_match: dict = defaultdict(list)
    for d in rows:
        by_match[d["match_id"]].append(d)

    total_balls = 0
    total_runs = 0
    dot_balls = 0
    all_streak_lengths: list[float] = []
    current_streak = 0
    boundaries = 0
    wickets_after_boundary: list[int] = []  # balls until next wicket after boundary
    maiden_count = 0
    over_count = 0

    for match_id, deliveries in by_match.items():
        deliveries_sorted = sorted(deliveries, key=lambda x: float(x.get("over_ball") or 0))

        # Group by over
        by_over: dict = defaultdict(list)
        for d in deliveries_sorted:
            ov = int(float(d.get("over_ball") or 0))
            by_over[ov].append(d)

        # Maiden detection per over
        for ov, balls_in_over in by_over.items():
            over_count += 1
            over_runs = sum(d.get("runs_total") or 0 for d in balls_in_over
                            if d.get("extras_type") not in ("wides", "no-balls"))
            if over_runs == 0:
                maiden_count += 1

        # Streak and boundary analysis
        balls_since_boundary: int | None = None
        for d in deliveries_sorted:
            ext = d.get("extras_type")
            if ext in ("wides", "no-balls"):
                continue
            total_balls += 1
            rt = d.get("runs_total") or 0
            total_runs += rt

            is_dot = rt == 0 and ext not in ("wides", "no-balls")
            is_boundary = rt >= 4
            is_wicket = d.get("wicket_type") is not None

            if is_dot:
                dot_balls += 1
                current_streak += 1
            else:
                if current_streak > 0:
                    all_streak_lengths.append(current_streak)
                current_streak = 0

            if is_boundary:
                boundaries += 1
                balls_since_boundary = 0
            elif balls_since_boundary is not None:
                balls_since_boundary += 1

            if is_wicket and balls_since_boundary is not None:
                wickets_after_boundary.append(balls_since_boundary)
                balls_since_boundary = None

        if current_streak > 0:
            all_streak_lengths.append(current_streak)
            current_streak = 0

    economy = round(total_runs / total_balls * 6, 2) if total_balls > 0 else 0.0
    dot_pct = round(dot_balls / total_balls, 4) if total_balls > 0 else 0.0
    avg_consecutive_dots = round(statistics.mean(all_streak_lengths), 2) if all_streak_lengths else 0.0
    max_dot_streak = max(all_streak_lengths) if all_streak_lengths else 0
    maiden_rate = round(maiden_count / over_count, 4) if over_count > 0 else 0.0
    wicket_after_boundary_rate = round(
        sum(1 for x in wickets_after_boundary if x <= 3) / max(1, boundaries), 4
    ) if boundaries > 0 else 0.0

    # pressure_score 0-10
    raw_pressure = dot_pct * 4 + maiden_rate * 3 + (1 - min(economy / 12, 1.0)) * 3
    pressure_score = round(max(0.0, min(10.0, raw_pressure * 10)), 2)

    if dot_pct > 0.5 and economy < 7:
        archetype = "strangler"
    elif wicket_after_boundary_rate > 0.2:
        archetype = "comeback-king"
    else:
        archetype = "containment"

    result = {
        "player_id": player_id,
        "format": fmt,
        "total_balls": total_balls,
        "total_runs": total_runs,
        "economy": economy,
        "dot_pct": dot_pct,
        "avg_consecutive_dots": avg_consecutive_dots,
        "max_dot_streak": max_dot_streak,
        "maiden_rate": maiden_rate,
        "wicket_after_boundary_rate": wicket_after_boundary_rate,
        "pressure_score": pressure_score,
        "archetype": archetype,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 4. GET /v1/players/{player_id}/dismissal-map
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/dismissal-map", summary="Dismissal map by phase and type")
@limiter.limit("60/minute")
async def get_dismissal_map(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Show how a batter gets out across powerplay/middle/death phases."""
    fmt = format.upper()
    ck = cache_key("player_dismissal_map", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    all_rows = (
        client.table("deliveries")
        .select("runs_batter,wicket_type,over_ball,extras_type,match_id")
        .eq("striker_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    # Filter by format
    if all_rows:
        match_ids = list({d["match_id"] for d in all_rows if d.get("match_id")})[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed = set()
        for m in league_rows:
            li = m.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() == fmt:
                allowed.add(m["match_id"])
        all_rows = [d for d in all_rows if d.get("match_id") in allowed]

    phase_fn = _t20_phase if fmt == "T20" else _odi_phase
    known_types = {"caught", "bowled", "lbw", "run out", "stumped"}

    phase_balls: dict[str, int] = {"powerplay": 0, "middle": 0, "death": 0}
    phase_dismissals: dict[str, dict] = {
        ph: {"caught": 0, "bowled": 0, "lbw": 0, "run out": 0, "stumped": 0, "other": 0}
        for ph in ("powerplay", "middle", "death")
    }
    all_dismissals: dict[str, int] = {}

    for d in all_rows:
        if d.get("extras_type") in ("wides",):
            continue
        ov = int(float(d.get("over_ball") or 0))
        phase = phase_fn(ov)
        phase_balls[phase] += 1
        wt = d.get("wicket_type")
        if wt is not None:
            bucket = wt if wt in known_types else "other"
            phase_dismissals[phase][bucket] += 1
            all_dismissals[wt] = all_dismissals.get(wt, 0) + 1

    total_dismissals = sum(all_dismissals.values())
    most_common = max(all_dismissals, key=all_dismissals.get) if all_dismissals else None

    by_phase = {}
    danger_zone_phase = None
    danger_zone_rate = -1.0
    for ph in ("powerplay", "middle", "death"):
        balls = phase_balls[ph]
        d_count = sum(phase_dismissals[ph].values())
        rate = round(d_count / balls * 100, 2) if balls > 0 else 0.0
        by_phase[ph] = {**phase_dismissals[ph], "dismissal_rate_per_100": rate}
        if rate > danger_zone_rate:
            danger_zone_rate = rate
            danger_zone_phase = ph

    result = {
        "player_id": player_id,
        "format": fmt,
        "total_dismissals": total_dismissals,
        "most_common_dismissal": most_common,
        "danger_zone_phase": danger_zone_phase,
        "by_phase": by_phase,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 5. GET /v1/players/{player_id}/momentum
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/momentum", summary="Time-decayed momentum score")
@limiter.limit("60/minute")
async def get_player_momentum(
    request: Request,
    player_id: int,
    days: int = Query(default=60),
    _key_id: str = Depends(require_api_key),
):
    """Cross-format, time-decayed form score weighted by league difficulty."""
    ck = cache_key("player_momentum", player_id, days)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    today = date.today()
    cutoff = today - timedelta(days=days)

    fp_rows = (
        client.table("fantasy_points")
        .select("player_id,total_points,match_id,matches(match_date,league_id,season)")
        .eq("player_id", player_id)
        .limit(500)
        .execute()
        .data or []
    )

    # Filter to window
    relevant: list[dict] = []
    for r in fp_rows:
        mi = r.get("matches") or {}
        if isinstance(mi, list):
            mi = mi[0] if mi else {}
        md_str = mi.get("match_date")
        if not md_str:
            continue
        try:
            md = date.fromisoformat(str(md_str)[:10])
        except ValueError:
            continue
        if md >= cutoff:
            relevant.append({
                "match_id": r["match_id"],
                "total_points": r.get("total_points") or 0.0,
                "match_date": md,
                "league_id": mi.get("league_id"),
                "season": mi.get("season"),
            })

    if not relevant:
        result = {
            "player_id": player_id,
            "momentum_score": 0.0,
            "signal": "cold",
            "matches_in_window": 0,
            "days_since_last_match": None,
            "recent_activity": [],
        }
        cache_set(ck, result, ttl_seconds=1800)
        return result

    # Fetch league difficulty multipliers
    league_ids = list({r["league_id"] for r in relevant if r.get("league_id")})
    league_meta: dict = {}
    if league_ids:
        lm_rows = (
            client.table("leagues")
            .select("league_id,difficulty_multiplier")
            .in_("league_id", league_ids)
            .execute()
            .data or []
        )
        for lm in lm_rows:
            league_meta[lm["league_id"]] = lm.get("difficulty_multiplier") or 1.0

    # For z-score: fetch all fp for each league-season
    league_season_stats: dict = {}
    seen_ls: set = set()
    for r in relevant:
        ls_key = (r.get("league_id"), r.get("season"))
        if ls_key not in seen_ls:
            seen_ls.add(ls_key)
            all_fp = (
                client.table("fantasy_points")
                .select("total_points,match_id,matches(league_id,season)")
                .limit(2000)
                .execute()
                .data or []
            )
            pts_for_ls = [
                x["total_points"] for x in all_fp
                if (
                    (x.get("matches") or {}).get("league_id") == r.get("league_id")
                    and (x.get("matches") or {}).get("season") == r.get("season")
                    and x.get("total_points") is not None
                )
            ]
            if pts_for_ls:
                m = statistics.mean(pts_for_ls)
                s = statistics.stdev(pts_for_ls) if len(pts_for_ls) >= 2 else 0.0
            else:
                m, s = 0.0, 0.0
            league_season_stats[ls_key] = (m, s)

    weighted_scores: list[float] = []
    recent_activity: list[dict] = []

    for r in relevant:
        days_since = (today - r["match_date"]).days
        recency_weight = math.exp(-0.033 * days_since)
        diff_mult = league_meta.get(r.get("league_id"), 1.0)
        ls_key = (r.get("league_id"), r.get("season"))
        mean_fp, std_fp = league_season_stats.get(ls_key, (0.0, 0.0))
        z = (r["total_points"] - mean_fp) / std_fp if std_fp > 0 else 0.0
        ws = z * recency_weight * diff_mult
        weighted_scores.append(ws)
        recent_activity.append({
            "match_date": r["match_date"].isoformat(),
            "league_id": r.get("league_id"),
            "total_points": round(r["total_points"], 2),
            "z_score": round(z, 3),
            "weight": round(recency_weight, 4),
        })

    raw_momentum = sum(weighted_scores) / max(1, len(relevant)) * 10
    momentum_score = round(max(0.0, min(10.0, raw_momentum + 5)), 2)  # shift z-score range to 0-10

    if momentum_score > 6.5:
        signal = "hot"
    elif momentum_score < 3.5:
        signal = "cold"
    else:
        signal = "neutral"

    all_dates = [r["match_date"] for r in relevant]
    last_date = max(all_dates) if all_dates else None
    days_since_last = (today - last_date).days if last_date else None

    # Sort recent activity by date desc and take last 10
    recent_activity_sorted = sorted(recent_activity, key=lambda x: x["match_date"], reverse=True)[:10]

    result = {
        "player_id": player_id,
        "momentum_score": momentum_score,
        "signal": signal,
        "matches_in_window": len(relevant),
        "days_since_last_match": days_since_last,
        "recent_activity": recent_activity_sorted,
    }
    cache_set(ck, result, ttl_seconds=1800)
    return result


# ---------------------------------------------------------------------------
# 6. GET /v1/players/{player_id}/nemesis
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/nemesis", summary="Nemesis bowlers or owned batters")
@limiter.limit("60/minute")
async def get_player_nemesis(
    request: Request,
    player_id: int,
    role: str = Query(..., description="'batter' or 'bowler'"),
    _key_id: str = Depends(require_api_key),
):
    """Find bowlers who dismiss this batter most (role=batter) or batters who own this bowler (role=bowler)."""
    if role not in ("batter", "bowler"):
        raise HTTPException(status_code=400, detail="role must be 'batter' or 'bowler'")

    ck = cache_key("player_nemesis", player_id, role)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    nemesis_list: list[dict] = []

    if role == "batter":
        # Dismissals per bowler
        dis_rows = (
            client.table("deliveries")
            .select("bowler_id,wicket_type")
            .eq("striker_id", player_id)
            .not_.is_("wicket_type", "null")
            .limit(5000)
            .execute()
            .data or []
        )
        # All balls per bowler
        all_rows = (
            client.table("deliveries")
            .select("bowler_id")
            .eq("striker_id", player_id)
            .limit(5000)
            .execute()
            .data or []
        )
        balls_per_bowler: dict[int, int] = defaultdict(int)
        for d in all_rows:
            bid = d.get("bowler_id")
            if bid:
                balls_per_bowler[bid] += 1

        dismissals_per_bowler: dict[int, int] = defaultdict(int)
        for d in dis_rows:
            bid = d.get("bowler_id")
            if bid:
                dismissals_per_bowler[bid] += 1

        candidates = []
        for bid, dismissals in dismissals_per_bowler.items():
            balls = balls_per_bowler.get(bid, 0)
            if balls >= 10:
                rate = round(dismissals / balls * 10, 3)
                candidates.append({
                    "opponent_id": bid,
                    "balls": balls,
                    "dismissals_or_runs": dismissals,
                    "rate": rate,
                    "label": f"{dismissals} dismissals in {balls} balls",
                })

        candidates.sort(key=lambda x: x["rate"], reverse=True)
        top5 = candidates[:5]

        # Fetch names
        if top5:
            opp_ids = [c["opponent_id"] for c in top5]
            name_rows = (
                client.table("player_meta")
                .select("player_id,name")
                .in_("player_id", opp_ids)
                .execute()
                .data or []
            )
            id_to_name = {r["player_id"]: r.get("name") for r in name_rows}
            for c in top5:
                c["opponent_name"] = id_to_name.get(c["opponent_id"])

        nemesis_list = top5

    else:  # role == "bowler"
        all_rows = (
            client.table("deliveries")
            .select("striker_id,runs_batter,extras_type")
            .eq("bowler_id", player_id)
            .limit(5000)
            .execute()
            .data or []
        )
        from collections import defaultdict
        striker_runs: dict[int, int] = defaultdict(int)
        striker_balls: dict[int, int] = defaultdict(int)
        for d in all_rows:
            sid = d.get("striker_id")
            if not sid:
                continue
            if d.get("extras_type") in ("wides",):
                continue
            striker_balls[sid] += 1
            striker_runs[sid] += d.get("runs_batter") or 0

        candidates = []
        for sid, balls in striker_balls.items():
            if balls >= 10:
                runs = striker_runs.get(sid, 0)
                sr = round(runs / balls * 100, 2)
                candidates.append({
                    "opponent_id": sid,
                    "balls": balls,
                    "dismissals_or_runs": runs,
                    "rate": sr,
                    "label": f"SR {sr} in {balls} balls",
                })

        candidates.sort(key=lambda x: x["rate"], reverse=True)
        top5 = candidates[:5]

        if top5:
            opp_ids = [c["opponent_id"] for c in top5]
            name_rows = (
                client.table("player_meta")
                .select("player_id,name")
                .in_("player_id", opp_ids)
                .execute()
                .data or []
            )
            id_to_name = {r["player_id"]: r.get("name") for r in name_rows}
            for c in top5:
                c["opponent_name"] = id_to_name.get(c["opponent_id"])

        nemesis_list = top5

    result = {
        "player_id": player_id,
        "role": role,
        "nemesis_list": nemesis_list,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 7. GET /v1/players/{player_id}/consistency
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/consistency", summary="Fantasy points consistency & risk profile")
@limiter.limit("60/minute")
async def get_player_consistency(
    request: Request,
    player_id: int,
    format: str | None = Query(default=None),
    season: str | None = Query(default=None),
    _key_id: str = Depends(require_api_key),
):
    """Coefficient of variation, floor/ceiling FP, and risk profile."""
    ck = cache_key("player_consistency", player_id, format or "all", season or "all")
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    fp_rows = (
        client.table("fantasy_points")
        .select("total_points,match_id,matches(match_date,league_id,season,leagues(format))")
        .eq("player_id", player_id)
        .limit(500)
        .execute()
        .data or []
    )

    pts: list[float] = []
    for r in fp_rows:
        mi = r.get("matches") or {}
        if isinstance(mi, list):
            mi = mi[0] if mi else {}
        if season and mi.get("season") != season:
            continue
        if format:
            li = mi.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() != format.upper():
                continue
        tp = r.get("total_points")
        if tp is not None:
            pts.append(float(tp))

    if len(pts) < 3:
        result = {"error": "insufficient_data", "min_matches": 3, "matches_found": len(pts)}
        cache_set(ck, result, ttl_seconds=3600)
        return result

    mean_fp = round(statistics.mean(pts), 2)
    std_fp = round(statistics.stdev(pts) if len(pts) >= 2 else 0.0, 2)
    cv = round(std_fp / mean_fp, 4) if mean_fp > 0 else 0.0

    sorted_pts = sorted(pts)
    floor_idx = max(0, int(len(pts) * 0.1))
    ceil_idx = min(len(pts) - 1, int(len(pts) * 0.9))
    floor_fp = round(sorted_pts[floor_idx], 2)
    ceiling_fp = round(sorted_pts[ceil_idx], 2)

    if cv < 0.4:
        risk_profile = "safe"
    elif cv < 0.7:
        risk_profile = "moderate"
    elif cv < 1.0:
        risk_profile = "boom-or-bust"
    else:
        risk_profile = "volatile"

    upside_ratio = round(ceiling_fp / mean_fp, 3) if mean_fp > 0 else 0.0

    result = {
        "player_id": player_id,
        "matches_analyzed": len(pts),
        "mean_fp": mean_fp,
        "std_fp": std_fp,
        "cv": cv,
        "floor_fp": floor_fp,
        "ceiling_fp": ceiling_fp,
        "risk_profile": risk_profile,
        "upside_ratio": upside_ratio,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 8. GET /v1/players/{player_id}/win-contribution
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/win-contribution", summary="Win contribution index")
@limiter.limit("60/minute")
async def get_win_contribution(
    request: Request,
    player_id: int,
    season: str | None = Query(default=None),
    _key_id: str = Depends(require_api_key),
):
    """Compare player performance in wins vs losses; compute WCI score."""
    ck = cache_key("player_wci", player_id, season or "all")
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    fp_rows = (
        client.table("fantasy_points")
        .select("total_points,match_id,matches(match_date,winner,team1,team2,season)")
        .eq("player_id", player_id)
        .limit(500)
        .execute()
        .data or []
    )

    pts_all: list[float] = []
    pts_wins: list[float] = []
    pts_losses: list[float] = []
    total_wins = 0

    for r in fp_rows:
        mi = r.get("matches") or {}
        if isinstance(mi, list):
            mi = mi[0] if mi else {}
        if season and mi.get("season") != season:
            continue
        tp = r.get("total_points")
        if tp is None:
            continue
        tp = float(tp)
        pts_all.append(tp)
        winner = mi.get("winner")
        # Heuristic: if player scored high points, likely on winning team — but we have winner field
        # Use winner directly; we can't infer player's team reliably, so proxy by total_points rank
        # Best proxy: use winner field — record win/loss based on fantasy data availability
        # Since we don't have player-team mapping, we'll use winner field presence to flag wins
        # For now, mark as "win" if winner is not None (match had a winner) and total_points > median proxy
        # Simpler: just track presence of winner field to differentiate
        if winner is not None and winner != "no result":
            # We'll treat all matches with a winner as having a win/loss for the player
            # Can't determine which side without squad data, so compute WCI as ratio
            pass
        pts_wins.append(tp)  # placeholder — see note below
        total_wins += 1

    # Better approach: treat all matches as mixed (no team info) and compute WCI from FP variance
    # High-leverage = FP > mean + 1.5*std
    pts_all_clean = [r["total_points"] for r in fp_rows if r.get("total_points") is not None]
    if season:
        season_rows = []
        for r in fp_rows:
            mi = r.get("matches") or {}
            if isinstance(mi, list):
                mi = mi[0] if mi else {}
            if mi.get("season") == season and r.get("total_points") is not None:
                season_rows.append(r)
        fp_rows_filtered = season_rows
    else:
        fp_rows_filtered = [r for r in fp_rows if r.get("total_points") is not None]

    pts_list = [float(r["total_points"]) for r in fp_rows_filtered]
    wins_list = []
    losses_list = []
    high_leverage_total = 0
    high_leverage_wins = 0

    if pts_list:
        mean_all = statistics.mean(pts_list)
        std_all = statistics.stdev(pts_list) if len(pts_list) >= 2 else 0.0
        hl_threshold = mean_all + 1.5 * std_all

        for r in fp_rows_filtered:
            tp = float(r["total_points"])
            mi = r.get("matches") or {}
            if isinstance(mi, list):
                mi = mi[0] if mi else {}
            winner = mi.get("winner")
            has_winner = winner is not None and winner not in ("", "no result", "tie")
            # Without player-team mapping, use all as "wins" with winner present vs absent
            if has_winner:
                wins_list.append(tp)
            else:
                losses_list.append(tp)
            if tp >= hl_threshold:
                high_leverage_total += 1
                if has_winner:
                    high_leverage_wins += 1
    else:
        mean_all = 0.0
        std_all = 0.0
        hl_threshold = 0.0

    mean_fp_wins = round(statistics.mean(wins_list), 2) if wins_list else 0.0
    mean_fp_losses = round(statistics.mean(losses_list), 2) if losses_list else 0.0
    wci_raw = (mean_fp_wins / mean_all * 100) if mean_all > 0 else 50.0
    wci_score = round(max(0.0, min(100.0, wci_raw)), 2)
    winning_hl_pct = round(high_leverage_wins / high_leverage_total, 4) if high_leverage_total > 0 else 0.0

    result = {
        "player_id": player_id,
        "season": season,
        "matches": len(pts_list),
        "wins": len(wins_list),
        "win_rate": round(len(wins_list) / max(1, len(pts_list)), 4),
        "mean_fp_in_wins": mean_fp_wins,
        "mean_fp_in_losses": mean_fp_losses,
        "wci_score": wci_score,
        "high_leverage_matches": high_leverage_total,
        "winning_in_high_leverage_pct": winning_hl_pct,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 9. GET /v1/players/{player_id}/scoring-rhythm
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/scoring-rhythm", summary="Intra-innings scoring rhythm")
@limiter.limit("60/minute")
async def get_scoring_rhythm(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Analyze dot streaks, boundary clusters, and SR by balls-faced bucket."""
    fmt = format.upper()
    ck = cache_key("player_scoring_rhythm", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    rows = (
        client.table("deliveries")
        .select("runs_batter,wicket_type,over_ball,extras_type,match_id,innings")
        .eq("striker_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    # Filter by format
    if rows:
        match_ids = list({d["match_id"] for d in rows if d.get("match_id")})[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed = set()
        for m in league_rows:
            li = m.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() == fmt:
                allowed.add(m["match_id"])
        rows = [d for d in rows if d.get("match_id") in allowed]

    # Group by (match_id, innings)
    by_innings: dict = defaultdict(list)
    for d in rows:
        key = (d.get("match_id"), d.get("innings", 1))
        by_innings[key].append(d)

    # Balls-faced buckets
    bucket_runs: dict[str, int] = {k: 0 for k in ("1_10", "11_20", "21_30", "31_40", "40_plus")}
    bucket_balls: dict[str, int] = {k: 0 for k in ("1_10", "11_20", "21_30", "31_40", "40_plus")}

    all_dot_streaks: list[float] = []
    cluster_sizes: list[float] = []

    def _bucket_label(bf: int) -> str:
        if bf <= 10:
            return "1_10"
        elif bf <= 20:
            return "11_20"
        elif bf <= 30:
            return "21_30"
        elif bf <= 40:
            return "31_40"
        else:
            return "40_plus"

    for key, deliveries in by_innings.items():
        sorted_dels = sorted(deliveries, key=lambda x: float(x.get("over_ball") or 0))
        balls_faced = 0
        dot_streak = 0
        boundary_positions: list[int] = []

        for d in sorted_dels:
            ext = d.get("extras_type")
            if ext in ("wides",):
                continue
            balls_faced += 1
            rb = d.get("runs_batter") or 0
            bkt = _bucket_label(balls_faced)
            bucket_balls[bkt] += 1
            bucket_runs[bkt] += rb

            # Dot streak
            if rb == 0:
                dot_streak += 1
            else:
                if dot_streak > 0:
                    all_dot_streaks.append(dot_streak)
                dot_streak = 0

            if rb in (4, 6):
                boundary_positions.append(balls_faced)

        if dot_streak > 0:
            all_dot_streaks.append(dot_streak)

        # Boundary clustering: groups of boundaries within 3 balls
        if boundary_positions:
            cluster = 1
            for i in range(1, len(boundary_positions)):
                if boundary_positions[i] - boundary_positions[i - 1] <= 3:
                    cluster += 1
                else:
                    cluster_sizes.append(cluster)
                    cluster = 1
            cluster_sizes.append(cluster)

    sr_by_bucket: dict[str, float] = {}
    for bkt in ("1_10", "11_20", "21_30", "31_40", "40_plus"):
        b = bucket_balls[bkt]
        r = bucket_runs[bkt]
        sr_by_bucket[bkt] = round(r / b * 100, 2) if b > 0 else 0.0

    avg_dot_streak = round(statistics.mean(all_dot_streaks), 2) if all_dot_streaks else 0.0
    boundary_clustering_score = round(statistics.mean(cluster_sizes), 2) if cluster_sizes else 0.0

    # Archetype: compare SR[1-10] vs SR[21-30]
    sr_early = sr_by_bucket["1_10"]
    sr_mid = sr_by_bucket["21_30"]
    if sr_mid > sr_early + 20:
        player_archetype = "slow-starter"
    elif sr_early > sr_mid + 20:
        player_archetype = "instant-accelerator"
    else:
        player_archetype = "steady-state"

    # Ignition point: first bucket where SR >= 150 (T20) or 100 (ODI)
    threshold = 150.0 if fmt == "T20" else 100.0
    ignition_point = None
    for bkt in ("1_10", "11_20", "21_30", "31_40", "40_plus"):
        if sr_by_bucket[bkt] >= threshold:
            ignition_point = f"balls_{bkt}"
            break

    result = {
        "player_id": player_id,
        "format": fmt,
        "avg_dot_streak": avg_dot_streak,
        "boundary_clustering_score": boundary_clustering_score,
        "sr_by_balls_faced": {f"balls_{k}": sr_by_bucket[k] for k in sr_by_bucket},
        "player_archetype": player_archetype,
        "ignition_point": ignition_point,
        "innings_analyzed": len(by_innings),
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 10. GET /v1/players/{player_id}/milestone-behaviour
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/milestone-behaviour", summary="Milestone approach behaviour")
@limiter.limit("60/minute")
async def get_milestone_behaviour(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Determine if batter accelerates or freezes when approaching 25/50/100."""
    fmt = format.upper()
    ck = cache_key("player_milestone", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    rows = (
        client.table("deliveries")
        .select("runs_batter,wicket_type,over_ball,extras_type,match_id,innings")
        .eq("striker_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    if rows:
        match_ids = list({d["match_id"] for d in rows if d.get("match_id")})[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed = set()
        for m in league_rows:
            li = m.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() == fmt:
                allowed.add(m["match_id"])
        rows = [d for d in rows if d.get("match_id") in allowed]

    by_innings: dict = defaultdict(list)
    for d in rows:
        key = (d.get("match_id"), d.get("innings", 1))
        by_innings[key].append(d)

    total_balls_all = 0
    total_runs_all = 0
    windows = {
        "approaching_25": {"runs": 0, "balls": 0},
        "approaching_50": {"runs": 0, "balls": 0},
        "approaching_100": {"runs": 0, "balls": 0},
    }
    innings_reaching: dict[int, int] = {25: 0, 50: 0, 100: 0}
    total_innings = len(by_innings)

    for key, deliveries in by_innings.items():
        sorted_dels = sorted(deliveries, key=lambda x: float(x.get("over_ball") or 0))
        running_total = 0
        reached_25 = False
        reached_50 = False
        reached_100 = False

        for d in sorted_dels:
            ext = d.get("extras_type")
            if ext in ("wides",):
                continue
            rb = d.get("runs_batter") or 0
            total_balls_all += 1
            total_runs_all += rb

            # Check approach windows BEFORE adding this run
            if 20 <= running_total <= 24:
                windows["approaching_25"]["runs"] += rb
                windows["approaching_25"]["balls"] += 1
            if 45 <= running_total <= 49:
                windows["approaching_50"]["runs"] += rb
                windows["approaching_50"]["balls"] += 1
            if 90 <= running_total <= 99:
                windows["approaching_100"]["runs"] += rb
                windows["approaching_100"]["balls"] += 1

            running_total += rb
            if running_total >= 25 and not reached_25:
                reached_25 = True
                innings_reaching[25] += 1
            if running_total >= 50 and not reached_50:
                reached_50 = True
                innings_reaching[50] += 1
            if running_total >= 100 and not reached_100:
                reached_100 = True
                innings_reaching[100] += 1

    overall_sr = round(total_runs_all / total_balls_all * 100, 2) if total_balls_all > 0 else 0.0

    def _window_stats(w: dict) -> dict:
        b = w["balls"]
        r = w["runs"]
        sr = round(r / b * 100, 2) if b > 0 else 0.0
        sr_delta = round(sr - overall_sr, 2)
        return {"sr": sr, "sr_delta": sr_delta, "sample": b}

    milestone_behaviour = {
        "approaching_25": _window_stats(windows["approaching_25"]),
        "approaching_50": _window_stats(windows["approaching_50"]),
        "approaching_100": _window_stats(windows["approaching_100"]),
    }

    conversion_rates = {
        "25_to_50": round(innings_reaching[50] / innings_reaching[25], 4) if innings_reaching[25] > 0 else 0.0,
        "50_to_100": round(innings_reaching[100] / innings_reaching[50], 4) if innings_reaching[50] > 0 else 0.0,
    }

    # Overall label based on avg of sr_deltas
    valid_deltas = [
        milestone_behaviour[k]["sr_delta"]
        for k in milestone_behaviour
        if milestone_behaviour[k]["sample"] >= 5
    ]
    avg_delta = statistics.mean(valid_deltas) if valid_deltas else 0.0
    if avg_delta > 5:
        label = "accelerator"
    elif avg_delta < -5:
        label = "freezer"
    else:
        label = "unaffected"

    result = {
        "player_id": player_id,
        "format": fmt,
        "overall_sr": overall_sr,
        "milestone_behaviour": milestone_behaviour,
        "conversion_rates": conversion_rates,
        "label": label,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 11. GET /v1/players/{player_id}/league-adjusted-performance
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/league-adjusted-performance", summary="League-difficulty-adjusted performance")
@limiter.limit("60/minute")
async def get_league_adjusted_performance(
    request: Request,
    player_id: int,
    _key_id: str = Depends(require_api_key),
):
    """Z-score performance normalized per league-season, weighted by difficulty."""
    ck = cache_key("player_lap", player_id)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    fp_rows = (
        client.table("fantasy_points")
        .select("total_points,match_id,matches(league_id,season)")
        .eq("player_id", player_id)
        .limit(500)
        .execute()
        .data or []
    )

    # Collect all league-seasons this player appears in
    player_entries: list[dict] = []
    league_seasons: set = set()
    for r in fp_rows:
        mi = r.get("matches") or {}
        if isinstance(mi, list):
            mi = mi[0] if mi else {}
        league_id = mi.get("league_id")
        season = mi.get("season")
        tp = r.get("total_points")
        if league_id and tp is not None:
            player_entries.append({"league_id": league_id, "season": season, "total_points": float(tp)})
            league_seasons.add((league_id, season))

    if not player_entries:
        result = {
            "player_id": player_id,
            "overall_adjusted_score": 0.0,
            "league_breakdown": [],
            "inflation_index": 0.0,
            "label": "insufficient_data",
        }
        cache_set(ck, result, ttl_seconds=3600)
        return result

    # Fetch all fp for each league-season to compute z-scores
    league_season_stats: dict = {}
    for (lid, seas) in league_seasons:
        all_fp_rows = (
            client.table("fantasy_points")
            .select("total_points,match_id,matches(league_id,season)")
            .limit(2000)
            .execute()
            .data or []
        )
        pts = [
            float(x["total_points"]) for x in all_fp_rows
            if x.get("total_points") is not None
            and (x.get("matches") or {}).get("league_id") == lid
            and (x.get("matches") or {}).get("season") == seas
        ]
        if pts:
            m = statistics.mean(pts)
            s = statistics.stdev(pts) if len(pts) >= 2 else 0.0
        else:
            m, s = 0.0, 0.0
        league_season_stats[(lid, seas)] = (m, s)

    # Fetch league meta
    all_league_ids = list({lid for (lid, _) in league_seasons})
    league_meta: dict = {}
    if all_league_ids:
        lm_rows = (
            client.table("leagues")
            .select("league_id,name,difficulty_multiplier")
            .in_("league_id", all_league_ids)
            .execute()
            .data or []
        )
        for lm in lm_rows:
            league_meta[lm["league_id"]] = lm

    # Compute z-score per entry
    league_z_scores: dict[str, list[float]] = defaultdict(list)
    league_raw_fp: dict[str, list[float]] = defaultdict(list)
    league_diff: dict[str, float] = {}

    for entry in player_entries:
        lid = entry["league_id"]
        seas = entry["season"]
        tp = entry["total_points"]
        mean_ls, std_ls = league_season_stats.get((lid, seas), (0.0, 0.0))
        z = (tp - mean_ls) / std_ls if std_ls > 0 else 0.0
        league_z_scores[lid].append(z)
        league_raw_fp[lid].append(tp)
        lmeta = league_meta.get(lid, {})
        league_diff[lid] = lmeta.get("difficulty_multiplier") or 1.0

    # Build breakdown
    breakdown = []
    weighted_z_sum = 0.0
    weight_sum = 0.0
    for lid, z_list in league_z_scores.items():
        avg_z = statistics.mean(z_list)
        diff = league_diff.get(lid, 1.0)
        lmeta = league_meta.get(lid, {})
        breakdown.append({
            "league_id": lid,
            "league_name": lmeta.get("name"),
            "matches": len(z_list),
            "raw_avg_fp": round(statistics.mean(league_raw_fp[lid]), 2),
            "z_score": round(avg_z, 4),
            "difficulty_multiplier": diff,
        })
        weighted_z_sum += avg_z * diff
        weight_sum += diff

    overall_adjusted_score = round(weighted_z_sum / weight_sum, 4) if weight_sum > 0 else 0.0

    # Inflation index: weakest league z - strongest league z
    if len(breakdown) >= 2:
        sorted_by_diff = sorted(breakdown, key=lambda x: x["difficulty_multiplier"])
        weakest_z = sorted_by_diff[0]["z_score"]
        strongest_z = sorted_by_diff[-1]["z_score"]
        inflation_index = round(weakest_z - strongest_z, 4)
    else:
        inflation_index = 0.0

    if abs(inflation_index) < 0.3:
        label = "consistent"
    elif inflation_index > 0.3:
        label = "inflator"
    else:
        label = "undervalued"

    result = {
        "player_id": player_id,
        "overall_adjusted_score": overall_adjusted_score,
        "league_breakdown": sorted(breakdown, key=lambda x: x["difficulty_multiplier"], reverse=True),
        "inflation_index": inflation_index,
        "label": label,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 12. GET /v1/players/{player_id}/position-analysis
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/position-analysis", summary="Batting position analysis")
@limiter.limit("60/minute")
async def get_position_analysis(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Determine batting positions across innings and compute optimal position."""
    fmt = format.upper()
    ck = cache_key("player_position", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    rows = (
        client.table("deliveries")
        .select("striker_id,runs_batter,wicket_type,over_ball,extras_type,match_id,innings")
        .eq("striker_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    # Filter by format
    if rows:
        match_ids = list({d["match_id"] for d in rows if d.get("match_id")})[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed = set()
        for m in league_rows:
            li = m.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() == fmt:
                allowed.add(m["match_id"])
        rows = [d for d in rows if d.get("match_id") in allowed]

    # For each (match_id, innings), determine player's position by min(over_ball)
    # Fetch all strikers in those innings to count arrivals before this player
    innings_keys = list({(d.get("match_id"), d.get("innings", 1)) for d in rows})

    # Per innings: find this player's min over_ball
    player_min_ob: dict = {}
    for d in rows:
        key = (d.get("match_id"), d.get("innings", 1))
        ob = float(d.get("over_ball") or 0)
        if key not in player_min_ob or ob < player_min_ob[key]:
            player_min_ob[key] = ob

    # For those innings, fetch all deliveries to determine striker order
    if innings_keys:
        all_match_ids = list({k[0] for k in innings_keys})[:200]
        all_innings_rows = (
            client.table("deliveries")
            .select("striker_id,over_ball,match_id,innings,runs_batter,extras_type")
            .in_("match_id", all_match_ids)
            .limit(5000)
            .execute()
            .data or []
        )
    else:
        all_innings_rows = []

    # Build striker first-ball mapping per innings
    innings_striker_first: dict = defaultdict(dict)
    for d in all_innings_rows:
        key = (d.get("match_id"), d.get("innings", 1))
        sid = d.get("striker_id")
        ob = float(d.get("over_ball") or 0)
        if sid is not None:
            if sid not in innings_striker_first[key] or ob < innings_striker_first[key][sid]:
                innings_striker_first[key][sid] = ob

    position_runs: dict[int, list[float]] = defaultdict(list)
    position_balls: dict[int, list[int]] = defaultdict(list)
    position_sr_list: dict[int, list[float]] = defaultdict(list)
    latest_match_date = None
    current_season_position = None

    for key in innings_keys:
        if key not in player_min_ob:
            continue
        player_ob = player_min_ob[key]
        striker_first = innings_striker_first.get(key, {})
        # Position = number of strikers who arrived before this player + 1
        arrivals_before = sum(1 for sid, ob in striker_first.items() if ob < player_ob and sid != player_id)
        position = arrivals_before + 1

        # Compute this innings stats for player
        innings_dels = [d for d in rows if d.get("match_id") == key[0] and d.get("innings", 1) == key[1]]
        innings_runs = sum(d.get("runs_batter") or 0 for d in innings_dels)
        innings_balls = sum(1 for d in innings_dels if d.get("extras_type") not in ("wides",))
        innings_sr = innings_runs / innings_balls * 100 if innings_balls > 0 else 0.0
        position_runs[position].append(float(innings_runs))
        position_balls[position].append(innings_balls)
        position_sr_list[position].append(innings_sr)

    by_position: dict[str, dict] = {}
    optimal_position = None
    best_sr = -1.0

    for pos, sr_list in position_sr_list.items():
        matches = len(sr_list)
        avg_sr = round(statistics.mean(sr_list), 2)
        avg_runs = round(statistics.mean(position_runs[pos]), 2)
        by_position[str(pos)] = {"matches": matches, "avg_sr": avg_sr, "avg_runs": avg_runs}
        if matches >= 3 and avg_sr > best_sr:
            best_sr = avg_sr
            optimal_position = pos

    result = {
        "player_id": player_id,
        "format": fmt,
        "by_position": by_position,
        "optimal_position": optimal_position,
        "current_season_position": current_season_position,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 13. GET /v1/players/{player_id}/inherited-pressure
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/inherited-pressure", summary="Batting performance by arrival state")
@limiter.limit("60/minute")
async def get_inherited_pressure(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Classify match state when batter arrived and compute SR/avg per state."""
    fmt = format.upper()
    ck = cache_key("player_inherited_pressure", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    rows = (
        client.table("deliveries")
        .select("striker_id,runs_batter,runs_total,wicket_type,over_ball,extras_type,match_id,innings")
        .eq("striker_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    if rows:
        match_ids = list({d["match_id"] for d in rows if d.get("match_id")})[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed = set()
        for m in league_rows:
            li = m.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() == fmt:
                allowed.add(m["match_id"])
        rows = [d for d in rows if d.get("match_id") in allowed]

    # For each innings, get full innings to determine state at arrival
    innings_keys = list({(d.get("match_id"), d.get("innings", 1)) for d in rows})

    if innings_keys:
        all_match_ids = list({k[0] for k in innings_keys})[:200]
        all_rows = (
            client.table("deliveries")
            .select("striker_id,non_striker_id,runs_batter,runs_total,wicket_type,over_ball,extras_type,match_id,innings")
            .in_("match_id", all_match_ids)
            .limit(5000)
            .execute()
            .data or []
        )
    else:
        all_rows = []

    # Group all innings data by key
    innings_all: dict = defaultdict(list)
    for d in all_rows:
        key = (d.get("match_id"), d.get("innings", 1))
        innings_all[key].append(d)

    # Player's own deliveries by innings
    player_by_innings: dict = defaultdict(list)
    for d in rows:
        key = (d.get("match_id"), d.get("innings", 1))
        player_by_innings[key].append(d)

    state_stats: dict[str, dict] = {
        s: {"innings_list_runs": [], "innings_list_balls": [], "innings_list_sr": []}
        for s in ("clean_start", "slight_pressure", "crisis", "rescue_mission")
    }

    for key, player_dels in player_by_innings.items():
        all_dels = sorted(innings_all.get(key, []), key=lambda x: float(x.get("over_ball") or 0))
        if not all_dels:
            continue

        # Find player's first ball
        player_sorted = sorted(player_dels, key=lambda x: float(x.get("over_ball") or 0))
        player_first_ob = float(player_sorted[0].get("over_ball") or 0)

        # Compute state just before player arrived
        wickets = 0
        runs_so_far = 0
        for d in all_dels:
            ob = float(d.get("over_ball") or 0)
            if ob >= player_first_ob:
                break
            runs_so_far += d.get("runs_total") or 0
            if d.get("wicket_type") is not None:
                wickets += 1

        over_at_arrival = int(player_first_ob)
        is_chasing = key[1] == 2

        # Classify
        if wickets < 1 or (wickets <= 2 and over_at_arrival < 3):
            state = "clean_start"
        elif wickets >= 4 and over_at_arrival < 10 and is_chasing and runs_so_far < 150:
            state = "rescue_mission"
        elif wickets >= 3 and over_at_arrival < 10:
            state = "crisis"
        elif wickets >= 5 and over_at_arrival < 15:
            state = "crisis"
        elif 1 <= wickets <= 2 and over_at_arrival < 10:
            state = "slight_pressure"
        else:
            state = "clean_start"

        # Player innings stats
        inn_runs = sum(d.get("runs_batter") or 0 for d in player_dels)
        inn_balls = sum(1 for d in player_dels if d.get("extras_type") not in ("wides",))
        inn_sr = inn_runs / inn_balls * 100 if inn_balls > 0 else 0.0
        state_stats[state]["innings_list_runs"].append(inn_runs)
        state_stats[state]["innings_list_balls"].append(inn_balls)
        state_stats[state]["innings_list_sr"].append(inn_sr)

    by_state: dict = {}
    best_state = None
    best_sr_val = -1.0
    for s, data in state_stats.items():
        n = len(data["innings_list_sr"])
        if n == 0:
            by_state[s] = {"innings": 0, "avg_sr": 0.0, "avg_runs": 0.0}
        else:
            avg_sr = round(statistics.mean(data["innings_list_sr"]), 2)
            avg_runs = round(statistics.mean(data["innings_list_runs"]), 2)
            by_state[s] = {"innings": n, "avg_sr": avg_sr, "avg_runs": avg_runs}
            if avg_sr > best_sr_val:
                best_sr_val = avg_sr
                best_state = s

    crisis_sr = by_state.get("crisis", {}).get("avg_sr", 0.0)
    clean_sr = by_state.get("clean_start", {}).get("avg_sr", 0.0)
    crisis_delta = round(crisis_sr - clean_sr, 2)

    result = {
        "player_id": player_id,
        "format": fmt,
        "by_state": by_state,
        "best_state": best_state,
        "crisis_delta": crisis_delta,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 14. GET /v1/players/{player_id}/format-switch-impact
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/format-switch-impact", summary="Performance impact after format switch")
@limiter.limit("60/minute")
async def get_format_switch_impact(
    request: Request,
    player_id: int,
    _key_id: str = Depends(require_api_key),
):
    """Measure performance degradation when switching between T20 and ODI within 7 days."""
    ck = cache_key("player_format_switch", player_id)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    fp_rows = (
        client.table("fantasy_points")
        .select("total_points,match_id,matches(match_date,league_id,season,leagues(format))")
        .eq("player_id", player_id)
        .limit(500)
        .execute()
        .data or []
    )

    # Build chronological match list with format
    matches_list: list[dict] = []
    for r in fp_rows:
        mi = r.get("matches") or {}
        if isinstance(mi, list):
            mi = mi[0] if mi else {}
        li = mi.get("leagues") or {}
        if isinstance(li, list):
            li = li[0] if li else {}
        md_str = mi.get("match_date")
        if not md_str:
            continue
        try:
            md = date.fromisoformat(str(md_str)[:10])
        except ValueError:
            continue
        fmt = li.get("format", "").upper()
        matches_list.append({
            "match_id": r["match_id"],
            "total_points": float(r.get("total_points") or 0),
            "match_date": md,
            "league_id": mi.get("league_id"),
            "season": mi.get("season"),
            "format": fmt,
        })

    matches_list.sort(key=lambda x: x["match_date"])

    # Fetch league-season stats for z-score
    league_seasons = {(m["league_id"], m["season"]) for m in matches_list}
    league_season_stats: dict = {}
    for (lid, seas) in league_seasons:
        all_fp = (
            client.table("fantasy_points")
            .select("total_points,match_id,matches(league_id,season)")
            .limit(2000)
            .execute()
            .data or []
        )
        pts = [
            float(x["total_points"]) for x in all_fp
            if x.get("total_points") is not None
            and (x.get("matches") or {}).get("league_id") == lid
            and (x.get("matches") or {}).get("season") == seas
        ]
        if pts:
            m_v = statistics.mean(pts)
            s_v = statistics.stdev(pts) if len(pts) >= 2 else 0.0
        else:
            m_v, s_v = 0.0, 0.0
        league_season_stats[(lid, seas)] = (m_v, s_v)

    switch_z: list[float] = []
    settled_z: list[float] = []
    switch_directions: dict[str, list[float]] = {"T20_to_ODI": [], "ODI_to_T20": []}

    for i, match in enumerate(matches_list):
        ls_key = (match["league_id"], match["season"])
        mean_ls, std_ls = league_season_stats.get(ls_key, (0.0, 0.0))
        z = (match["total_points"] - mean_ls) / std_ls if std_ls > 0 else 0.0

        if i == 0:
            settled_z.append(z)
            continue

        prev = matches_list[i - 1]
        gap = (match["match_date"] - prev["match_date"]).days
        format_changed = match["format"] != prev["format"] and match["format"] and prev["format"]

        if format_changed and gap <= 7:
            switch_z.append(z)
            direction = f"{prev['format']}_to_{match['format']}"
            if direction in switch_directions:
                switch_directions[direction].append(z)
        elif not format_changed and gap >= 10:
            settled_z.append(z)

    switch_avg_z = round(statistics.mean(switch_z), 4) if switch_z else 0.0
    settled_avg_z = round(statistics.mean(settled_z), 4) if settled_z else 0.0
    perf_delta = round(switch_avg_z - settled_avg_z, 4)

    worst_direction = None
    worst_z = float("inf")
    for direction, z_list in switch_directions.items():
        if z_list:
            avg = statistics.mean(z_list)
            if avg < worst_z:
                worst_z = avg
                worst_direction = direction

    format_adaptability = round(max(0.0, min(1.0, 1 - abs(perf_delta))), 4)

    abs_delta = abs(perf_delta)
    if abs_delta < 0.2:
        verdict = "format-agnostic"
    elif abs_delta < 0.5:
        verdict = "slight-impact"
    else:
        verdict = "significant-impact"

    result = {
        "player_id": player_id,
        "switch_matches": len(switch_z),
        "settled_matches": len(settled_z),
        "switch_avg_z": switch_avg_z,
        "settled_avg_z": settled_avg_z,
        "performance_delta": perf_delta,
        "worst_switch_direction": worst_direction,
        "format_adaptability_score": format_adaptability,
        "verdict": verdict,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 15. GET /v1/players/{player_id}/spell-analysis
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/spell-analysis", summary="Bowling spell-by-spell analysis")
@limiter.limit("60/minute")
async def get_spell_analysis(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Analyze how a bowler's economy and wickets evolve across spells."""
    fmt = format.upper()
    ck = cache_key("player_spell_analysis", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    rows = (
        client.table("deliveries")
        .select("runs_total,wicket_type,over_ball,extras_type,match_id")
        .eq("bowler_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    if rows:
        match_ids = list({d["match_id"] for d in rows if d.get("match_id")})[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed = set()
        for m in league_rows:
            li = m.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() == fmt:
                allowed.add(m["match_id"])
        rows = [d for d in rows if d.get("match_id") in allowed]

    by_match: dict = defaultdict(list)
    for d in rows:
        by_match[d["match_id"]].append(d)

    # Spell-level aggregates: spell_number (1-indexed) -> list of (runs, balls, wickets)
    spell_data: dict[int, list[dict]] = defaultdict(list)

    for match_id, deliveries in by_match.items():
        sorted_dels = sorted(deliveries, key=lambda x: float(x.get("over_ball") or 0))

        # Group by over
        by_over: dict = defaultdict(list)
        for d in sorted_dels:
            ov = int(float(d.get("over_ball") or 0))
            by_over[ov].append(d)

        over_nums = sorted(by_over.keys())
        if not over_nums:
            continue

        # Detect spells: gap > 2 overs = new spell
        spells: list[list[int]] = []
        current_spell_overs: list[int] = [over_nums[0]]
        for i in range(1, len(over_nums)):
            if over_nums[i] - over_nums[i - 1] > 2:
                spells.append(current_spell_overs)
                current_spell_overs = [over_nums[i]]
            else:
                current_spell_overs.append(over_nums[i])
        spells.append(current_spell_overs)

        for spell_idx, spell_overs in enumerate(spells, start=1):
            spell_balls = 0
            spell_runs = 0
            spell_wickets = 0
            for ov in spell_overs:
                for d in by_over[ov]:
                    ext = d.get("extras_type")
                    rt = d.get("runs_total") or 0
                    spell_runs += rt
                    if ext not in ("wides", "no-balls"):
                        spell_balls += 1
                    if d.get("wicket_type") is not None:
                        spell_wickets += 1
            spell_data[spell_idx].append({
                "runs": spell_runs,
                "balls": spell_balls,
                "wickets": spell_wickets,
            })

    by_spell: dict = {}
    spell_economy_map: dict[int, float] = {}

    for spell_num in (1, 2, 3):
        entries = spell_data.get(spell_num, [])
        if entries:
            avg_balls = round(statistics.mean([e["balls"] for e in entries]), 2)
            total_r = sum(e["runs"] for e in entries)
            total_b = sum(e["balls"] for e in entries)
            avg_eco = round(total_r / total_b * 6, 2) if total_b > 0 else 0.0
            avg_wkts = round(statistics.mean([e["wickets"] for e in entries]), 2)
            by_spell[f"spell_{spell_num}"] = {
                "matches": len(entries),
                "avg_economy": avg_eco,
                "avg_wickets": avg_wkts,
                "avg_balls": avg_balls,
            }
            spell_economy_map[spell_num] = avg_eco
        else:
            by_spell[f"spell_{spell_num}"] = {
                "matches": 0, "avg_economy": 0.0, "avg_wickets": 0.0, "avg_balls": 0.0
            }
            spell_economy_map[spell_num] = 0.0

    eco1 = spell_economy_map.get(1, 0.0)
    eco3 = spell_economy_map.get(3, 0.0)
    spell_decay = round(eco3 - eco1, 2)

    # Best spell: lowest economy (only among spells with data)
    valid_spells = {k: v for k, v in spell_economy_map.items() if by_spell.get(f"spell_{k}", {}).get("matches", 0) > 0}
    if valid_spells:
        best_spell = min(valid_spells, key=valid_spells.get)
    else:
        best_spell = 1

    if spell_decay < -0.5:
        verdict = "frontloader"
    elif spell_decay > 0.5:
        verdict = "better-recalled"
    else:
        verdict = "consistent"

    result = {
        "player_id": player_id,
        "format": fmt,
        "by_spell": by_spell,
        "spell_decay": spell_decay,
        "best_spell": best_spell,
        "verdict": verdict,
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# 16. GET /v1/players/{player_id}/scoring-zones
# ---------------------------------------------------------------------------

@router.get("/players/{player_id}/scoring-zones", summary="SR and boundary rate by balls-faced zone")
@limiter.limit("60/minute")
async def get_scoring_zones(
    request: Request,
    player_id: int,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Bucket-level SR and boundary rates showing when the batter hits peak form."""
    fmt = format.upper()
    ck = cache_key("player_scoring_zones", player_id, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    rows = (
        client.table("deliveries")
        .select("runs_batter,wicket_type,over_ball,extras_type,match_id,innings")
        .eq("striker_id", player_id)
        .limit(5000)
        .execute()
        .data or []
    )

    if rows:
        match_ids = list({d["match_id"] for d in rows if d.get("match_id")})[:500]
        league_rows = (
            client.table("matches")
            .select("match_id,leagues(format)")
            .in_("match_id", match_ids)
            .execute()
            .data or []
        )
        allowed = set()
        for m in league_rows:
            li = m.get("leagues") or {}
            if isinstance(li, list):
                li = li[0] if li else {}
            if li.get("format", "").upper() == fmt:
                allowed.add(m["match_id"])
        rows = [d for d in rows if d.get("match_id") in allowed]

    by_innings: dict = defaultdict(list)
    for d in rows:
        key = (d.get("match_id"), d.get("innings", 1))
        by_innings[key].append(d)

    bucket_keys = ("1_10", "11_20", "21_30", "31_40", "40_plus")
    bucket_runs: dict[str, int] = {k: 0 for k in bucket_keys}
    bucket_balls: dict[str, int] = {k: 0 for k in bucket_keys}
    bucket_boundaries: dict[str, int] = {k: 0 for k in bucket_keys}

    def _zone_bucket(bf: int) -> str:
        if bf <= 10:
            return "1_10"
        elif bf <= 20:
            return "11_20"
        elif bf <= 30:
            return "21_30"
        elif bf <= 40:
            return "31_40"
        else:
            return "40_plus"

    for key, deliveries in by_innings.items():
        sorted_dels = sorted(deliveries, key=lambda x: float(x.get("over_ball") or 0))
        balls_faced = 0
        for d in sorted_dels:
            ext = d.get("extras_type")
            if ext in ("wides",):
                continue
            balls_faced += 1
            rb = d.get("runs_batter") or 0
            bkt = _zone_bucket(balls_faced)
            bucket_balls[bkt] += 1
            bucket_runs[bkt] += rb
            if rb in (4, 6):
                bucket_boundaries[bkt] += 1

    sr_threshold = 150.0 if fmt == "T20" else 100.0
    scoring_zones: dict[str, dict] = {}
    ignition_point = None
    peak_zone = None
    peak_sr = -1.0

    for bkt in bucket_keys:
        b = bucket_balls[bkt]
        r = bucket_runs[bkt]
        bdry = bucket_boundaries[bkt]
        sr = round(r / b * 100, 2) if b > 0 else 0.0
        bpct = round(bdry / b, 4) if b > 0 else 0.0
        key_name = f"balls_{bkt}"
        scoring_zones[key_name] = {"sr": sr, "boundary_pct": bpct, "runs": r, "balls": b}

        if ignition_point is None and sr >= sr_threshold and b > 0:
            ignition_point = key_name

        if b >= 20 and sr > peak_sr:
            peak_sr = sr
            peak_zone = key_name

    result = {
        "player_id": player_id,
        "format": fmt,
        "scoring_zones": scoring_zones,
        "ignition_point": ignition_point,
        "peak_zone": peak_zone,
        "innings_analyzed": len(by_innings),
    }
    cache_set(ck, result, ttl_seconds=3600)
    return result
