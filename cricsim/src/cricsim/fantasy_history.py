"""Every player's real fantasy points, match by match, for one format family (T20-type or one-day).

Built straight from the Parquet tables with the same points table as cricsim.fantasy (playing, batting, bowling and
fielding points), so a backtest can ask "what did this player actually score in his last matches before this one"
— recent form in the units the pick is judged in.
"""
from __future__ import annotations

from bisect import bisect_left
from datetime import date
from pathlib import Path

import numpy as np

from cricsim.fantasy import batting_points, bowling_points, fielding_points

FAMILIES = {"T20": ("T20", "T10", "HUNDRED"), "OD": ("OD",)}


class History:
    """pid -> dates and points of every match played, oldest first."""

    def __init__(self, rows: dict[str, list[tuple[date, float]]]):
        self.dates = {p: [d for d, _ in v] for p, v in rows.items()}
        self.points = {p: np.array([x for _, x in v]) for p, v in rows.items()}

    def before(self, pid: str, day: date) -> np.ndarray:
        """Points in matches strictly before `day`, oldest first."""
        if pid not in self.dates:
            return np.empty(0)
        return self.points[pid][: bisect_left(self.dates[pid], day)]

    def features(self, pid: str, day: date) -> dict:
        """Recent-form summaries of the points before `day` (None where there's nothing to summarise)."""
        x = self.before(pid, day)
        days = self.dates.get(pid, [])[: len(x)]
        out = {"n": int(len(x))}
        if not len(x):
            return {**out, "last5": None, "last10": None, "ewma": None, "year": None, "n_year": 0, "since": None}
        w = 0.8 ** np.arange(len(x))[::-1]                     # each older match counts 0.8 of the next
        recent = [v for d, v in zip(days, x) if (day - d).days <= 365]
        return {**out, "last5": float(x[-5:].mean()), "last10": float(x[-10:].mean()),
                "ewma": float((w * x).sum() / w.sum()), "year": float(np.mean(recent)) if recent else None,
                "n_year": len(recent), "since": (day - days[-1]).days}


def family(fmt: str) -> str:
    return "OD" if fmt == "OD" else "T20"


def build(con, parquet: Path, family: str = "T20", players: set[str] | None = None) -> History:
    """All players' history, or only `players`' (much faster: what a live fixture needs)."""
    fmts = ", ".join(f"'{f}'" for f in FAMILIES[family])
    only = ""
    if players:
        ids = ", ".join("'" + p.replace("'", "''") + "'" for p in players)
        only = f" AND match_id IN (SELECT DISTINCT match_id FROM read_parquet('{(parquet / 'match_players' / '*.parquet').as_posix()}') WHERE player_id IN ({ids}))"
    od = family == "OD"
    d = (parquet / "deliveries" / "*.parquet").as_posix()
    pts: dict[tuple[str, str], float] = {}
    day: dict[str, date] = {}

    def add(m, p, v):
        if p:
            pts[(m, p)] = pts.get((m, p), 0.0) + v

    bat = con.execute(f"""
        SELECT match_id, batter_id, any_value(match_date), sum(runs_batter), count(*) FILTER (WHERE wides = 0),
               count(*) FILTER (WHERE runs_batter = 4 AND NOT coalesce(non_boundary, FALSE)),
               count(*) FILTER (WHERE runs_batter = 6 AND NOT coalesce(non_boundary, FALSE))
        FROM read_parquet('{d}') WHERE format IN ({fmts}) AND NOT is_super_over AND batter_id IS NOT NULL{only}
        GROUP BY 1, 2""").fetchall()
    outs = {(m, p) for m, p in con.execute(f"""
        SELECT DISTINCT match_id, player_out_id FROM read_parquet('{d}')
        WHERE format IN ({fmts}) AND NOT is_super_over{only} AND is_wicket
          AND wicket_kind NOT IN ('retired hurt', 'retired not out')""").fetchall()}
    if bat:
        m, p, dd, r, b, f4, f6 = zip(*bat)
        out = np.array([(mm, pp) in outs for mm, pp in zip(m, p)])
        v = batting_points(np.array(r), np.array(b), np.array(f4), np.array(f6), out, od=od)
        for mm, pp, x, dt in zip(m, p, v, dd):
            add(mm, pp, float(x))
            day[mm] = dt
    bowl = con.execute(f"""
        SELECT match_id, bowler_id, count(*) FILTER (WHERE is_legal), sum(runs_batter + wides + noballs),
               count(*) FILTER (WHERE wicket_kind IN ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled',
                                                     'hit wicket')),
               count(*) FILTER (WHERE wicket_kind IN ('bowled', 'lbw'))
        FROM read_parquet('{d}') WHERE format IN ({fmts}) AND NOT is_super_over AND bowler_id IS NOT NULL{only}
        GROUP BY 1, 2""").fetchall()
    if bowl:
        m, p, balls, runs, w, bl = zip(*bowl)
        v = bowling_points(np.array(balls), np.array(runs), np.array(w), np.array(bl), od=od)
        for mm, pp, x in zip(m, p, v):
            add(mm, pp, float(x))
    if any((parquet / "wickets").glob("*.parquet")):
        ev: dict[str, list] = {}
        for m, kind, f, b in con.execute(f"""
                SELECT match_id, kind, fielder_ids, bowler_id FROM read_parquet('{(parquet / "wickets" / "*.parquet").as_posix()}')
                WHERE format IN ({fmts}) AND NOT is_super_over{only}""").fetchall():
            ev.setdefault(m, []).append((kind, f, b))
        for m, events in ev.items():
            for p, x in fielding_points(events).items():
                add(m, p, x)
    mp = (parquet / "match_players" / "*.parquet").as_posix()
    mt = (parquet / "matches" / "*.parquet").as_posix()
    for m, p, dt in con.execute(f"""
            SELECT mp.match_id, mp.player_id, mt.match_date FROM read_parquet('{mp}') mp
            JOIN read_parquet('{mt}') mt USING (match_id) WHERE mt.format IN ({fmts}){only.replace('match_id IN', 'mp.match_id IN')}""").fetchall():
        add(m, p, 4.0)                                    # playing points: everyone listed
        day.setdefault(m, dt)
    rows: dict[str, list[tuple[date, float]]] = {}
    for (m, p), x in pts.items():
        if m in day:
            rows.setdefault(p, []).append((day[m], x))
    for v in rows.values():
        v.sort()
    return History(rows)


def build_stats(con, parquet: Path, family: str = "T20") -> dict:
    """Real runs per innings batted, wickets per match bowled and every team's results, oldest first, for one
    format family: what the stacking lab blends with the simulations."""
    fmts = ", ".join(f"'{f}'" for f in FAMILIES[family])
    d = (parquet / "deliveries" / "*.parquet").as_posix()
    mt = (parquet / "matches" / "*.parquet").as_posix()
    runs: dict[str, list] = {}
    for p, dt, r in con.execute(f"""
            SELECT batter_id, any_value(match_date), sum(runs_batter) FROM read_parquet('{d}')
            WHERE format IN ({fmts}) AND NOT is_super_over AND batter_id IS NOT NULL GROUP BY match_id, batter_id""").fetchall():
        runs.setdefault(p, []).append((dt, float(r)))
    wkts: dict[str, list] = {}
    for p, dt, w in con.execute(f"""
            SELECT bowler_id, any_value(match_date),
                   count(*) FILTER (WHERE wicket_kind IN ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket'))
            FROM read_parquet('{d}') WHERE format IN ({fmts}) AND NOT is_super_over AND bowler_id IS NOT NULL
            GROUP BY match_id, bowler_id""").fetchall():
        wkts.setdefault(p, []).append((dt, float(w)))
    teams: dict[str, list] = {}
    h2h: dict[tuple[str, str], list] = {}
    for t1, t2, w, dt in con.execute(f"""
            SELECT team1, team2, winner, match_date FROM read_parquet('{mt}')
            WHERE format IN ({fmts}) AND winner IS NOT NULL AND winner IN (team1, team2)""").fetchall():
        for a, b in ((t1, t2), (t2, t1)):
            teams.setdefault(a, []).append((dt, 1.0 if w == a else 0.0))
            h2h.setdefault((a, b), []).append((dt, 1.0 if w == a else 0.0))
    for v in (*runs.values(), *wkts.values(), *teams.values(), *h2h.values()):
        v.sort()
    return {"runs": History(runs), "wkts": History(wkts), "teams": History(teams),
            "h2h": History({f"{a}|{b}": v for (a, b), v in h2h.items()})}
