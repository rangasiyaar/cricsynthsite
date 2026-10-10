"""Model-only analytics, computed on the user's machine from the published analytics kit (cricsim/kit.py).

A pure-Python port of cricsim/engine/insight.py: the same per-ball expectations (outcome probabilities for a batter
against a bowler in a stated situation) and the same read-outs. tests/test_insight_parity.py checks it against the
original. "Average" means the ball-weighted average player in the same format, so 1.00 = typical.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

PHASES = ("powerplay", "middle", "death")


def _r(x, nd=2):
    return None if x is None or not math.isfinite(x) else round(float(x), nd)


def _add(*vs):
    return [sum(t) for t in zip(*vs)]


class Kit:
    """context.json plus a player loader (store.player)."""

    def __init__(self, ctx: dict, load_player):
        self.c = ctx
        self.load = load_player
        o = ctx["outcomes"]
        self.K = len(o)
        self.DOT, self.FOUR, self.SIX, self.WKT = o.index("0"), o.index("4"), o.index("6"), o.index("W")
        self.WIDE, self.NOBALL, self.BYE = o.index("WD"), o.index("NB"), o.index("BYE")
        self.runs = ctx["bat_runs"]
        self.legal = ctx["legal"]
        self.kinds, self.hands = ctx["bowling_kinds"], ctx["hands"]

    # ── context ──
    @staticmethod
    def fam(fmt: str) -> int:
        return 1 if fmt == "OD" else 0

    def sit(self, fmt: str, gender: str, key: str) -> list[float]:
        return self.c["situations"][f"{fmt}:{gender}"][key]

    def F(self, fmt: str) -> dict:
        return self.c["families"][self.fam(fmt)]

    # ── players ──
    @staticmethod
    def stub(pid: str) -> dict:
        """A player the kit doesn't cover: simulated as the league-average newcomer, as the API does."""
        return {"id": pid, "name": pid, "known": False, "hand": "unknown", "bowling_kind": "unknown", "gender": None,
                "balls_faced": [0, 0], "balls_bowled": [0, 0]}

    def batter(self, p: dict | None, fmt: str):
        F = self.F(fmt)
        if p is None or p.get("known") is False:
            return F["avg_bat"], F["avg_bat_kind"], None
        return p["bat"][self.fam(fmt)], p["bat_kind"], self.hands.index(p["hand"])

    def bowler(self, p: dict | None, fmt: str):
        F = self.F(fmt)
        if p is None or p.get("known") is False:
            return F["avg_bowl"], F["avg_bowl_hand"], None
        return p["bowl"][self.fam(fmt)], p["bowl_hand"], self.kinds.index(p["bowling_kind"])

    def probs(self, fmt: str, sit, batter: dict | None = None, bowler: dict | None = None,
              kind: int | None = None, hand: int | None = None) -> list[float]:
        """Outcome probabilities, mixing over bowling types / batting hands when they're not fixed (Ctx.probs)."""
        F = self.F(fmt)
        b, bk, bhand = self.batter(batter, fmt)
        w, wh, wkind = self.bowler(bowler, fmt)
        hands = [(hand if hand is not None else bhand, 1.0)] if (hand is not None or bhand) else \
            [(h, s) for h, s in enumerate(F["hand_share"]) if s > 0]
        kinds = [(kind if kind is not None else wkind, 1.0)] if (kind is not None or wkind) else \
            [(k, s) for k, s in enumerate(F["kind_share"]) if s > 0]
        out = [0.0] * self.K
        for h, hs in hands:
            for k, ks in kinds:
                L = _add(sit, b, w, bk[k], wh[h], F["hand_kind"][h][k])
                mx = max(L)
                e = [math.exp(x - mx) for x in L]
                s = sum(e)
                for i in range(self.K):
                    out[i] += hs * ks * e[i] / s
        t = sum(out)
        return [x / t for x in out]

    def batting(self, q) -> dict:
        faced = sum(x for x, lg in zip(q, self.legal) if lg)
        runs = sum(x * r for x, r in zip(q, self.runs))
        w = q[self.WKT]
        return {"strike_rate": _r(100 * runs / faced, 1), "balls_per_dismissal": _r(faced / w, 1) if w else None,
                "runs_per_dismissal": _r(runs / w, 1) if w else None, "dot_pct": _r(100 * q[self.DOT] / faced, 1),
                "boundary_pct": _r(100 * (q[self.FOUR] + q[self.SIX]) / faced, 1),
                "six_pct": _r(100 * q[self.SIX] / faced, 2)}

    def bowling(self, q, fmt: str) -> dict:
        F = self.F(fmt)
        legal = sum(x for x, lg in zip(q, self.legal) if lg)
        conceded = (sum(x * r for x, r in zip(q, self.runs)) + q[self.WIDE] * (1 + F["wide"]) + q[self.NOBALL]
                    + q[self.BYE] * F["bye"])
        w = q[self.WKT]
        return {"economy": _r(6 * conceded / legal, 2), "balls_per_wicket": _r(legal / w, 1) if w else None,
                "dot_pct": _r(100 * q[self.DOT] / legal, 1),
                "boundary_pct": _r(100 * (q[self.FOUR] + q[self.SIX]) / legal, 1),
                "extras_per_over": _r(6 * (q[self.WIDE] + q[self.NOBALL]) / legal, 2)}

    # ── read-outs (same names and shapes as cricsim.engine.insight) ──
    @staticmethod
    def who(p: dict) -> dict:
        return {"id": p["id"], "name": p["name"], "known": p.get("known", True), "hand": p["hand"], "bowling_kind": p["bowling_kind"],
                "gender": p.get("gender")}

    @staticmethod
    def _index(me: dict, avg: dict) -> dict:
        return {k: (_r(me[k] / avg[k], 2) if me.get(k) and avg.get(k) else None) for k in me}

    def experience(self, p: dict, fam: int) -> dict:
        balls = p["balls_faced"][fam] + p["balls_bowled"][fam]
        return {"balls_faced": _r(p["balls_faced"][fam], 0), "balls_bowled": _r(p["balls_bowled"][fam], 0),
                "confidence": "high" if balls >= 1500 else "medium" if balls >= 400 else "low"}

    def phase_profile(self, p: dict, fmt: str = "T20", gender: str = "male") -> dict:
        out = {"player": self.who(p), "format": fmt, "batting": {}, "bowling": {}}
        for ph in PHASES:
            s = self.sit(fmt, gender, f"phase:{ph}")
            me, avg = self.batting(self.probs(fmt, s, batter=p)), self.batting(self.probs(fmt, s))
            out["batting"][ph] = {**me, "v_average": self._index(me, avg)}
            me, avg = self.bowling(self.probs(fmt, s, bowler=p), fmt), self.bowling(self.probs(fmt, s), fmt)
            out["bowling"][ph] = {**me, "v_average": self._index(me, avg)}
        out["experience"] = self.experience(p, self.fam(fmt))
        return out

    def vs_bowling(self, p: dict, fmt: str = "T20", gender: str = "male", phase: str = "middle") -> dict:
        s = self.sit(fmt, gender, f"phase:{phase}")
        rows = []
        for k, name in enumerate(self.kinds):
            if k == 0 or name == "slow":
                continue
            me, avg = self.batting(self.probs(fmt, s, batter=p, kind=k)), self.batting(self.probs(fmt, s, kind=k))
            rows.append({"bowling_kind": name, **me, "v_average_batter": self._index(me, avg)})
        best = max(rows, key=lambda r: (r["v_average_batter"]["balls_per_dismissal"] or 0))
        worst = min(rows, key=lambda r: (r["v_average_batter"]["balls_per_dismissal"] or 9))
        return {"player": self.who(p), "format": fmt, "phase": phase, "by_bowling_kind": rows,
                "strongest_against": best["bowling_kind"], "weakest_against": worst["bowling_kind"],
                "experience": self.experience(p, self.fam(fmt))}

    def vs_batting_hand(self, p: dict, fmt: str = "T20", gender: str = "male", phase: str = "middle") -> dict:
        s = self.sit(fmt, gender, f"phase:{phase}")
        rows = []
        for h in (1, 2):
            me = self.bowling(self.probs(fmt, s, bowler=p, hand=h), fmt)
            avg = self.bowling(self.probs(fmt, s, hand=h), fmt)
            rows.append({"batting_hand": self.hands[h], **me, "v_average_bowler": self._index(me, avg)})
        return {"player": self.who(p), "format": fmt, "phase": phase, "by_batting_hand": rows,
                "experience": self.experience(p, self.fam(fmt))}

    def situations(self, p: dict, fmt: str = "T20", gender: str = "male") -> dict:
        def rows(prefix, labels, key):
            out = []
            for lab in labels:
                s = self.sit(fmt, gender, f"{prefix}:{lab}")
                me, avg = self.batting(self.probs(fmt, s, batter=p)), self.batting(self.probs(fmt, s))
                out.append({key: lab, **me, "v_average": self._index(me, avg)})
            return out
        return {"player": self.who(p), "format": fmt, "at_the_crease": rows("crease", self.c["crease"], "stage"),
                "chasing": rows("chase", self.c["chase"], "situation"), "experience": self.experience(p, self.fam(fmt))}

    def format_split(self, p: dict, gender: str = "male") -> dict:
        out = {"player": self.who(p), "formats": {}}
        for fmt in ("T20", "OD"):
            s = self.sit(fmt, gender, "phase:middle")
            bm, ba = self.batting(self.probs(fmt, s, batter=p)), self.batting(self.probs(fmt, s))
            wm, wa = self.bowling(self.probs(fmt, s, bowler=p), fmt), self.bowling(self.probs(fmt, s), fmt)
            out["formats"][fmt] = {"batting": {**bm, "v_average": self._index(bm, ba)},
                                   "bowling": {**wm, "v_average": self._index(wm, wa)},
                                   "experience": self.experience(p, self.fam(fmt))}
        return out

    def role(self, p: dict, fmt: str = "T20") -> dict:
        fam = self.fam(fmt)
        use = (p.get("usage") or [[0] * 10, [0] * 10])[fam]
        pp, death = (3, 8) if fam == 0 else (1, 8)
        by_phase = {"powerplay": _r(sum(use[:pp]), 2), "middle": _r(sum(use[pp:death]), 2), "death": _r(sum(use[death:]), 2)}
        total = float(sum(use))
        pos = float((p.get("bat_pos") or [0, 0])[fam])
        batting_role = ("opener" if pos and pos <= 2.5 else "top order" if pos <= 4.5 else "middle order"
                        if pos <= 7.5 else "lower order") if pos else None
        bowling_role = None
        if total >= 0.5:
            top = max(by_phase, key=lambda k: by_phase[k] or 0)
            bowling_role = f"{top} specialist" if (by_phase[top] or 0) / total >= 0.5 else "all phases"
        last = p.get("last_played") or 0
        return {"player": self.who(p), "format": fmt,
                "batting": {"average_position": _r(pos, 1) if pos else None, "role": batting_role},
                "bowling": {"overs_per_match": _r(total, 2), "overs_by_phase": by_phase, "role": bowling_role,
                            "by_innings_decile": [_r(x, 2) for x in use]},
                "matches_weighted": _r((p.get("appearances") or [0, 0])[fam], 1) if p.get("appearances") else None,
                "last_played": str(date(1970, 1, 1) + timedelta(days=last)) if last else None,
                "experience": self.experience(p, fam)}

    def rating(self, p: dict, fmt: str = "T20") -> dict:
        """Where the rating comes from (summary.profile): multipliers v an average player, 1.0 = average."""
        fam = self.fam(fmt)
        bat, bowl = p["bat"][fam], p["bowl"][fam]
        m = lambda v, k: _r(math.exp(v[k] - v[self.DOT]), 2)  # noqa: E731
        return {**self.who(p), "profile": {
            "balls_faced": {"short": _r(p["balls_faced"][0], 0), "od": _r(p["balls_faced"][1], 0)},
            "balls_bowled": {"short": _r(p["balls_bowled"][0], 0), "od": _r(p["balls_bowled"][1], 0)},
            "in_this_format": _r(p["balls_faced"][fam] + p["balls_bowled"][fam], 0),
            "batting": {"wicket": m(bat, self.WKT), "four": m(bat, self.FOUR), "six": m(bat, self.SIX)},
            "bowling": {"wicket": m(bowl, self.WKT), "four": m(bowl, self.FOUR), "six": m(bowl, self.SIX),
                        "wide": m(bowl, self.WIDE)},
            "hand": p["hand"], "bowling_kind": p["bowling_kind"]}}

    def compare(self, ps: list[dict], fmt: str = "T20", gender: str = "male") -> dict:
        rows = []
        for p in ps:
            r = {"player": self.who(p), "batting": {}, "bowling": {}, "experience": self.experience(p, self.fam(fmt))}
            for ph in PHASES:
                s = self.sit(fmt, gender, f"phase:{ph}")
                r["batting"][ph] = self.batting(self.probs(fmt, s, batter=p))
                r["bowling"][ph] = self.bowling(self.probs(fmt, s, bowler=p), fmt)
            rows.append(r)
        s = self.sit(fmt, gender, "phase:middle")
        return {"format": fmt, "players": rows,
                "average": {"batting": self.batting(self.probs(fmt, s)), "bowling": self.bowling(self.probs(fmt, s), fmt)}}

    def _edge(self, fmt, s, bat, bowl) -> dict:
        me, base = self.batting(self.probs(fmt, s, batter=bat, bowler=bowl)), self.batting(self.probs(fmt, s))
        return {"strike_rate": me["strike_rate"], "balls_per_dismissal": me["balls_per_dismissal"],
                "dot_pct": me["dot_pct"], "boundary_pct": me["boundary_pct"],
                "wicket_edge": _r((base["balls_per_dismissal"] or 0) / (me["balls_per_dismissal"] or 1), 2),
                "scoring_edge": _r((me["strike_rate"] or 0) / (base["strike_rate"] or 1), 2)}

    def matchup(self, bat: dict, bowl: dict, fmt: str = "T20", gender: str = "male", phase: str = "middle") -> dict:
        s = self.sit(fmt, gender, f"phase:{phase}")
        q, avg = self.probs(fmt, s, batter=bat, bowler=bowl), self.probs(fmt, s)

        def stats(x):
            legal = sum(v for v, lg in zip(x, self.legal) if lg)
            runs = sum(v * r for v, r in zip(x, self.runs))
            w = x[self.WKT] / legal
            return {"dismissal_per_ball": round(w, 4), "balls_per_dismissal": round(1 / w, 1) if w else None,
                    "strike_rate": round(100 * runs / legal, 1), "dot_pct": round(100 * x[self.DOT] / legal, 1),
                    "boundary_pct": round(100 * (x[self.FOUR] + x[self.SIX]) / legal, 1),
                    "six_pct": round(100 * x[self.SIX] / legal, 2)}
        me, base = stats(q), stats(avg)
        return {"batter": self.who(bat), "bowler": self.who(bowl), "format": fmt, "phase": phase,
                "per_ball": {o: round(v, 4) for o, v in zip(self.c["outcomes"], q)},
                "matchup": me, "average_pairing": base,
                "edge": {"wicket": round(me["dismissal_per_ball"] / base["dismissal_per_ball"], 2),
                         "strike_rate": round(me["strike_rate"] / base["strike_rate"], 2)}}

    def matchup_grid(self, bats: list[dict], bowls: list[dict], fmt="T20", gender="male", phase="middle") -> dict:
        s = self.sit(fmt, gender, f"phase:{phase}")
        return {"format": fmt, "phase": phase, "batters": [self.who(b) for b in bats],
                "bowlers": [self.who(w) for w in bowls],
                "cells": [{"batter": b["id"], "bowler": w["id"], **self._edge(fmt, s, b, w)} for b in bats for w in bowls],
                "note": "wicket_edge > 1: the bowler is likelier than an average pairing to take the wicket; "
                        "scoring_edge > 1: the batter scores faster than against an average bowler."}

    def counter(self, bat: dict, cands: list[dict], fmt="T20", gender="male", phase="middle") -> dict:
        s = self.sit(fmt, gender, f"phase:{phase}")
        wv = self.c["wicket_runs"]["od" if self.fam(fmt) else "short"]
        rows = []
        for w in cands:
            e = self._edge(fmt, s, bat, w)
            q = self.probs(fmt, s, batter=bat, bowler=w)
            legal = sum(v for v, lg in zip(q, self.legal) if lg)
            value = 6 * (sum(v * r for v, r in zip(q, self.runs)) - wv * q[self.WKT]) / legal
            rows.append({"bowler": self.who(w), **e, "net_runs_per_over": _r(value, 2)})
        rows.sort(key=lambda r: r["net_runs_per_over"])
        return {"batter": self.who(bat), "format": fmt, "phase": phase, "ranked": rows,
                "best_option": rows[0]["bowler"] if rows else None}

    def team_profile(self, xi: list[dict], fmt: str = "T20", gender: str = "male",
                     bowlers: list[dict] | None = None) -> dict:
        fam = self.fam(fmt)
        s_mid = self.sit(fmt, gender, "phase:middle")
        avg_b = self.batting(self.probs(fmt, s_mid))
        spin, pace = self.c["spin_kinds"], self.c["pace_kinds"]
        mean = lambda xs: sum(xs) / len(xs)  # noqa: E731
        bpd = lambda **kw: self.batting(self.probs(fmt, s_mid, **kw))["balls_per_dismissal"] or 0  # noqa: E731
        sa, pv = mean([bpd(kind=k) for k in spin]), mean([bpd(kind=k) for k in pace])
        bat_rows, spin_idx, pace_idx = [], [], []
        for pos, p in enumerate(xi, 1):
            me = self.batting(self.probs(fmt, s_mid, batter=p))
            if pos <= 7:
                sp, pa = mean([bpd(batter=p, kind=k) for k in spin]), mean([bpd(batter=p, kind=k) for k in pace])
                spin_idx.append(sp / sa if sa else 1)
                pace_idx.append(pa / pv if pv else 1)
            bat_rows.append({"position": pos, **self.who(p), **me, "v_average": self._index(me, avg_b)})
        overs = lambda p: sum((p.get("usage") or [[0] * 10] * 2)[fam])  # noqa: E731
        pool = bowlers or [p for p in xi if overs(p) >= 0.5]
        bowl_rows = []
        for p in pool:
            r = {**self.who(p), "overs_per_match": _r(overs(p), 2)}
            for ph in PHASES:
                r[ph] = self.bowling(self.probs(fmt, self.sit(fmt, gender, f"phase:{ph}"), bowler=p), fmt)
            bowl_rows.append(r)
        kinds = [p["bowling_kind"] for p in pool]
        top7 = [r for r in bat_rows if r["position"] <= 7]
        spin_names = {self.kinds[i] for i in spin}
        return {"format": fmt, "batting": bat_rows, "bowling": bowl_rows,
                "summary": {"top7_strike_rate": _r(mean([r["strike_rate"] or 0 for r in top7]), 1),
                            "top7_balls_per_dismissal": _r(mean([r["balls_per_dismissal"] or 0 for r in top7]), 1),
                            "left_handers_top7": [p["hand"] for p in xi[:7]].count("left"),
                            "spin_options": sum(k in spin_names for k in kinds),
                            "pace_options": sum(k in ("pace_right", "pace_left") for k in kinds),
                            "survival_v_spin": _r(mean(spin_idx), 2) if spin_idx else None,
                            "survival_v_pace": _r(mean(pace_idx), 2) if pace_idx else None,
                            "bowling_depth": len(pool)},
                "note": "survival_v_spin / v_pace: top-seven balls per dismissal against that bowling type relative "
                        "to average batters (above 1 = harder to dismiss)."}
