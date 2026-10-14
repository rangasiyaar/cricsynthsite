"""MVP backtest: the site's MVP rating on the most recent T20s, out of sample.

    python -m cricsim.engine.mvp_backtest --parquet data/parquet --matches 100

Takes the last N completed T20 matches, fits the model only on matches before the earliest of them, simulates each
from its real XIs, rates all 22 players with the site's MVP formula (a port of app/lib/ratings.ts) and compares the
rating's top 11 with the 11 players who scored the most fantasy points in the real match (cricsim.fantasy table:
batting and bowling, no fielding). Reports how often the top 11 captures more than 8 of the real top 11, next to two
references: picking at random, and ranking by the engine's own expected fantasy points.
"""
from __future__ import annotations

import logging
import math
import zlib
from datetime import date
from pathlib import Path

import click
import duckdb
import numpy as np

from cricsim.engine.backtest import _xi_order
from cricsim.engine.fit import FitConfig, fit
from cricsim.engine.simulate import simulate
from cricsim.engine.spec import MatchSpec, TeamSpec
from cricsim.engine.summary import summarize
from cricsim.fantasy import actual_points, sim_points

log = logging.getLogger(__name__)


# ── the site's formulas (keep in step with app/lib/ratings.ts) ────────────────────────────────────────────────────

def _values(s: dict, wicket: float, econ_w: float) -> dict[str, tuple[float, float]]:
    players = [p for t in s["teams"] for p in t["players"]]
    runs = balls = conceded = overs = 0.0
    for p in players:
        if p.get("batting"):
            runs += p["batting"]["runs"]["mean"] or 0
            balls += p["batting"]["balls"]["mean"] or 0
        if p.get("bowling"):
            conceded += p["bowling"]["runs"]["mean"] or 0
            overs += p["bowling"]["overs"]
    avg_sr = 100 * runs / balls if balls else 130.0
    avg_econ = conceded / overs if overs else 8.0
    scale = s["meta"]["rules"]["overs"] / 20
    out = {}
    for p in players:
        b, w = p.get("batting"), p.get("bowling")
        r = (b["runs"]["mean"] or 0) if b else 0.0
        bat = r * math.sqrt(b["strike_rate"] / avg_sr) if b and b["strike_rate"] > 0 else r
        bowl = ((w["wickets"]["mean"] or 0) * wicket + econ_w * w["overs"] * (avg_econ - w["economy"])) if w else 0.0
        out[p["id"]] = (max(0.0, bat) / scale, max(0.0, bowl) / scale)
    return out


def site_mvp(s: dict) -> dict[str, float]:
    """MVP now: batting percentile + bowling percentile within the match, plus a small value term for ties."""
    v = _values(s, 12, 0.5)
    ids = list(v)
    def pct(k):
        xs = sorted(v[i][k] for i in ids)
        return {i: (len(xs) - 1 - xs[::-1].index(v[i][k])) / (len(xs) - 1) if v[i][k] > 0 else 0.0 for i in ids}
    pb, pw = pct(0), pct(1)
    most = max(sum(v[i]) for i in ids) or 1e-9
    return {i: pb[i] + pw[i] + 0.15 * sum(v[i]) / most for i in ids}


def previous_mvp(s: dict) -> dict[str, float]:
    """MVP before the rating lab: batting value + bowling value (wicket 12, full economy weight)."""
    return {i: a + b for i, (a, b) in _values(s, 12, 1.0).items()}


# ── matches ───────────────────────────────────────────────────────────────────────────────────────────────────────

def last_t20s(con, parquet: Path, n: int) -> list[dict]:
    m = (parquet / "matches" / "*.parquet").as_posix()
    mp = (parquet / "match_players" / "*.parquet").as_posix()
    inn = (parquet / "innings" / "*.parquet").as_posix()
    rows = con.execute(f"""
        WITH ok AS (SELECT match_id FROM read_parquet('{inn}') WHERE NOT is_super_over AND innings_no <= 2
                    GROUP BY 1 HAVING count(*) = 2)
        SELECT m.match_id, m.format, m.gender, m.venue_id, m.team_type,
               coalesce(m.competition_id, 'intl-' || coalesce(m.team_type, '') || '-' || m.format) AS comp,
               m.team1, m.team2, m.match_date
        FROM read_parquet('{m}') m JOIN ok USING (match_id)
        WHERE m.format = 'T20' AND m.gender IN ('male', 'female') AND m.method IS NULL AND m.winner IS NOT NULL
        ORDER BY m.match_date DESC, m.match_id DESC LIMIT {int(n * 1.5)}""").fetchall()
    out = []
    for mid, fmt, gender, venue, team_type, comp, t1, t2, day in rows:
        xi = {team: [r[0] for r in con.execute(
            f"SELECT player_id FROM read_parquet('{mp}') WHERE match_id = ? AND team = ? ORDER BY list_order",
            [mid, team]).fetchall()] for team in (t1, t2)}
        if any(len(v) != 11 or None in v for v in xi.values()):
            continue
        first = con.execute(f"SELECT team FROM read_parquet('{inn}') WHERE match_id = ? AND innings_no = 1",
                            [mid]).fetchone()[0]
        out.append({"match_id": mid, "format": fmt, "gender": gender, "venue_id": venue, "comp": comp,
                    "teams": [t1, t2], "xi": xi, "first": first, "date": day, "team_type": team_type})
        if len(out) == n:
            break
    return out


def p_random_at_least(k: int, n: int = 22, top: int = 11) -> float:
    """Chance a random 11 of 22 shares at least k players with the real top 11 (hypergeometric)."""
    total = math.comb(n, top)
    return sum(math.comb(top, j) * math.comb(n - top, top - j) for j in range(k, top + 1)) / total


def run(parquet: Path, n: int, n_sims: int, memory: str) -> dict:
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    matches = last_t20s(con, parquet, n)
    cutoff: date = min(mt["date"] for mt in matches)
    log.info("%d matches from %s to %s; fitting on everything before %s", len(matches), cutoff,
             max(mt["date"] for mt in matches), cutoff)
    model = fit(parquet, FitConfig(cutoff=cutoff), memory=memory, con=con)
    d = (parquet / "deliveries" / "*.parquet").as_posix()
    ids = ", ".join(f"'{mt['match_id']}'" for mt in matches)
    con.execute(f"""CREATE OR REPLACE TABLE hold AS SELECT * FROM read_parquet('{d}')
                    WHERE match_date >= DATE '{cutoff}' AND match_id IN ({ids}) AND NOT is_super_over""")
    rows = []
    for mt in matches:
        t1, t2 = mt["teams"]
        spec = MatchSpec(mt["format"], mt["gender"],
                         (TeamSpec(t1, _xi_order(model, mt["xi"][t1], mt["format"])),
                          TeamSpec(t2, _xi_order(model, mt["xi"][t2], mt["format"]))),
                         venue_id=mt["venue_id"], comp_key=mt["comp"], batting_first=0 if mt["first"] == t1 else 1,
                         team_type=mt["team_type"])
        sims = simulate(model, spec, n=n_sims, seed=zlib.crc32(mt["match_id"].encode()))
        s = summarize(sims, model)
        real = actual_points(con, mt["match_id"])
        players = mt["xi"][t1] + mt["xi"][t2]
        real_all = {p: real.get(p, 0.0) for p in players}
        real_top = set(sorted(players, key=lambda p: (-real_all[p], p))[:11])
        pids, pts = sim_points(sims)
        ef = dict(zip(pids, pts.mean(0)))
        row = {"match_id": mt["match_id"], "date": str(mt["date"]), "group": f"{mt['gender']} {mt['team_type']}",
               "mvp_real": max(players, key=lambda p: real_all[p])}
        for name, score in (("site MVP", site_mvp(s)), ("previous MVP", previous_mvp(s)),
                            ("expected fantasy points", ef)):
            top = sorted(players, key=lambda p: (-score.get(p, 0.0), p))[:11]
            row[name] = {"overlap": len(set(top) & real_top), "mvp_in_top3": row["mvp_real"] in top[:3]}
        rows.append(row)
    return {"cutoff": str(cutoff), "matches": rows}


def report(res: dict) -> str:
    rows = res["matches"]
    n = len(rows)
    out = [f"### MVP backtest: last {n} T20s ({rows[-1]['date']} to {rows[0]['date']}), model fitted before {res['cutoff']}",
           "", "Top 11 by rating v the 11 highest real fantasy scorers (batting + bowling).", "",
           "| Method | More than 8 of 11 (9+) | Mean overlap | 7+ of 11 | Real MVP in our top 3 |", "|---|---|---|---|---|"]
    for name in ("site MVP", "previous MVP", "expected fantasy points"):
        ov = [r[name]["overlap"] for r in rows]
        nine = sum(o >= 9 for o in ov)
        out.append(f"| {name} | {nine} of {n} ({nine / n:.0%}) | {np.mean(ov):.2f} | "
                   f"{sum(o >= 7 for o in ov) / n:.0%} | {sum(r[name]['mvp_in_top3'] for r in rows) / n:.0%} |")
    out.append(f"| random 11 (expected) | {p_random_at_least(9):.1%} | 5.50 | {p_random_at_least(7):.0%} | 14% |")
    out += ["", "Overlap distribution (site MVP):", ""]
    dist = {k: sum(r["site MVP"]["overlap"] == k for r in rows) for k in range(12)}
    out.append(" · ".join(f"{k}: {v}" for k, v in dist.items() if v))
    groups = sorted({r["group"] for r in rows})
    if len(groups) > 1:
        out += ["", "| Group | Matches | Site MVP 9+ | Mean overlap |", "|---|---|---|---|"]
        for g in groups:
            sub = [r for r in rows if r["group"] == g]
            ov = [r["site MVP"]["overlap"] for r in sub]
            out.append(f"| {g} | {len(sub)} | {sum(o >= 9 for o in ov)} | {np.mean(ov):.2f} |")
    return "\n".join(out)


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), default=Path("data/parquet"))
@click.option("--matches", default=100)
@click.option("--sims", default=1000)
@click.option("--memory", default="3GB")
def main(parquet: Path, matches: int, sims: int, memory: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    click.echo(report(run(parquet, matches, sims, memory)))


if __name__ == "__main__":
    main()
