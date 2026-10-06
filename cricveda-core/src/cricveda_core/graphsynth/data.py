"""Shape raw rows into renderer inputs."""
from __future__ import annotations

import math

PHASES = {"T20": (("Powerplay", 0, 6), ("Middle", 6, 15), ("Death", 15, 20)),
          "ODI": (("Powerplay", 0, 10), ("Middle", 10, 40), ("Death", 40, 50))}
_EXTRAS_NOT_LEGAL = {"wides", "wide", "noballs", "noball"}


def batting_order(team1: str, team2: str, toss_winner: str | None, toss_decision: str | None) -> tuple[str, str]:
    """(batted first, batted second). Without toss data, team1 is assumed to bat first."""
    if toss_winner in (team1, team2) and toss_decision in ("bat", "field"):
        other = team2 if toss_winner == team1 else team1
        return (toss_winner, other) if toss_decision == "bat" else (other, toss_winner)
    return team1, team2


def innings_by_over(deliveries: list[dict], teams: tuple[str, str], overs: int) -> list[dict]:
    """Per-over runs and wickets for each innings from delivery rows."""
    out = []
    for inn, team in ((1, teams[0]), (2, teams[1])):
        balls = [d for d in deliveries if d.get("innings") == inn]
        if not balls:
            continue
        n = min(overs, max(int(math.floor(float(d["over_ball"]))) for d in balls) + 1)
        runs, wkts = [0] * n, [0] * n
        for d in balls:
            o = min(n - 1, int(math.floor(float(d["over_ball"]))))
            runs[o] += int(d.get("runs_total") or 0)
            if d.get("wicket_type"):
                wkts[o] += 1
        out.append({"team": team, "runs": runs, "wickets": wkts})
    return out


def phase_rows(innings: list[dict], fmt: str = "T20") -> list[dict]:
    rows = []
    for inn in innings:
        phases = []
        for name, lo, hi in PHASES[fmt]:
            r, w = inn["runs"][lo:hi], inn["wickets"][lo:hi]
            if r:
                phases.append({"name": name, "runs": sum(r), "wickets": sum(w), "overs": len(r)})
        rows.append({"team": inn["team"], "phases": phases})
    return rows


def form_rows(points: list[dict], opponents: dict[int, str] | None = None, last: int = 10) -> list[dict]:
    """fantasy_points rows (match_id, match_date, total_points) → last N, oldest first."""
    rows = sorted(points, key=lambda r: str(r.get("match_date")))[-last:]
    return [{"label": f"v {opponents[r['match_id']]}" if opponents and r["match_id"] in opponents
             else str(r.get("match_date", ""))[5:10], "points": float(r.get("total_points") or 0)} for r in rows]


def snapshot_series(snapshots: list[dict], home_is_batting_first: bool | None = None) -> list[dict]:
    """live_snapshots rows → win-probability series (home side's chance)."""
    return [{"innings": s["innings"], "balls": s["legal_balls"], "home_win": float(s["win_prob_home"])}
            for s in sorted(snapshots, key=lambda s: (s["innings"], s["legal_balls"]))]


def overs_text(legal_balls: int) -> str:
    return f"{legal_balls // 6}.{legal_balls % 6}" if legal_balls % 6 else f"{legal_balls // 6}"
