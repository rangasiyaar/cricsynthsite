"""Venue intelligence for the match centre's Venue tab: how this ground has played recently and how the model reads it.

For every published match (data/publish/matches/<id>.json) it writes data/publish/venue/<id>.json with
- the model's read of the ground (character, scoring and wicket level against a neutral ground, by phase);
- the last few seasons at the ground in this format and gender: first-innings scores, batting first v chasing,
  the toss, runs per over / balls per wicket / boundaries by phase against all grounds, pace v spin;
- how the players in this match's XIs have done at the ground.
Aggregates only (analytics, not raw data). Kept separate from the match document so a reused forecast never goes stale.

    python -m cricsim.venue_intel --parquet data/parquet --model data/models/latest --publish data/publish
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from pathlib import Path

import click
import duckdb
import numpy as np

log = logging.getLogger(__name__)

YEARS = 6
NOT_OUT = ("retired hurt", "retired not out")
NOT_BOWLER = ("run out", "retired hurt", "retired not out", "retired out", "obstructing the field", "timed out",
              "handled the ball")
# overs (1-based, inclusive) that end the powerplay and the middle overs
PHASES = {"T20": (6, 15, 20), "OD": (10, 40, 50), "T10": (2, 7, 10), "HUNDRED": (5, 15, 20)}


def _tbl(parquet: Path, name: str) -> str:
    return f"read_parquet('{(parquet / name / '*.parquet').as_posix()}')"


def _r(x, nd=1):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)


def _hist(x: np.ndarray, width: int = 10) -> list[dict]:
    """Share of first innings in each 10-run band (the Venue tab's histogram)."""
    if not len(x):
        return []
    lo = int(x.min() // width * width)
    counts = np.bincount(((x - lo) // width).astype(int))
    return [{"x": lo + i * width, "p": round(float(c) / len(x), 4)} for i, c in enumerate(counts)]


class Ground:
    """Queries for one parquet set; ground-wide numbers and all-ground baselines are cached."""

    def __init__(self, parquet: Path, memory: str = "2GB"):
        self.p = parquet
        self.con = duckdb.connect()
        self.con.execute(f"SET memory_limit='{memory}'")
        at = parquet / "attributes" / "attributes.parquet"
        self.attrs = f"read_parquet('{at.as_posix()}')" if at.exists() else None
        self._base: dict = {}

    def _where(self, fmt, gender, since, until, venue=True):
        return (f"format = '{fmt}' AND gender = '{gender}' AND match_date >= DATE '{since}' AND match_date < DATE '{until}'"
                + (" AND venue_id = $v" if venue else ""))

    def history(self, vid, fmt, gender, since, until) -> dict | None:
        rows = self.con.execute(f"""
            SELECT m.match_id, m.match_date, m.toss_winner, m.toss_decision, m.winner, m.result, m.method,
                   m.by_runs, m.by_wickets, i1.team, i1.runs, i1.wickets, i2.team, i2.runs, i2.wickets
            FROM {_tbl(self.p, 'matches')} m
            JOIN {_tbl(self.p, 'innings')} i1 ON i1.match_id = m.match_id AND i1.innings_no = 1 AND NOT i1.is_super_over
            LEFT JOIN {_tbl(self.p, 'innings')} i2 ON i2.match_id = m.match_id AND i2.innings_no = 2 AND NOT i2.is_super_over
            WHERE {self._where(fmt, gender, since, until).replace('format', 'm.format').replace('gender', 'm.gender')
                   .replace('match_date', 'm.match_date').replace('venue_id', 'm.venue_id')}
            ORDER BY m.match_date DESC""", {"v": vid}).fetchall()
        if not rows:
            return None
        full = [r for r in rows if not r[6]]                         # no rain rule: totals are comparable
        firsts = np.array([r[10] for r in full], dtype=float)
        seconds = np.array([r[13] for r in full if r[13] is not None], dtype=float)
        decided = [r for r in rows if r[4]]
        tossed = [r for r in rows if r[2] and r[3]]
        hi = max(full, key=lambda r: r[10]) if full else None
        lo = min(full, key=lambda r: r[10]) if full else None
        side = lambda r: {"team": r[9], "runs": r[10], "date": str(r[1])}
        recent = []
        for r in rows[:8]:
            margin = f"{r[7]} runs" if r[7] else f"{r[8]} wickets" if r[8] else None
            recent.append({"date": str(r[1]), "first": {"team": r[9], "runs": r[10], "wickets": r[11]},
                           "second": {"team": r[12], "runs": r[13], "wickets": r[14]} if r[12] else None,
                           "winner": r[4], "margin": margin, "rain": bool(r[6]), "result": r[5]})
        return {
            "matches": len(rows), "from": str(rows[-1][1]), "to": str(rows[0][1]),
            "first_innings": {"n": len(firsts), "mean": _r(firsts.mean()) if len(firsts) else None,
                              "median": _r(np.median(firsts), 0) if len(firsts) else None,
                              "q25": _r(np.percentile(firsts, 25), 0) if len(firsts) else None,
                              "q75": _r(np.percentile(firsts, 75), 0) if len(firsts) else None,
                              "high": side(hi) if hi else None, "low": side(lo) if lo else None,
                              "hist": _hist(firsts)},
            "second_innings": {"n": len(seconds), "mean": _r(seconds.mean()) if len(seconds) else None},
            "bat_first_won": _r(np.mean([r[4] == r[9] for r in decided]), 3) if decided else None,
            "decided": len(decided),
            "toss": {"n": len(tossed), "chose_bat": _r(np.mean([r[3] == "bat" for r in tossed]), 3) if tossed else None,
                     "toss_winner_won": _r(np.mean([r[2] == r[4] for r in tossed if r[4]]), 3)
                     if any(r[4] for r in tossed) else None},
            "recent": recent,
        }

    def _phase_rows(self, fmt, gender, since, until, vid=None):
        pp, mid, _ = PHASES.get(fmt, PHASES["T20"])
        return self.con.execute(f"""
            SELECT CASE WHEN "over" < {pp} THEN 'powerplay' WHEN "over" < {mid} THEN 'middle' ELSE 'death' END ph,
                   sum(runs_total), sum(CASE WHEN is_legal THEN 1 ELSE 0 END),
                   sum(CASE WHEN is_wicket AND coalesce(wicket_kind, '') NOT IN {NOT_OUT} THEN 1 ELSE 0 END),
                   sum(CASE WHEN is_legal AND runs_batter IN (4, 6) AND NOT coalesce(non_boundary, false) THEN 1 ELSE 0 END)
            FROM {_tbl(self.p, 'deliveries')}
            WHERE {self._where(fmt, gender, since, until, venue=vid is not None)} AND NOT is_super_over AND innings_no <= 2
            GROUP BY 1""", {"v": vid} if vid else {}).fetchall()

    @staticmethod
    def _phase_stats(rows):
        out = {}
        for ph, runs, balls, wk, b4 in rows:
            if balls:
                out[ph] = {"runs_per_over": _r(6 * runs / balls, 2), "balls_per_wicket": _r(balls / wk, 1) if wk else None,
                           "boundary_pct": _r(b4 / balls, 3), "balls": int(balls)}
        return out

    def _kind_rows(self, fmt, gender, since, until, vid=None):
        if not self.attrs:
            return []
        return self.con.execute(f"""
            SELECT CASE WHEN a.bowling_kind = 'pace' THEN 'pace' ELSE 'spin' END k,
                   sum(d.runs_total - coalesce(d.byes, 0) - coalesce(d.legbyes, 0)),
                   sum(CASE WHEN d.is_legal THEN 1 ELSE 0 END),
                   sum(CASE WHEN d.is_wicket AND coalesce(d.wicket_kind, '') NOT IN {NOT_BOWLER} THEN 1 ELSE 0 END)
            FROM {_tbl(self.p, 'deliveries')} d JOIN {self.attrs} a ON a.player_id = d.bowler_id
            WHERE {self._where(fmt, gender, since, until, venue=vid is not None).replace('format', 'd.format')
                   .replace('gender', 'd.gender').replace('match_date', 'd.match_date').replace('venue_id', 'd.venue_id')}
              AND NOT d.is_super_over AND a.bowling_kind IS NOT NULL
            GROUP BY 1""", {"v": vid} if vid else {}).fetchall()

    @staticmethod
    def _kind_stats(rows):
        balls = sum(r[2] for r in rows) or 0
        wk = sum(r[3] for r in rows) or 0
        out = {}
        for k, runs, b, w in rows:
            if b:
                out[k] = {"economy": _r(6 * runs / b, 2), "balls_per_wicket": _r(b / w, 1) if w else None,
                          "share_of_balls": _r(b / balls, 3) if balls else None,
                          "share_of_wickets": _r(w / wk, 3) if wk else None, "balls": int(b)}
        return out

    def conditions(self, vid, fmt, gender, since, until) -> dict:
        key = (fmt, gender, since, until)
        if key not in self._base:
            self._base[key] = {"phases": self._phase_stats(self._phase_rows(fmt, gender, since, until)),
                               "bowling": self._kind_stats(self._kind_rows(fmt, gender, since, until))}
        base = self._base[key]
        return {"phases": {"here": self._phase_stats(self._phase_rows(fmt, gender, since, until, vid)), "all": base["phases"]},
                "bowling": {"here": self._kind_stats(self._kind_rows(fmt, gender, since, until, vid)), "all": base["bowling"]}}

    def players(self, vid, fmt, gender, since, until, xi: dict[str, tuple[str, str]]) -> dict:
        """How this match's players have done at the ground. xi: id → (name, team)."""
        if not xi:
            return {"batting": [], "bowling": []}
        ids = ",".join(f"'{p}'" for p in xi)
        w = self._where(fmt, gender, since, until)
        bat = self.con.execute(f"""
            SELECT batter_id, count(DISTINCT match_id), sum(runs_batter), sum(CASE WHEN wides = 0 OR wides IS NULL THEN 1 ELSE 0 END)
            FROM {_tbl(self.p, 'deliveries')} WHERE {w} AND batter_id IN ({ids}) AND NOT is_super_over GROUP BY 1""",
            {"v": vid}).fetchall()
        outs = dict(self.con.execute(f"""
            SELECT player_out_id, count(*) FROM {_tbl(self.p, 'deliveries')}
            WHERE {w} AND player_out_id IN ({ids}) AND is_wicket AND coalesce(wicket_kind, '') NOT IN {NOT_OUT}
              AND NOT is_super_over GROUP BY 1""", {"v": vid}).fetchall())
        bowl = self.con.execute(f"""
            SELECT bowler_id, count(DISTINCT match_id), sum(CASE WHEN is_legal THEN 1 ELSE 0 END),
                   sum(runs_total - coalesce(byes, 0) - coalesce(legbyes, 0)),
                   sum(CASE WHEN is_wicket AND coalesce(wicket_kind, '') NOT IN {NOT_BOWLER} THEN 1 ELSE 0 END)
            FROM {_tbl(self.p, 'deliveries')} WHERE {w} AND bowler_id IN ({ids}) AND NOT is_super_over GROUP BY 1""",
            {"v": vid}).fetchall()
        batting = [{"id": p, "name": xi[p][0], "team": xi[p][1], "innings": int(n), "runs": int(r), "balls": int(b),
                    "outs": int(outs.get(p, 0)), "strike_rate": _r(100 * r / b, 1) if b else None,
                    "average": _r(r / outs[p], 1) if outs.get(p) else None} for p, n, r, b in bat if b]
        bowling = [{"id": p, "name": xi[p][0], "team": xi[p][1], "matches": int(n), "balls": int(b), "runs": int(r),
                    "wickets": int(wk), "economy": _r(6 * r / b, 2) if b else None} for p, n, b, r, wk in bowl if b]
        batting.sort(key=lambda x: -x["runs"])
        bowling.sort(key=lambda x: (-x["wickets"], x["economy"] or 99))
        return {"batting": batting[:8], "bowling": bowling[:8]}


def _model_read(model, vid, fmt, gender):
    if model is None or not vid:
        return None
    from cricsim.engine import insight as I
    from cricsim.engine.model import FORMAT_LIST
    try:
        v = I.venue_profile(model, vid, fmt if fmt in FORMAT_LIST else "T20", gender)
    except Exception:                                          # an odd ground must not stop the rest
        log.exception("model read failed for %s", vid)
        return None
    return v and {k: v[k] for k in ("character", "scoring_index", "wicket_index", "by_phase")}


def intel(g: Ground, doc: dict, model=None, today: date | None = None) -> dict | None:
    m = doc.get("match") or {}
    vid, fmt, gender = m.get("venue_id"), m.get("format") or "T20", m.get("gender") or "male"
    if not vid:
        return None
    until = min(date.fromisoformat(m["date"]) if m.get("date") else (today or date.today()), today or date.today())
    since = until - timedelta(days=round(365.25 * YEARS))
    xi = {p["id"]: (p["name"], t["name"]) for t in doc["summary"]["teams"] for p in t["players"]}
    return {"venue": {"id": vid, "name": m.get("venue")}, "format": fmt, "gender": gender, "since": str(since),
            "model": _model_read(model, vid, fmt, gender),
            "history": g.history(vid, fmt, gender, since, until),
            **g.conditions(vid, fmt, gender, since, until),
            "players": g.players(vid, fmt, gender, since, until, xi)}


# ── fantasy pages: recent form and "suits this ground" (a player's record here and at grounds that play like it) ──
FIT_YEARS = 5            # a player's matches counted for the ground fit
FIT_K = 6                # matches of pseudo-count pulling a player's ground record towards their usual level
FORM_DAYS = 150          # form is shown only for players who have played this recently


class FantasyData:
    """Everything the fantasy reads need, loaded once for all published matches: ground profiles per format and
    gender, every listed player's real fantasy points match by match, runs and wickets, and each match's ground."""

    def __init__(self, g: Ground, players: set[str], today: date):
        from cricsim import fantasy_history as fh
        self.g, self.today, self._prof = g, today, {}
        self.hist = {f: fh.build(g.con, g.p, f, players) for f in ("T20", "OD")} if players else {}
        self.stats = {f: fh.build_stats(g.con, g.p, f, players) for f in ("T20", "OD")} if players else {}
        self.where = {m: (v, f) for m, v, f in g.con.execute(
            f"SELECT match_id, venue_id, format FROM {_tbl(g.p, 'matches')}").fetchall()}

    def profiles(self, fmt: str, gender: str):
        from cricsim import grounds
        key = (fmt, gender)
        if key not in self._prof:
            since = self.today - timedelta(days=round(365.25 * YEARS))
            self._prof[key] = grounds.build(self.g.con, self.g.p, fmt, gender, since, self.today)
        return self._prof[key]


def fantasy_reads(fd: FantasyData, doc: dict) -> dict | None:
    """The fantasy page's ground profile (label, similar grounds) and, per player, recent form and ground fit."""
    m = doc.get("match") or {}
    vid, fmt, gender = m.get("venue_id"), m.get("format") or "T20", m.get("gender") or "male"
    fam = "OD" if fmt == "OD" else "T20"
    if fam not in fd.hist:
        return None
    day = min(date.fromisoformat(m["date"]) if m.get("date") else fd.today, fd.today)
    prof = fd.profiles(fmt, gender)
    ground = prof.describe(vid) if vid else None
    group = {vid, *(s["id"] for s in (ground or {}).get("similar", []))} if ground else set()
    hist, stats = fd.hist[fam], fd.stats[fam]
    start = day - timedelta(days=round(365.25 * FIT_YEARS))
    out = []
    for t in doc["summary"]["teams"]:
        for pl in t["players"]:
            p = pl["id"]
            row = {"id": p, "name": pl["name"].removeprefix("new:"), "team": t["name"]}
            x = hist.before(p, day)
            dates = hist.dates.get(p, [])[: len(x)]
            if len(x) >= 10 and (day - dates[-1]).days <= FORM_DAYS:
                usual = x[-30:-5]
                runs = stats["runs"].before(p, day)[-5:]
                wkts = stats["wkts"].before(p, day)[-5:]
                row["form"] = {"last5": round(float(x[-5:].mean()), 1), "usual": round(float(usual.mean()), 1),
                               "n": int(len(x)), "runs": [int(r) for r in runs], "wickets": [int(w) for w in wkts]}
            if group and p in hist.matches:
                mids = hist.matches[p][: len(x)]
                keep = [(v, mid) for v, mid, d in zip(x, mids, dates)
                        if d >= start and fd.where.get(mid, (None, None))[1] == fmt]
                if len(keep) >= 8:
                    allp = np.array([v for v, _ in keep])
                    here = np.array([v for v, mid in keep if fd.where[mid][0] in group])
                    at = np.array([v for v, mid in keep if fd.where[mid][0] == vid])
                    if len(here) >= 3:
                        diff = float(here.mean() - allp.mean())
                        row["fit"] = {"n": int(len(here)), "mean": round(float(here.mean()), 1),
                                      "usual": round(float(allp.mean()), 1), "n_all": int(len(allp)),
                                      "n_ground": int(len(at)),
                                      "mean_ground": round(float(at.mean()), 1) if len(at) else None,
                                      "score": round(diff * len(here) / (len(here) + FIT_K), 1)}
            if len(row) > 3:
                out.append(row)
    return {"ground": ground, "players": out}


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--publish", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--model", "model_dir", type=click.Path(path_type=Path), default=None)
@click.option("--memory", default="2GB")
def main(parquet: Path, publish: Path, model_dir: Path | None, memory: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    model = None
    if model_dir and model_dir.exists():
        from cricsim.engine.model import Model
        model = Model.load(model_dir)
    g, out, n = Ground(parquet, memory), publish / "venue", 0
    out.mkdir(parents=True, exist_ok=True)
    docs = {f.stem: json.loads(f.read_text()) for f in sorted((publish / "matches").glob("*.json"))
            if not f.name.endswith(".pack.json")}
    fd = None
    try:                                                   # the fantasy reads are extra: a failure leaves them out
        fd = FantasyData(g, {p["id"] for d in docs.values() for t in d["summary"]["teams"] for p in t["players"]},
                         date.today())
    except Exception:
        log.exception("fantasy data failed; fantasy reads left out")
    for mid, doc in docs.items():
        f = publish / "matches" / f"{mid}.json"
        try:
            v = intel(g, doc, model)
        except Exception:
            log.exception("venue intel failed for %s", f.stem)
            continue
        if v and fd and doc.get("fantasy"):
            try:
                v["fantasy"] = fantasy_reads(fd, doc)
            except Exception:
                log.exception("fantasy reads failed for %s", mid)
        if v:
            (out / f.name).write_text(json.dumps(v, separators=(",", ":")))
            n += 1
    click.echo(f"venue intelligence for {n} matches → {out}")


if __name__ == "__main__":
    main()
