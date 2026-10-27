"""Match-level inputs for direct models: every player's real record before a given day, from the ball-by-ball tables.

A direct model learns a player's runs or wickets (or the result) straight from these, with no simulation. The stacking
lab compares it with the simulations alone and with a blend of both. Everything here only looks at matches strictly
before the day asked about, so a backtest never sees the match it predicts.

Batters: average, strike rate and out-rate (career, recent, recency-weighted), by phase (powerplay / middle / death),
against pace and spin and against the opposition's actual attack, batting slot (today's, usual and the change),
balls per innings, chasing v setting, at this ground and in this competition, converting starts, rest and
workload, experience. Bowlers: wickets and economy the same ways, by phase, against left- and right-handers and the
opposition's top order, share of bowled/lbw, the ground's pace/spin wicket split, workload. Teams and match: batting
and bowling strength of each XI, recent results, head-to-head, the ground's first-innings score and bat-first record.
Rates are shrunk towards the format's average so small samples don't swing them.
"""
from __future__ import annotations

from bisect import bisect_left
from datetime import date
from pathlib import Path

import numpy as np

from cricsim.fantasy_history import FAMILIES

CREDITED = "('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket')"
NOT_OUT = "('retired hurt', 'retired not out')"
PH = ("pp", "mid", "death")
BAT_COLS = ["balls", "runs", "outs", "fours", "sixes", "dots",
            *[f"{k}_{p}" for p in PH for k in ("balls", "runs", "outs")],
            *[f"{k}_{g}" for g in ("pace", "spin") for k in ("balls", "runs", "outs")],
            "slot", "chasing", "inn_balls"]
BOWL_COLS = ["balls", "runs", "wkts", "bl",
             *[f"{k}_{p}" for p in PH for k in ("balls", "runs", "wkts")],
             *[f"{k}_{h}" for h in ("L", "R") for k in ("balls", "runs", "wkts")], "inn_balls"]


class Log:
    """One player's (or ground's) matches, oldest first: dates, venue/competition per match and a count matrix."""

    def __init__(self, rows: list[tuple], cols: list[str]):
        rows.sort(key=lambda r: r[0])
        self.dates = [r[0] for r in rows]
        self.venue = [r[1] for r in rows]
        self.comp = [r[2] for r in rows]
        self.ix = {c: i for i, c in enumerate(cols)}
        self.X = np.array([r[3] for r in rows], dtype=float).reshape(len(rows), len(cols))
        self.C = np.vstack([np.zeros(len(cols)), np.cumsum(self.X, 0)])

    def upto(self, day: date) -> int:
        return bisect_left(self.dates, day)

    def total(self, i: int, last: int | None = None) -> np.ndarray:
        return self.C[i] - (self.C[max(i - last, 0)] if last else 0)

    def where(self, i: int, attr: str, value) -> np.ndarray:
        rows = [k for k in range(i) if getattr(self, attr)[k] == value]
        return self.X[rows].sum(0) if rows else np.zeros(self.X.shape[1])

    def col(self, i: int, name: str, last: int | None = None) -> np.ndarray:
        return self.X[max(i - last, 0) if last else 0:i, self.ix[name]]


def _rate(num, den, prior, k):
    return float((num + k * prior) / (den + k))


class Builder:
    def __init__(self, con, parquet: Path, family: str = "T20"):
        fmts = ", ".join(f"'{f}'" for f in FAMILIES[family])
        d = (parquet / "deliveries" / "*.parquet").as_posix()
        mt = (parquet / "matches" / "*.parquet").as_posix()
        inn = (parquet / "innings" / "*.parquet").as_posix()
        at = parquet / "attributes" / "attributes.parquet"
        attrs = (f"SELECT player_id, batting_hand, bowling_kind FROM read_parquet('{at.as_posix()}')" if at.exists()
                 else "SELECT NULL::VARCHAR AS player_id, NULL::VARCHAR AS batting_hand, NULL::VARCHAR AS bowling_kind WHERE FALSE")
        self.kind = {p: ("pace" if k == "pace" else "spin" if k else None) for p, _, k in con.execute(attrs).fetchall()}
        self.hand = {p: h for p, h, _ in con.execute(attrs).fetchall()}
        con.execute(f"""CREATE OR REPLACE TEMP VIEW df AS
            SELECT d.*, coalesce(d.competition_id, 'intl-' || coalesce(d.team_type, '') || '-' || d.format) AS comp,
                   m.overs * d.balls_per_over AS inn_len,
                   CASE WHEN d."over" < 0.3 * m.overs THEN 'pp' WHEN d."over" < 0.8 * m.overs THEN 'mid' ELSE 'death' END AS ph,
                   CASE WHEN a.bowling_kind IS NULL THEN NULL WHEN a.bowling_kind = 'pace' THEN 'pace' ELSE 'spin' END AS kg,
                   CASE h.batting_hand WHEN 'left' THEN 'L' WHEN 'right' THEN 'R' END AS hd
            FROM read_parquet('{d}') d JOIN read_parquet('{mt}') m USING (match_id)
            LEFT JOIN ({attrs}) a ON a.player_id = d.bowler_id
            LEFT JOIN ({attrs}) h ON h.player_id = d.batter_id
            WHERE d.format IN ({fmts}) AND NOT d.is_super_over AND d.innings_no <= 2""")
        bf = "wides = 0"
        out = f"is_wicket AND player_out_id = batter_id AND wicket_kind NOT IN {NOT_OUT}"
        bat_q = f"""
            WITH o AS (SELECT match_id, innings_no, pid, min(k) AS k FROM (
                         SELECT match_id, innings_no, batter_id AS pid, min("over" * 1000 + ball_seq) * 2 AS k FROM df GROUP BY ALL
                         UNION ALL
                         SELECT match_id, innings_no, non_striker_id, min("over" * 1000 + ball_seq) * 2 + 1 FROM df GROUP BY ALL)
                       GROUP BY ALL),
                 s AS (SELECT match_id, innings_no, pid, row_number() OVER (PARTITION BY match_id, innings_no ORDER BY k) AS slot FROM o),
                 x AS (SELECT match_id, player_out_id AS pid, count(*) AS outs FROM df
                       WHERE is_wicket AND wicket_kind NOT IN {NOT_OUT} GROUP BY ALL)
            SELECT any_value(df.match_date), any_value(df.venue_id), any_value(df.comp), df.batter_id,
                   count(*) FILTER ({bf}), sum(runs_batter), coalesce(any_value(x.outs), 0),
                   count(*) FILTER (runs_batter = 4 AND NOT coalesce(non_boundary, FALSE)),
                   count(*) FILTER (runs_batter = 6 AND NOT coalesce(non_boundary, FALSE)),
                   count(*) FILTER ({bf} AND runs_batter = 0),
                   {", ".join(f"count(*) FILTER ({bf} AND ph = '{p}'), sum(runs_batter) FILTER (ph = '{p}'), count(*) FILTER ({out} AND ph = '{p}')" for p in PH)},
                   {", ".join(f"count(*) FILTER ({bf} AND kg = '{g}'), sum(runs_batter) FILTER (kg = '{g}'), count(*) FILTER ({out} AND kg = '{g}')" for g in ("pace", "spin"))},
                   any_value(s.slot), max(CASE WHEN df.innings_no = 2 THEN 1 ELSE 0 END), any_value(df.inn_len)
            FROM df LEFT JOIN s ON s.match_id = df.match_id AND s.innings_no = df.innings_no AND s.pid = df.batter_id
                    LEFT JOIN x ON x.match_id = df.match_id AND x.pid = df.batter_id
            WHERE df.batter_id IS NOT NULL GROUP BY df.match_id, df.batter_id"""
        self.bat = self._logs(con.execute(bat_q).fetchall(), BAT_COLS)
        w = f"wicket_kind IN {CREDITED}"
        bowl_q = f"""
            SELECT any_value(match_date), any_value(venue_id), any_value(comp), bowler_id,
                   count(*) FILTER (is_legal), sum(runs_batter + wides + noballs), count(*) FILTER ({w}),
                   count(*) FILTER (wicket_kind IN ('bowled', 'lbw')),
                   {", ".join(f"count(*) FILTER (is_legal AND ph = '{p}'), sum(runs_batter + wides + noballs) FILTER (ph = '{p}'), count(*) FILTER ({w} AND ph = '{p}')" for p in PH)},
                   {", ".join(f"count(*) FILTER (is_legal AND hd = '{h}'), sum(runs_batter + wides + noballs) FILTER (hd = '{h}'), count(*) FILTER ({w} AND hd = '{h}')" for h in ("L", "R"))},
                   any_value(inn_len)
            FROM df WHERE bowler_id IS NOT NULL GROUP BY match_id, bowler_id"""
        self.bowl = self._logs(con.execute(bowl_q).fetchall(), BOWL_COLS)
        # grounds: first-innings score, whether the side batting first won, wickets to pace and to spin
        kinds = {m: (pw, sw) for m, pw, sw in con.execute(f"""
            SELECT match_id, count(*) FILTER (kg = 'pace' AND {w}), count(*) FILTER (kg = 'spin' AND {w})
            FROM df GROUP BY 1""").fetchall()}
        ground = con.execute(f"""
            SELECT m.match_id, m.match_date, m.venue_id, i1.runs,
                   CASE WHEN m.winner = i1.team THEN 1.0 WHEN m.winner IN (m.team1, m.team2) THEN 0.0 END,
                   m.overs * m.balls_per_over
            FROM read_parquet('{mt}') m JOIN read_parquet('{inn}') i1 ON i1.match_id = m.match_id AND i1.innings_no = 1
                                                                       AND NOT i1.is_super_over
            WHERE m.format IN ({fmts}) AND m.venue_id IS NOT NULL AND i1.runs IS NOT NULL""").fetchall()
        g: dict[str, list] = {}
        for mid, dt, v, r1, bfw, length in ground:
            pw, sw = kinds.get(mid, (0, 0))
            g.setdefault(v, []).append((dt, v, None, [r1 / max(length or 120, 1) * 120, -1 if bfw is None else bfw,
                                                      1 if bfw is not None else 0, pw, sw]))
        self.ground = {v: Log(rows, ["first120", "bfw", "decided", "pace_w", "spin_w"]) for v, rows in g.items()}
        # format-wide priors (per ball and per innings, scaled to 120-ball innings)
        T = sum(lg.C[-1] for lg in self.bat.values())
        n_inn = sum(len(lg.dates) for lg in self.bat.values())
        ix = {c: i for i, c in enumerate(BAT_COLS)}
        self.p_sr = T[ix["runs"]] / max(T[ix["balls"]], 1)
        self.p_out = T[ix["outs"]] / max(T[ix["balls"]], 1)
        self.p_avg = T[ix["runs"]] / max(n_inn, 1)
        self.p_bpi = T[ix["balls"]] / max(n_inn, 1)
        B = sum(lg.C[-1] for lg in self.bowl.values())
        jx = {c: i for i, c in enumerate(BOWL_COLS)}
        n_bm = sum(len(lg.dates) for lg in self.bowl.values())
        self.p_econ = B[jx["runs"]] / max(B[jx["balls"]], 1)
        self.p_wr = B[jx["wkts"]] / max(B[jx["balls"]], 1)
        self.p_bpm = B[jx["balls"]] / max(n_bm, 1)
        self.p_first = float(np.mean([r[0] for lg in self.ground.values() for r in lg.X])) if self.ground else 150.0

    @staticmethod
    def _logs(rows, cols) -> dict[str, Log]:
        by: dict[str, list] = {}
        for r in rows:
            by.setdefault(r[3], []).append((r[0], r[1], r[2], [0 if v is None else v for v in r[4:]]))
        return {p: Log(v, cols) for p, v in by.items()}

    # ---------------- per player ----------------

    def _bat_strength(self, pid, day):
        lg = self.bat.get(pid)
        if lg is None:
            return self.p_avg, self.p_sr
        i = lg.upto(day)
        t = lg.total(i)
        return _rate(t[1], i, self.p_avg, 5), _rate(t[1], t[0], self.p_sr, 60)

    def _bowl_strength(self, pid, day):
        lg = self.bowl.get(pid)
        if lg is None:
            return 0.0, self.p_wr, self.p_econ
        i = lg.upto(day)
        t = lg.total(i)
        return (t[0] / i if i else 0.0, _rate(t[2], t[0], self.p_wr, 120), _rate(t[1], t[0], self.p_econ, 120))

    def context(self, day: date, venue: str | None, comp: str, xi: dict[str, list[str]], teams: list[str],
                bf: int, inn_len: int, female: bool, intl: bool) -> dict:
        """What every row of one match shares: each side's attack (pace/spin share, strength) and top order
        (left-hand share, strength), the ground's record."""
        ctx = {"day": day, "venue": venue, "comp": comp, "bf": bf, "len": inn_len / 120, "female": float(female),
               "intl": float(intl), "teams": teams, "side": {}}
        for t in teams:
            bowlers = [(p, *self._bowl_strength(p, day)) for p in xi[t]]
            bowlers = sorted(bowlers, key=lambda b: -b[1])[:6]
            wsum = sum(max(b[1], 1.0) for b in bowlers)
            pace = sum(max(b[1], 1.0) * (1.0 if self.kind.get(b[0]) == "pace" else 0.5 if self.kind.get(b[0]) is None else 0.0)
                       for b in bowlers) / wsum
            bats = [(p, *self._bat_strength(p, day)) for p in xi[t][:7]]
            left = np.mean([1.0 if self.hand.get(p) == "left" else 0.5 if self.hand.get(p) is None else 0.0 for p, *_ in bats])
            ctx["side"][t] = {"pace": pace, "bowl_wr": sum(max(b[1], 1.0) * b[2] for b in bowlers) / wsum,
                              "bowl_econ": sum(max(b[1], 1.0) * b[3] for b in bowlers) / wsum,
                              "bat_avg": float(np.mean([b[1] for b in bats])), "bat_sr": float(np.mean([b[2] for b in bats])),
                              "left": float(left), "exp": float(np.log1p(sum(self.bat[p].upto(day) for p in xi[t] if p in self.bat)))}
        gl = self.ground.get(venue)
        if gl is not None:
            i = gl.upto(day)
            t = gl.total(i)
            r = gl.total(i, 5)
            n5 = min(i, 5)
            ctx["ground_first"] = _rate(t[0], i, self.p_first, 5)
            ctx["ground_first5"] = _rate(r[0], n5, ctx["ground_first"], 2)
            decided = gl.col(i, "bfw")
            decided = decided[decided >= 0]
            ctx["ground_bfw"] = _rate(decided.sum(), len(decided), 0.5, 6)
            ctx["ground_pace_w"] = _rate(t[3], t[3] + t[4], 0.5, 20)
            ctx["ground_n"] = float(np.log1p(i))
        else:
            ctx.update(ground_first=self.p_first, ground_first5=self.p_first, ground_bfw=0.5, ground_pace_w=0.5, ground_n=0.0)
        return ctx

    def batter(self, pid: str, ctx: dict, team: str, slot: int) -> dict:
        day = ctx["day"]
        opp = ctx["side"][[t for t in ctx["teams"] if t != team][0]]
        lg = self.bat.get(pid)
        chasing = float((ctx["teams"].index(team) == 1) == (ctx["bf"] == 0))
        base = {"slot": slot, "slot_sq": slot * slot / 11, "chasing": chasing, "opp_pace": opp["pace"],
                "opp_bowl_wr": opp["bowl_wr"] * 100, "opp_bowl_econ": opp["bowl_econ"], "ground_first": ctx["ground_first"] / 100,
                "ground_first5": ctx["ground_first5"] / 100, "len": ctx["len"], "female": ctx["female"], "intl": ctx["intl"]}
        if lg is None or not lg.upto(day):
            return {**base, "known": 0.0, "n": 0.0, "avg": self.p_avg, "avg10": self.p_avg, "ewma": self.p_avg,
                    "sr": self.p_sr, "sr10": self.p_sr, "out": self.p_out * 100, "out10": self.p_out * 100, "bpi": self.p_bpi,
                    "bpi10": self.p_bpi, **{f"sr_{p}": self.p_sr for p in PH}, **{f"out_{p}": self.p_out * 100 for p in PH},
                    "sr_pace": self.p_sr, "sr_spin": self.p_sr, "out_pace": self.p_out * 100, "out_spin": self.p_out * 100,
                    "att_sr": self.p_sr, "att_out": self.p_out * 100, "usual_slot": slot, "slot_change": 0.0,
                    "chase_sr": 0.0, "chase_avg": 0.0, "venue_avg": self.p_avg, "venue_n": 0.0, "comp_avg": self.p_avg,
                    "conv30": 0.3, "hit30": 0.15, "rest": np.log1p(365), "m30d": 0.0, "exp": 0.0}
        i = lg.upto(day)
        ix = lg.ix
        t, r = lg.total(i), lg.total(i, 10)
        n, n10 = i, min(i, 10)
        runs = lg.col(i, "runs")
        w = 0.8 ** np.arange(min(n, 20))[::-1]
        sr = _rate(t[ix["runs"]], t[ix["balls"]], self.p_sr, 60)
        out = _rate(t[ix["outs"]], t[ix["balls"]], self.p_out, 60)
        avg = _rate(t[ix["runs"]], n, self.p_avg, 5)
        f = {**base, "known": 1.0, "n": float(np.log1p(n)), "avg": avg, "avg10": _rate(r[ix["runs"]], n10, avg, 3),
             "ewma": float((w * runs[-len(w):]).sum() / w.sum()), "sr": sr,
             "sr10": _rate(r[ix["runs"]], r[ix["balls"]], sr, 30), "out": out * 100,
             "out10": _rate(r[ix["outs"]], r[ix["balls"]], out, 30) * 100,
             "bpi": _rate(t[ix["balls"]], n, self.p_bpi, 5), "bpi10": _rate(r[ix["balls"]], n10, self.p_bpi, 3)}
        for p in PH:
            f[f"sr_{p}"] = _rate(t[ix[f"runs_{p}"]], t[ix[f"balls_{p}"]], sr, 40)
            f[f"out_{p}"] = _rate(t[ix[f"outs_{p}"]], t[ix[f"balls_{p}"]], out, 40) * 100
        for g in ("pace", "spin"):
            f[f"sr_{g}"] = _rate(t[ix[f"runs_{g}"]], t[ix[f"balls_{g}"]], sr, 40)
            f[f"out_{g}"] = _rate(t[ix[f"outs_{g}"]], t[ix[f"balls_{g}"]], out, 40) * 100
        f["att_sr"] = opp["pace"] * f["sr_pace"] + (1 - opp["pace"]) * f["sr_spin"]
        f["att_out"] = opp["pace"] * f["out_pace"] + (1 - opp["pace"]) * f["out_spin"]
        slots = lg.col(i, "slot", 10)
        slots = slots[slots > 0]
        f["usual_slot"] = float(np.median(slots)) if len(slots) else float(slot)
        f["slot_change"] = slot - f["usual_slot"]
        ch = lg.col(i, "chasing").astype(bool)
        bl, rn = lg.col(i, "balls"), runs
        f["chase_sr"] = _rate(rn[ch].sum(), bl[ch].sum(), sr, 60) - sr
        f["chase_avg"] = _rate(rn[ch].sum(), ch.sum(), avg, 5) - avg
        v = lg.where(i, "venue", ctx["venue"])
        nv = sum(1 for k in range(i) if lg.venue[k] == ctx["venue"])
        f["venue_avg"] = _rate(v[ix["runs"]], nv, avg, 4)
        f["venue_n"] = float(np.log1p(nv))
        cidx = [k for k in range(i) if lg.comp[k] == ctx["comp"]][-10:]
        f["comp_avg"] = _rate(runs[cidx].sum() if cidx else 0.0, len(cidx), avg, 4)
        started = runs >= 10
        f["conv30"] = _rate((runs[started] >= 30).sum(), started.sum(), 0.3, 5)
        f["hit30"] = _rate((runs >= 30).sum(), n, 0.15, 5)
        f["rest"] = float(np.log1p(min((day - lg.dates[i - 1]).days, 365)))
        f["m30d"] = float(sum(1 for d in lg.dates[:i] if (day - d).days <= 30))
        f["exp"] = float(np.log1p(t[ix["balls"]]))
        return f

    def bowler(self, pid: str, ctx: dict, team: str) -> dict:
        day = ctx["day"]
        opp = ctx["side"][[t for t in ctx["teams"] if t != team][0]]
        kind = self.kind.get(pid)
        own = ctx["ground_pace_w"] if kind == "pace" else 1 - ctx["ground_pace_w"] if kind == "spin" else 0.5
        base = {"opp_left": opp["left"], "opp_bat_avg": opp["bat_avg"], "opp_bat_sr": opp["bat_sr"],
                "spin": 1.0 if kind == "spin" else 0.0, "kind_known": float(kind is not None), "ground_own_w": own,
                "ground_first": ctx["ground_first"] / 100, "len": ctx["len"], "female": ctx["female"], "intl": ctx["intl"],
                "chasing_side": float((ctx["teams"].index(team) == 0) == (ctx["bf"] == 0))}
        lg = self.bowl.get(pid)
        if lg is None or not lg.upto(day):
            return {**base, "known": 0.0, "n": 0.0, "wpm": 0.0, "wpm10": 0.0, "ewma_w": 0.0, "wr": self.p_wr * 100,
                    "wr10": self.p_wr * 100, "econ": self.p_econ, "econ10": self.p_econ, "bpm": 0.0, "bpm10": 0.0,
                    "share_pp": 0.3, "share_death": 0.2, **{f"wr_{p}": self.p_wr * 100 for p in PH},
                    **{f"econ_{p}": self.p_econ for p in PH}, "wr_L": self.p_wr * 100, "wr_R": self.p_wr * 100,
                    "econ_L": self.p_econ, "econ_R": self.p_econ, "att_wr": self.p_wr * 100, "att_econ": self.p_econ,
                    "bl_share": 0.3, "venue_wr": self.p_wr * 100, "hit2": 0.15, "rest": np.log1p(365), "b14d": 0.0, "exp": 0.0}
        i = lg.upto(day)
        ix = lg.ix
        t, r = lg.total(i), lg.total(i, 10)
        n, n10 = i, min(i, 10)
        wk = lg.col(i, "wkts")
        w = 0.8 ** np.arange(min(n, 20))[::-1]
        wr = _rate(t[ix["wkts"]], t[ix["balls"]], self.p_wr, 120)
        econ = _rate(t[ix["runs"]], t[ix["balls"]], self.p_econ, 120)
        f = {**base, "known": 1.0, "n": float(np.log1p(n)), "wpm": t[ix["wkts"]] / n, "wpm10": r[ix["wkts"]] / n10,
             "ewma_w": float((w * wk[-len(w):]).sum() / w.sum()), "wr": wr * 100,
             "wr10": _rate(r[ix["wkts"]], r[ix["balls"]], wr, 60) * 100, "econ": econ,
             "econ10": _rate(r[ix["runs"]], r[ix["balls"]], econ, 60), "bpm": t[ix["balls"]] / n / 6,
             "bpm10": r[ix["balls"]] / n10 / 6,
             "share_pp": _rate(t[ix["balls_pp"]], t[ix["balls"]], 0.3, 30),
             "share_death": _rate(t[ix["balls_death"]], t[ix["balls"]], 0.2, 30)}
        for p in PH:
            f[f"wr_{p}"] = _rate(t[ix[f"wkts_{p}"]], t[ix[f"balls_{p}"]], wr, 60) * 100
            f[f"econ_{p}"] = _rate(t[ix[f"runs_{p}"]], t[ix[f"balls_{p}"]], econ, 60)
        for h in ("L", "R"):
            f[f"wr_{h}"] = _rate(t[ix[f"wkts_{h}"]], t[ix[f"balls_{h}"]], wr, 60) * 100
            f[f"econ_{h}"] = _rate(t[ix[f"runs_{h}"]], t[ix[f"balls_{h}"]], econ, 60)
        f["att_wr"] = opp["left"] * f["wr_L"] + (1 - opp["left"]) * f["wr_R"]
        f["att_econ"] = opp["left"] * f["econ_L"] + (1 - opp["left"]) * f["econ_R"]
        f["bl_share"] = _rate(t[ix["bl"]], t[ix["wkts"]], 0.3, 10)
        v = lg.where(i, "venue", ctx["venue"])
        f["venue_wr"] = _rate(v[ix["wkts"]], v[ix["balls"]], wr, 60) * 100
        f["hit2"] = _rate((wk >= 2).sum(), n, 0.15, 5)
        f["rest"] = float(np.log1p(min((day - lg.dates[i - 1]).days, 365)))
        f["b14d"] = float(sum(lg.X[k, ix["balls"]] for k in range(i) if (day - lg.dates[k]).days <= 14) / 6)
        f["exp"] = float(np.log1p(t[ix["balls"]]))
        return f

    def match(self, ctx: dict) -> dict:
        a, b = (ctx["side"][t] for t in ctx["teams"])
        sgn = 1.0 if ctx["bf"] == 0 else -1.0
        return {"bat_avg_d": a["bat_avg"] - b["bat_avg"], "bat_sr_d": (a["bat_sr"] - b["bat_sr"]) * 10,
                "bowl_wr_d": (a["bowl_wr"] - b["bowl_wr"]) * 100, "bowl_econ_d": a["bowl_econ"] - b["bowl_econ"],
                "exp_d": a["exp"] - b["exp"], "bf1": sgn, "ground_bfw": (ctx["ground_bfw"] - 0.5) * sgn,
                "ground_first": ctx["ground_first"] / 100, "len": ctx["len"], "female": ctx["female"], "intl": ctx["intl"]}
