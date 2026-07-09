"""Dream11 T20 fantasy points engine.

All rules are pure functions — no I/O, no side effects.
Every rule is traceable to a specific Dream11 T20 scoring table.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from cricveda_core.domain.models import NON_BOWLER_WICKETS, PlayerRole


# ============================================================
# Per-delivery aggregation structs (built from raw deliveries)
# ============================================================

@dataclass
class BattingStats:
    runs: int = 0
    balls_faced: int = 0
    fours: int = 0
    sixes: int = 0
    dismissed: bool = False
    primary_role: PlayerRole | None = None


@dataclass
class BowlingStats:
    legal_deliveries: int = 0   # excludes wides and no-balls
    runs_conceded: int = 0
    wickets: int = 0            # bowler-credited wickets only
    bowled_lbw_wickets: int = 0
    maiden_overs: int = 0


@dataclass
class FieldingStats:
    catches: int = 0
    stumpings: int = 0
    direct_runouts: int = 0
    indirect_runouts: int = 0


@dataclass
class PlayerMatchStats:
    player_id: int
    match_id: int
    batting: BattingStats = field(default_factory=BattingStats)
    bowling: BowlingStats = field(default_factory=BowlingStats)
    fielding: FieldingStats = field(default_factory=FieldingStats)


# ============================================================
# Scoring functions
# ============================================================

def compute_batting_points(stats: BattingStats) -> float:
    pts = 0.0

    # Base run points
    pts += stats.runs * 0.5

    # Boundary bonuses
    pts += stats.fours * 1.0
    pts += stats.sixes * 2.0

    # Milestone bonuses (mutually exclusive tiers)
    if stats.runs >= 100:
        pts += 16.0
    elif stats.runs >= 50:
        pts += 8.0

    # Duck penalty — only for BAT, AR, WK
    duck_roles = {PlayerRole.BAT, PlayerRole.AR, PlayerRole.WK}
    if stats.dismissed and stats.runs == 0 and stats.primary_role in duck_roles:
        pts -= 2.0

    # Strike rate bonuses/penalties (only when ≥ 10 balls faced)
    if stats.balls_faced >= 10:
        sr = (stats.runs / stats.balls_faced) * 100
        if sr > 170:
            pts += 6.0
        elif sr > 150:
            pts += 4.0
        elif sr > 130:
            pts += 2.0
        elif sr <= 50:
            pts -= 6.0
        elif sr <= 60:
            pts -= 4.0
        elif sr <= 70:
            pts -= 2.0

    return pts


def compute_bowling_points(stats: BowlingStats) -> float:
    pts = 0.0

    # Wicket points
    pts += stats.wickets * 25.0
    pts += stats.bowled_lbw_wickets * 8.0

    # Haul bonuses (mutually exclusive tiers)
    if stats.wickets >= 5:
        pts += 16.0
    elif stats.wickets == 4:
        pts += 8.0
    elif stats.wickets == 3:
        pts += 4.0

    # Maiden over points
    pts += stats.maiden_overs * 4.0

    # Economy rate bonuses/penalties (only when ≥ 2 overs = 12 legal deliveries)
    if stats.legal_deliveries >= 12:
        overs = stats.legal_deliveries / 6.0
        economy = stats.runs_conceded / overs
        if economy < 5.0:
            pts += 6.0
        elif economy < 6.0:
            pts += 4.0
        elif economy < 7.0:
            pts += 2.0
        elif economy < 10.0:
            pass  # neutral zone: 7.00–9.99
        elif economy < 11.0:
            pts -= 2.0
        elif economy < 12.0:
            pts -= 4.0
        else:
            pts -= 6.0

    return pts


def compute_fielding_points(stats: FieldingStats) -> float:
    pts = 0.0
    pts += stats.catches * 8.0
    pts += stats.stumpings * 12.0
    pts += stats.direct_runouts * 12.0
    pts += stats.indirect_runouts * 6.0

    # Bonus for 3+ catches in a match
    if stats.catches >= 3:
        pts += 4.0

    return pts


def compute_player_fantasy_points(
    player_stats: PlayerMatchStats,
    rain_affected: bool = False,
) -> tuple[float, float, float, float, bool]:
    """Return (batting_pts, bowling_pts, fielding_pts, total_pts, training_exclude)."""
    batting_pts = compute_batting_points(player_stats.batting)
    bowling_pts = compute_bowling_points(player_stats.bowling)
    fielding_pts = compute_fielding_points(player_stats.fielding)
    total_pts = batting_pts + bowling_pts + fielding_pts
    return batting_pts, bowling_pts, fielding_pts, total_pts, rain_affected


# ============================================================
# Aggregation helper — build PlayerMatchStats from raw delivery rows
# ============================================================

def aggregate_match_stats(
    match_id: int,
    deliveries: list[dict],
    player_roles: dict[int, PlayerRole],
) -> dict[int, PlayerMatchStats]:
    """
    Build per-player match stats from a list of resolved delivery dicts.

    Each delivery dict must have keys matching the deliveries table columns.
    Returns {player_id: PlayerMatchStats}.
    """
    players: dict[int, PlayerMatchStats] = {}

    def get_or_create(pid: int) -> PlayerMatchStats:
        if pid not in players:
            players[pid] = PlayerMatchStats(player_id=pid, match_id=match_id)
            players[pid].batting.primary_role = player_roles.get(pid)
        return players[pid]

    # Track over-by-over bowler runs to detect maiden overs
    # Structure: {bowler_id: {(innings, over_number): [runs]}}
    over_runs: dict[int, dict[tuple[int, int], list[int]]] = {}

    for d in deliveries:
        striker_id = d.get("striker_id")
        bowler_id = d.get("bowler_id")
        runs_batter = d.get("runs_batter", 0) or 0
        runs_total = d.get("runs_total", 0) or 0
        runs_extras = d.get("runs_extras", 0) or 0
        extras_type = d.get("extras_type")
        wicket_type = d.get("wicket_type")
        wicket_player_id = d.get("wicket_player_id")
        innings = d.get("innings", 1)

        # Parse over number from over_ball (e.g. 3.4 → over 3)
        over_ball = float(d.get("over_ball", 0))
        over_num = int(over_ball)

        # ---------- Batting ----------
        if striker_id:
            s = get_or_create(striker_id)
            is_wide = extras_type == "wides"
            is_noball = extras_type == "noballs"
            # Batter doesn't face a ball on wide; does on no-ball
            if not is_wide:
                s.batting.balls_faced += 1
            s.batting.runs += runs_batter
            if runs_batter == 4:
                s.batting.fours += 1
            elif runs_batter == 6:
                s.batting.sixes += 1

        # ---------- Bowling ----------
        if bowler_id:
            b = get_or_create(bowler_id)
            is_wide = extras_type == "wides"
            is_noball = extras_type == "noballs"

            if not is_wide and not is_noball:
                b.bowling.legal_deliveries += 1

            # Runs conceded = batter runs + extras (except byes/leg-byes which aren't the bowler's fault)
            byes_or_legbyes = extras_type in ("byes", "legbyes")
            if byes_or_legbyes:
                b.bowling.runs_conceded += runs_batter  # only bat runs
            else:
                b.bowling.runs_conceded += runs_total

            # Maiden over tracking
            if bowler_id not in over_runs:
                over_runs[bowler_id] = {}
            key = (innings, over_num)
            if key not in over_runs[bowler_id]:
                over_runs[bowler_id][key] = []
            if byes_or_legbyes:
                over_runs[bowler_id][key].append(runs_batter)
            else:
                over_runs[bowler_id][key].append(runs_total)

            # Wicket credit to bowler (exclude non-bowler wicket types)
            if wicket_type and wicket_type not in NON_BOWLER_WICKETS:
                b.bowling.wickets += 1
                if wicket_type in ("bowled", "lbw"):
                    b.bowling.bowled_lbw_wickets += 1

        # ---------- Fielding ----------
        if wicket_type:
            dismissed_player_id = wicket_player_id

            if wicket_type == "caught":
                # fielder is in the raw data as wicket_player_id when it's a catch
                if wicket_player_id and wicket_player_id != bowler_id:
                    # caught by fielder (not the bowler catching their own delivery — still counts)
                    pass
                if wicket_player_id:
                    f = get_or_create(wicket_player_id)
                    f.fielding.catches += 1

            elif wicket_type == "stumped":
                if wicket_player_id:
                    f = get_or_create(wicket_player_id)
                    f.fielding.stumpings += 1

            elif wicket_type == "run out":
                # Cricsheet encodes the fielder in wicket_player_id for run outs
                if wicket_player_id:
                    # Can't distinguish direct vs indirect from Cricsheet easily;
                    # treat all as direct unless additional fielder info present
                    f = get_or_create(wicket_player_id)
                    f.fielding.direct_runouts += 1

    # Compute maiden overs
    for bowler_id, over_map in over_runs.items():
        b = get_or_create(bowler_id)
        for key, run_list in over_map.items():
            if len(run_list) == 6 and sum(run_list) == 0:
                b.bowling.maiden_overs += 1

    # Mark dismissed batters
    for d in deliveries:
        if d.get("wicket_type") and d.get("striker_id"):
            striker_id = d["striker_id"]
            if striker_id in players:
                players[striker_id].batting.dismissed = True

    return players
