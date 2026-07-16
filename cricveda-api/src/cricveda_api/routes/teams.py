"""Team analytics endpoints.

GET /v1/teams/{team_name}/batting-depth — positional contribution and depth score
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


class BattingDepthResponse(BaseModel):
    team_name: str
    format: str
    season: str | None
    matches_analyzed: int
    avg_team_total: float
    top_order_pct: float      # positions 1-3 % of runs
    middle_order_pct: float   # positions 4-6 % of runs
    lower_order_pct: float    # positions 7+ % of runs
    depth_score: float        # 0-10
    top_order_reliance: str   # "high" / "medium" / "low"
    sample_innings: int       # total innings counted


# ---------------------------------------------------------------------------
# Endpoint: Batting Depth
# ---------------------------------------------------------------------------


@router.get(
    "/teams/{team_name}/batting-depth",
    response_model=BattingDepthResponse,
    summary="Batting position contribution and depth score for a team",
    description=(
        "Analyses ball-by-ball data to break down what percentage of a team's runs come from "
        "each batting group (top/middle/lower order) and produces a `depth_score` (0–10). "
        "A higher depth score means the team is less reliant on its top 3 and has meaningful "
        "contributions lower in the order. Results cached for **60 minutes**.\n\n"
        "Pass the team name URL-encoded, e.g. `India`, `Mumbai%20Indians`."
    ),
)
@limiter.limit("60/minute")
async def get_batting_depth(
    request: Request,
    team_name: str,
    format: str = Query("T20", description="Match format: `T20` or `ODI`"),
    season: str | None = Query(None, description="Season string, e.g. `2024` or `2023/24`"),
    _key_id: str = Depends(require_api_key),
):
    """Return batting depth analysis — positional run percentages and depth score."""
    fmt = format.upper()
    if fmt not in ("T20", "ODI"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="format must be T20 or ODI",
        )

    ck = cache_key("batting_depth", team_name, fmt, season)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    # Format-filtered league IDs
    league_rows = (
        client.table("leagues")
        .select("league_id")
        .eq("format", fmt)
        .execute()
    )
    league_ids = [r["league_id"] for r in league_rows.data]

    # Matches involving this team
    query = (
        client.table("matches")
        .select("match_id,team1,team2,toss_winner,toss_decision,winner,season")
        .in_("league_id", league_ids)
        .limit(200)
    )
    if season:
        query = query.eq("season", season)

    # Supabase doesn't support OR in a single .eq; use two queries and union
    m1 = query.eq("team1", team_name).execute().data
    m2 = (
        client.table("matches")
        .select("match_id,team1,team2,toss_winner,toss_decision,winner,season")
        .in_("league_id", league_ids)
        .eq("team2", team_name)
        .limit(200)
        .execute()
    ).data
    if season:
        m2 = [m for m in m2 if str(m.get("season")) == season]

    # Deduplicate by match_id
    seen: set[int] = set()
    matches = []
    for m in m1 + m2:
        mid = m["match_id"]
        if mid not in seen:
            seen.add(mid)
            matches.append(m)

    # Apply season filter uniformly (already applied to m1 via query; m2 done inline above)
    matches = matches[:200]

    _empty = BattingDepthResponse(
        team_name=team_name,
        format=fmt,
        season=season,
        matches_analyzed=0,
        avg_team_total=0.0,
        top_order_pct=0.0,
        middle_order_pct=0.0,
        lower_order_pct=0.0,
        depth_score=0.0,
        top_order_reliance="unknown",
        sample_innings=0,
    )

    if not matches:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    match_ids = [m["match_id"] for m in matches]

    # Determine the innings number for team_name in each match
    # innings_map: match_id -> innings number (1 or 2) for team_name batting
    def _batting_innings(m: dict) -> int | None:
        """Return the innings number in which team_name batted."""
        decision = (m.get("toss_decision") or "").lower()
        toss_winner = m.get("toss_winner") or ""
        team1 = m.get("team1") or ""
        team2 = m.get("team2") or ""

        if decision == "bat":
            # toss winner chose to bat first
            if toss_winner == team_name:
                return 1
            elif team_name in (team1, team2):
                return 2
        elif decision == "field":
            # toss winner chose to field; opposition bats first
            if toss_winner == team_name:
                return 2
            elif team_name in (team1, team2):
                return 1
        return None  # can't determine — include both innings and filter by player later

    innings_map: dict[int, int | None] = {m["match_id"]: _batting_innings(m) for m in matches}

    # Fetch all deliveries for these match_ids in chunks of 50
    def _chunk(lst: list, n: int):
        for i in range(0, len(lst), n):
            yield lst[i : i + n]

    all_deliveries: list[dict] = []
    for chunk in _chunk(match_ids, 50):
        rows = (
            client.table("deliveries")
            .select("match_id,innings,over_ball,striker_id,runs_batter,extras_type")
            .in_("match_id", chunk)
            .limit(10000)
            .execute()
        ).data
        all_deliveries.extend(rows)

    # Group deliveries by (match_id, innings)
    from collections import defaultdict
    innings_deliveries: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for d in all_deliveries:
        innings_deliveries[(d["match_id"], d["innings"])].append(d)

    # Analyse each relevant innings
    team_totals: list[float] = []
    top_pcts: list[float] = []
    mid_pcts: list[float] = []
    low_pcts: list[float] = []
    total_innings_counted = 0

    for m in matches:
        mid = m["match_id"]
        target_inn = innings_map.get(mid)

        for inn_num in ([target_inn] if target_inn else [1, 2]):
            key = (mid, inn_num)
            if key not in innings_deliveries:
                continue

            deliveries = innings_deliveries[key]
            if not deliveries:
                continue

            # Build batting order: first appearance of each striker sorted by over_ball
            first_seen: dict[int, float] = {}
            for d in deliveries:
                sid = d.get("striker_id")
                ob = d.get("over_ball") or 0.0
                if sid is not None and sid not in first_seen:
                    first_seen[sid] = float(ob)

            # Sort players by first ball faced
            batting_order = sorted(first_seen.items(), key=lambda x: x[1])
            position_map: dict[int, int] = {
                sid: pos + 1 for pos, (sid, _) in enumerate(batting_order)
            }

            # Sum runs per position group (exclude wides from batter runs, but keep others)
            top_runs = 0
            mid_runs = 0
            low_runs = 0
            for d in deliveries:
                sid = d.get("striker_id")
                runs = d.get("runs_batter") or 0
                if sid is None:
                    continue
                pos = position_map.get(sid, 11)
                if pos <= 3:
                    top_runs += runs
                elif pos <= 6:
                    mid_runs += runs
                else:
                    low_runs += runs

            total_runs = top_runs + mid_runs + low_runs
            if total_runs == 0:
                continue

            team_totals.append(total_runs)
            top_pcts.append(top_runs / total_runs)
            mid_pcts.append(mid_runs / total_runs)
            low_pcts.append(low_runs / total_runs)
            total_innings_counted += 1

    if not team_totals:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    avg_total = round(statistics.mean(team_totals), 2)
    avg_top = round(statistics.mean(top_pcts) * 100, 2)
    avg_mid = round(statistics.mean(mid_pcts) * 100, 2)
    avg_low = round(statistics.mean(low_pcts) * 100, 2)

    # Depth score: higher = more contributions from middle/lower order
    # lower_order_pct * 10 + middle_order_pct * 5, clamped 0-10
    raw_depth = (avg_low / 100 * 10) + (avg_mid / 100 * 5)
    depth_score = round(min(10.0, max(0.0, raw_depth)), 2)

    # Top-order reliance label
    if avg_top >= 65:
        reliance = "high"
    elif avg_top >= 50:
        reliance = "medium"
    else:
        reliance = "low"

    result = BattingDepthResponse(
        team_name=team_name,
        format=fmt,
        season=season,
        matches_analyzed=len(matches),
        avg_team_total=avg_total,
        top_order_pct=avg_top,
        middle_order_pct=avg_mid,
        lower_order_pct=avg_low,
        depth_score=depth_score,
        top_order_reliance=reliance,
        sample_innings=total_innings_counted,
    )

    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# Response models — Comeback Index & Rivalry
# ---------------------------------------------------------------------------


class ComebackIndexResponse(BaseModel):
    team_name: str
    format: str
    season: str | None
    matches_analyzed: int
    losing_position_matches: int
    comebacks_won: int
    comeback_index: float
    resilience: str


class RivalryResponse(BaseModel):
    team1_name: str
    team2_name: str
    format: str
    total_meetings: int
    team1_wins: int
    team2_wins: int
    no_results: int
    team1_win_pct: float
    last_5_results: list[dict]
    current_streak: str
    dominant_team: str


# ---------------------------------------------------------------------------
# Endpoint: Comeback Index
# ---------------------------------------------------------------------------


@router.get(
    "/teams/{team_name}/comeback-index",
    response_model=ComebackIndexResponse,
    summary="Win rate from losing positions",
)
@limiter.limit("60/minute")
async def get_comeback_index(
    request: Request,
    team_name: str,
    format: str = Query(default="T20"),
    season: str | None = Query(default=None),
    _key_id: str = Depends(require_api_key),
):
    """How often a team wins after being in a losing position."""
    fmt = format.upper()
    ck = cache_key("team_comeback", team_name, fmt, season or "")
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    from collections import defaultdict
    client = get_client()

    lg = client.table("leagues").select("league_id").eq("format", fmt).execute().data or []
    league_ids = [r["league_id"] for r in lg]

    _empty = ComebackIndexResponse(
        team_name=team_name, format=fmt, season=season, matches_analyzed=0,
        losing_position_matches=0, comebacks_won=0, comeback_index=0.0, resilience="unknown",
    )
    if not league_ids:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    q1 = (client.table("matches")
          .select("match_id,team1,team2,toss_winner,toss_decision,winner,season")
          .in_("league_id", league_ids).eq("team1", team_name).limit(200).execute().data or [])
    q2 = (client.table("matches")
          .select("match_id,team1,team2,toss_winner,toss_decision,winner,season")
          .in_("league_id", league_ids).eq("team2", team_name).limit(200).execute().data or [])
    if season:
        q1 = [m for m in q1 if str(m.get("season")) == season]
        q2 = [m for m in q2 if str(m.get("season")) == season]

    seen: set = set()
    matches = []
    for m in q1 + q2:
        if m["match_id"] not in seen:
            seen.add(m["match_id"])
            matches.append(m)
    matches = matches[:200]
    if not matches:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    pp_over = 6 if fmt == "T20" else 10
    total_overs = 20 if fmt == "T20" else 50

    def _batting_innings(m: dict) -> int | None:
        decision = (m.get("toss_decision") or "").lower()
        tw = m.get("toss_winner") or ""
        t1, t2 = m.get("team1") or "", m.get("team2") or ""
        if decision == "bat":
            if tw == team_name:
                return 1
            if team_name in (t1, t2):
                return 2
        elif decision == "field":
            if tw == team_name:
                return 2
            if team_name in (t1, t2):
                return 1
        return None

    innings_map = {m["match_id"]: _batting_innings(m) for m in matches}
    match_ids = [m["match_id"] for m in matches]

    def _chunk(lst, n):
        for i in range(0, len(lst), n):
            yield lst[i:i + n]

    all_dels: dict = defaultdict(list)
    for chunk in _chunk(match_ids, 50):
        rows = (client.table("deliveries")
                .select("match_id,innings,over_ball,wicket_type,runs_total")
                .in_("match_id", chunk).limit(5000).execute().data or [])
        for d in rows:
            all_dels[d["match_id"]].append(d)

    losing_positions = 0
    comebacks_won = 0
    for m in matches:
        mid = m["match_id"]
        inn = innings_map.get(mid)
        if inn is None:
            continue
        dels = all_dels.get(mid, [])
        team_dels = [d for d in dels if d.get("innings") == inn]
        if not team_dels:
            continue
        # wickets fallen inside powerplay
        pp_wkts = sum(1 for d in team_dels
                      if int(float(d.get("over_ball") or 0)) < pp_over and d.get("wicket_type"))
        losing = pp_wkts >= 3
        # chase: required rate blew out
        if not losing and inn == 2:
            first_inn = [d for d in dels if d.get("innings") == 1]
            target = sum(d.get("runs_total") or 0 for d in first_inn) + 1
            # state at halfway of the chase
            half_over = total_overs // 2
            runs_at_half = sum(d.get("runs_total") or 0 for d in team_dels
                               if int(float(d.get("over_ball") or 0)) < half_over)
            overs_left = total_overs - half_over
            if overs_left > 0:
                rrr = (target - runs_at_half) / overs_left
                if rrr > 10.5:
                    losing = True
        if losing:
            losing_positions += 1
            if m.get("winner") == team_name:
                comebacks_won += 1

    comeback_index = round(comebacks_won / losing_positions, 2) if losing_positions else 0.0
    if comeback_index > 0.35:
        resilience = "elite"
    elif comeback_index > 0.2:
        resilience = "strong"
    elif comeback_index > 0.1:
        resilience = "average"
    else:
        resilience = "fragile"

    result = ComebackIndexResponse(
        team_name=team_name, format=fmt, season=season, matches_analyzed=len(matches),
        losing_position_matches=losing_positions, comebacks_won=comebacks_won,
        comeback_index=comeback_index, resilience=resilience,
    )
    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result


# ---------------------------------------------------------------------------
# Endpoint: Rivalry (head-to-head)
# ---------------------------------------------------------------------------


@router.get(
    "/teams/{team1_name}/rivalry/{team2_name}",
    response_model=RivalryResponse,
    summary="Head-to-head rivalry record",
)
@limiter.limit("60/minute")
async def get_rivalry(
    request: Request,
    team1_name: str,
    team2_name: str,
    format: str = Query(default="T20"),
    _key_id: str = Depends(require_api_key),
):
    """Head-to-head record between two teams."""
    fmt = format.upper()
    ck = cache_key("team_rivalry", team1_name, team2_name, fmt)
    cached = cache_get(ck)
    if cached:
        return cached

    from cricveda_ingest.db import get_client
    client = get_client()

    lg = client.table("leagues").select("league_id").eq("format", fmt).execute().data or []
    league_ids = [r["league_id"] for r in lg]

    _empty = RivalryResponse(
        team1_name=team1_name, team2_name=team2_name, format=fmt, total_meetings=0,
        team1_wins=0, team2_wins=0, no_results=0, team1_win_pct=0.0,
        last_5_results=[], current_streak="no matches", dominant_team="even",
    )
    if not league_ids:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    a = (client.table("matches").select("match_id,team1,team2,winner,match_date")
         .in_("league_id", league_ids).eq("team1", team1_name).eq("team2", team2_name)
         .limit(200).execute().data or [])
    b = (client.table("matches").select("match_id,team1,team2,winner,match_date")
         .in_("league_id", league_ids).eq("team1", team2_name).eq("team2", team1_name)
         .limit(200).execute().data or [])
    seen: set = set()
    matches = []
    for m in a + b:
        if m["match_id"] not in seen:
            seen.add(m["match_id"])
            matches.append(m)
    if not matches:
        cache_set(ck, _empty.model_dump(), ttl_seconds=3600)
        return _empty

    matches.sort(key=lambda m: str(m.get("match_date") or ""), reverse=True)

    t1w = sum(1 for m in matches if m.get("winner") == team1_name)
    t2w = sum(1 for m in matches if m.get("winner") == team2_name)
    nr = sum(1 for m in matches if not m.get("winner"))
    total = len(matches)
    t1_pct = round(t1w / total, 2) if total else 0.0

    last_5 = [{"match_date": str(m.get("match_date") or ""), "winner": m.get("winner") or "no result"}
              for m in matches[:5]]

    # current streak from most recent decided matches
    streak_team = None
    streak_n = 0
    for m in matches:
        w = m.get("winner")
        if not w:
            continue
        if streak_team is None:
            streak_team = w
            streak_n = 1
        elif w == streak_team:
            streak_n += 1
        else:
            break
    current_streak = f"{streak_team} won last {streak_n}" if streak_team else "no decisive matches"

    if t1w > t2w:
        dominant = team1_name
    elif t2w > t1w:
        dominant = team2_name
    else:
        dominant = "even"

    result = RivalryResponse(
        team1_name=team1_name, team2_name=team2_name, format=fmt, total_meetings=total,
        team1_wins=t1w, team2_wins=t2w, no_results=nr, team1_win_pct=t1_pct,
        last_5_results=last_5, current_streak=current_streak, dominant_team=dominant,
    )
    cache_set(ck, result.model_dump(), ttl_seconds=3600)
    return result
