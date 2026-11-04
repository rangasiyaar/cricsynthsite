"""Ground profiles: how each ground plays, and which grounds play like it.

For one format and gender over a window of seasons, every ground with enough matches gets a profile from the
ball-by-ball tables:
- scoring: runs per over;
- boundaries: share of legal balls hit for four or six;
- wickets: wickets per ball;
- pace v spin: pace bowlers' share of the bowlers' wickets, and spin's economy minus pace's;
- shape: powerplay and death-over scoring against the ground's own rate.
Each number is pulled towards the all-ground figure in proportion to how little the ground has (a ground with a
handful of matches sits close to average), then scaled across grounds. Similar grounds are the nearest profiles.
A plain label ("High-scoring, helps pace") comes from the clearest features.

Used by cricsim.venue_intel for the fantasy pages ("suits this ground": a player's record here and at the grounds
that play like it), and checked by cricsim.ground_lab.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from cricsim.venue_intel import NOT_BOWLER, NOT_OUT, PHASES, _tbl

MIN_MATCHES = 6          # a ground needs this many matches in the window to have a profile of its own
NEIGHBOURS = 6
# feature: (pseudo-count pulling it towards the all-ground value, weight in the distance)
FEATURES = {
    "rpo": (1500, 1.5),           # balls
    "boundary": (1500, 1.0),      # balls
    "wkt_rate": (1500, 1.0),      # balls
    "pace_share": (40, 1.5),      # bowlers' wickets
    "spin_v_pace": (600, 1.0),    # spin balls
    "pp_rel": (600, 0.5),         # powerplay balls
    "death_rel": (600, 0.5),      # death-over balls
}


@dataclass
class Profiles:
    fmt: str
    gender: str
    names: dict[str, str]
    matches: dict[str, int]
    values: dict[str, dict[str, float]]          # vid -> shrunk feature values
    base: dict[str, float]                       # all-ground values
    z: dict[str, np.ndarray] = field(default_factory=dict)

    def similar(self, vid: str, k: int = NEIGHBOURS) -> list[tuple[str, float]]:
        """The k grounds whose profiles are closest to `vid`'s (ground id, distance), nearest first."""
        if vid not in self.z:
            return []
        w = np.array([FEATURES[f][1] for f in FEATURES])
        me = self.z[vid]
        d = sorted((float(np.sqrt((w * (z - me) ** 2).sum())), v) for v, z in self.z.items() if v != vid)
        return [(v, round(x, 3)) for x, v in d[:k]]

    def label(self, vid: str) -> str | None:
        """Plain words for the clearest features ("High-scoring, helps pace"), or None for an average ground."""
        if vid not in self.z:
            return None
        z = dict(zip(FEATURES, self.z[vid]))
        bits = []
        if z["rpo"] > 0.7:
            bits.append("high-scoring")
        elif z["rpo"] < -0.7:
            bits.append("low-scoring")
        if z["pace_share"] > 0.7:
            bits.append("helps pace")
        elif z["pace_share"] < -0.7:
            bits.append("helps spin")
        if z["boundary"] > 0.9 and "high-scoring" not in bits:
            bits.append("lots of boundaries")
        if z["wkt_rate"] > 0.9:
            bits.append("wickets fall often")
        if not bits:
            return "Plays close to average"
        s = ", ".join(bits)
        return s[0].upper() + s[1:]

    def describe(self, vid: str) -> dict | None:
        if vid not in self.values:
            return None
        v = self.values[vid]
        return {"id": vid, "name": self.names.get(vid), "matches": self.matches.get(vid, 0), "label": self.label(vid),
                "runs_per_over": round(v["rpo"], 2), "boundary_pct": round(v["boundary"], 3),
                "balls_per_wicket": round(1 / v["wkt_rate"], 1) if v["wkt_rate"] else None,
                "pace_wicket_share": round(v["pace_share"], 3),
                "similar": [{"id": s, "name": self.names.get(s), "matches": self.matches.get(s, 0)}
                            for s, _ in self.similar(vid)]}


def build(con, parquet: Path, fmt: str, gender: str, since, until, min_matches: int = MIN_MATCHES) -> Profiles:
    """Profiles for every ground with at least `min_matches` matches of `fmt`/`gender` in [since, until)."""
    pp, mid, _ = PHASES.get(fmt, PHASES["T20"])
    at = parquet / "attributes" / "attributes.parquet"
    kind = ("CASE WHEN a.bowling_kind = 'pace' THEN 'pace' WHEN a.bowling_kind IS NULL THEN NULL ELSE 'spin' END"
            if at.exists() else "NULL")
    join = f"LEFT JOIN read_parquet('{at.as_posix()}') a ON a.player_id = d.bowler_id" if at.exists() else ""
    rows = con.execute(f"""
        WITH b AS (
            SELECT d.venue_id v, d.match_id m, d."over" o, d.is_legal legal, d.runs_total runs,
                   d.runs_total - coalesce(d.byes, 0) - coalesce(d.legbyes, 0) conceded,
                   d.is_legal AND d.runs_batter IN (4, 6) AND NOT coalesce(d.non_boundary, false) four,
                   d.is_wicket AND coalesce(d.wicket_kind, '') NOT IN {NOT_OUT} wkt,
                   d.is_wicket AND coalesce(d.wicket_kind, '') NOT IN {NOT_BOWLER} bwkt, {kind} k
            FROM {_tbl(parquet, 'deliveries')} d {join}
            WHERE d.format = $f AND d.gender = $g AND d.match_date >= $s AND d.match_date < $u
              AND NOT d.is_super_over AND d.innings_no <= 2 AND d.venue_id IS NOT NULL)
        SELECT v, count(DISTINCT m), count(*) FILTER (WHERE legal), sum(runs), count(*) FILTER (WHERE four),
               count(*) FILTER (WHERE wkt),
               count(*) FILTER (WHERE bwkt AND k = 'pace'), count(*) FILTER (WHERE bwkt AND k = 'spin'),
               count(*) FILTER (WHERE legal AND k = 'pace'), sum(conceded) FILTER (WHERE k = 'pace'),
               count(*) FILTER (WHERE legal AND k = 'spin'), sum(conceded) FILTER (WHERE k = 'spin'),
               count(*) FILTER (WHERE legal AND o < {pp}), sum(runs) FILTER (WHERE o < {pp}),
               count(*) FILTER (WHERE legal AND o >= {mid}), sum(runs) FILTER (WHERE o >= {mid})
        FROM b GROUP BY 1""", {"f": fmt, "g": gender, "s": since, "u": until}).fetchall()
    names = dict(con.execute(f"""
        SELECT venue_id, arg_max(venue, match_date) FROM {_tbl(parquet, 'matches')}
        WHERE format = $f AND gender = $g AND venue_id IS NOT NULL GROUP BY 1""", {"f": fmt, "g": gender}).fetchall())
    cols = np.array([[x or 0 for x in r[1:]] for r in rows], dtype=float).reshape(-1, 15)
    vids = [r[0] for r in rows]
    tot = cols.sum(0)
    (_, balls, runs, fours, wk, pw, sw, pb, pr, sb, sr, ppb, ppr, db, dr) = tot

    def rate(a, b):
        return a / b if b else 0.0
    base = {"rpo": 6 * rate(runs, balls), "boundary": rate(fours, balls), "wkt_rate": rate(wk, balls),
            "pace_share": rate(pw, pw + sw) if pw + sw else 0.5,
            "spin_v_pace": 6 * rate(sr, sb) - 6 * rate(pr, pb),
            "pp_rel": 6 * rate(ppr, ppb) - 6 * rate(runs, balls), "death_rel": 6 * rate(dr, db) - 6 * rate(runs, balls)}

    def shrink(x, n, b, k):
        return (x * n + b * k) / (n + k) if n + k else b
    values, matches = {}, {}
    for v, c in zip(vids, cols):
        (n, balls, runs, fours, wk, pw, sw, pb, pr, sb, sr, ppb, ppr, db, dr) = c
        if n < min_matches or not balls:
            continue
        rpo = shrink(6 * rate(runs, balls), balls, base["rpo"], FEATURES["rpo"][0])
        values[v] = {
            "rpo": rpo,
            "boundary": shrink(rate(fours, balls), balls, base["boundary"], FEATURES["boundary"][0]),
            "wkt_rate": shrink(rate(wk, balls), balls, base["wkt_rate"], FEATURES["wkt_rate"][0]),
            "pace_share": shrink(rate(pw, pw + sw), pw + sw, base["pace_share"], FEATURES["pace_share"][0]),
            "spin_v_pace": shrink(6 * rate(sr, sb) - 6 * rate(pr, pb), min(sb, pb), base["spin_v_pace"],
                                  FEATURES["spin_v_pace"][0]),
            "pp_rel": shrink(6 * rate(ppr, ppb) - 6 * rate(runs, balls), ppb, base["pp_rel"], FEATURES["pp_rel"][0]),
            "death_rel": shrink(6 * rate(dr, db) - 6 * rate(runs, balls), db, base["death_rel"],
                                FEATURES["death_rel"][0]),
        }
        matches[v] = int(n)
    prof = Profiles(fmt, gender, names, matches, values, base)
    if len(values) >= 3:
        m = np.array([[values[v][f] for f in FEATURES] for v in values])
        mu, sd = m.mean(0), m.std(0)
        sd[sd == 0] = 1
        prof.z = {v: (row - mu) / sd for v, row in zip(values, m)}
    return prof
