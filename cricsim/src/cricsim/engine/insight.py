"""Model-derived analytics: per-ball expectations for players, venues, competitions and eras.

Everything here reads the fitted ball-outcome model directly (no match simulation), so answers are
instant and describe *expected* behaviour in a stated situation, not historical averages:

    phase_profile        batting / bowling by powerplay, middle and death overs
    vs_bowling           a batter against each bowling type
    vs_batting_hand      a bowler against right- and left-handers
    situations           a batter new at the crease, set, and chasing at different required rates
    format_split         short-format v one-day
    role                 batting position, overs per match by phase, experience
    similar              nearest players by playing style
    compare / rankings   side by side, and model leaderboards
    matchup_grid / counter
    venue_profile / comp_profile / scoring_trend / team_profile

"Average" always means the ball-weighted average player in the same format, so 1.00 = typical.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from cricsim.engine import states as S
from cricsim.engine.model import ERA_START, FORMAT_LIST, GENDERS, MAX_OVERS, N_DECILES, N_ERA, SITUATION, Model, era_vector

PHASES = {"powerplay": (0.15, 1), "middle": (0.5, 3), "death": (0.9, 5)}     # point in innings, typical wickets down
NK, NH = len(S.BOWLING_KINDS), len(S.HANDS)
RUNS = S.BAT_RUNS.astype(np.float64)
WICKET_RUNS = {"short": 8.0, "od": 20.0}       # rough run value of a wicket, for one-number impact ratings
SPIN_KINDS = [S.BOWLING_KINDS.index(k) for k in ("off_spin", "leg_spin", "left_arm_orthodox", "left_arm_wrist")]
PACE_KINDS = [S.BOWLING_KINDS.index(k) for k in ("pace_right", "pace_left")]


def _fam(fmt: str) -> int:
    return 1 if fmt == "OD" else 0


def _r(x, nd=2):
    return None if x is None or not np.isfinite(x) else round(float(x), nd)


class Ctx:
    """Per-model cache of player factor rows and ball-weighted averages for one format family."""

    def __init__(self, model: Model, fmt: str):
        f = model.factors
        P = len(model.players)
        self.model, self.fmt, self.fam = model, fmt, _fam(fmt)
        fam = self.fam
        self.bat = f["bat"].astype(np.float64) + f["bat_fmt"].reshape(P, 2, S.K)[:, fam]
        self.bowl = f["bowl"].astype(np.float64) + f["bowl_fmt"].reshape(P, 2, S.K)[:, fam]
        self.bat_kind = f["bat_kind"].reshape(P, NK, S.K).astype(np.float64)
        self.bowl_hand = f["bowl_hand"].reshape(P, NH, S.K).astype(np.float64)
        wb = model.balls_faced[:, fam].astype(np.float64).copy()
        ww = model.balls_bowled[:, fam].astype(np.float64).copy()
        wb[0] = ww[0] = 0
        self.w_bat, self.w_bowl = wb, ww
        self.avg_bat = (wb[:, None] * self.bat).sum(0) / max(wb.sum(), 1)
        self.avg_bowl = (ww[:, None] * self.bowl).sum(0) / max(ww.sum(), 1)
        self.avg_bat_kind = (wb[:, None, None] * self.bat_kind).sum(0) / max(wb.sum(), 1)
        self.avg_bowl_hand = (ww[:, None, None] * self.bowl_hand).sum(0) / max(ww.sum(), 1)
        # how often each bowling type / batting hand is met, ball-weighted
        kshare = np.bincount(model.kind.astype(np.int64), weights=ww, minlength=NK)
        kshare[0] = 0
        if kshare.sum() <= 0:                                 # no data in this family: assume an even mix
            kshare[1:7] = 1
        self.kind_share = kshare / kshare.sum()
        hshare = np.bincount(model.hand.astype(np.int64), weights=wb, minlength=NH)
        hshare[0] = 0
        if hshare.sum() <= 0:
            hshare[1:] = 1
        self.hand_share = hshare / hshare.sum()
        self.hand_kind = f["hand_kind"].reshape(2, NH * NK, S.K)[fam].reshape(NH, NK, S.K).astype(np.float64)
        self.wide = model.wide_runs[fam].astype(np.float64) @ np.arange(1, 6)          # extra runs per wide
        self.bye = model.bye_runs[fam].astype(np.float64) @ np.arange(1, 5)

    # situation vector for an average day
    def situation(self, gender: str = "male", phase: str = "middle", inn0: int = 0, wickets: int | None = None,
                  balls_faced: int = 12, chase: int = 0, venue: str | None = None, comp: str | None = None,
                  era: np.ndarray | None = None) -> np.ndarray:
        m, f = self.model, self.model.factors
        rules = S.FORMAT_RULES[self.fmt]
        at, typical_w = PHASES[phase]
        over = min(int(at * rules["overs"]), rules["overs"] - 1)
        w = typical_w if wickets is None else wickets
        base = f["base"].reshape(len(FORMAT_LIST), 2, 2, MAX_OVERS, 10, S.K)[
            FORMAT_LIST.index(self.fmt), GENDERS.index(gender), inn0, over, min(w, 9)].astype(np.float64)
        sit = {name: f[name].reshape(2, n, S.K)[self.fam] for name, n in SITUATION.items()}
        return (base + (era_vector(m, self.fam) if era is None else era)
                + sit["set"][S.set_bucket(balls_faced)] + sit["streak"][2] + sit["dots"][0]
                + sit["mile"][S.milestone_bucket(15)] + sit["spell"][0] + sit["freehit"][0] + sit["chase"][chase]
                + f["venue"][m.venue(venue)] + f["comp"][m.comp(comp)])

    def batter(self, pid: str | None):
        if pid is None or not self.model.knows(pid):
            return self.avg_bat, self.avg_bat_kind, None
        i = self.model.pid(pid)
        return self.bat[i], self.bat_kind[i], int(self.model.hand[i])

    def bowler(self, pid: str | None):
        if pid is None or not self.model.knows(pid):
            return self.avg_bowl, self.avg_bowl_hand, None
        i = self.model.pid(pid)
        return self.bowl[i], self.bowl_hand[i], int(self.model.kind[i])

    def probs(self, sit: np.ndarray, batter: str | None = None, bowler: str | None = None,
              kind: int | None = None, hand: int | None = None) -> np.ndarray:
        """Outcome probabilities, mixing over bowling types / batting hands when they're not fixed."""
        b, bk, bhand = self.batter(batter)
        w, wh, wkind = self.bowler(bowler)
        hands = [(hand if hand is not None else bhand, 1.0)] if (hand is not None or bhand) else \
            [(h, s) for h, s in enumerate(self.hand_share) if s > 0]
        kinds = [(kind if kind is not None else wkind, 1.0)] if (kind is not None or wkind) else \
            [(k, s) for k, s in enumerate(self.kind_share) if s > 0]
        out = np.zeros(S.K)
        for h, hs in hands:
            for k, ks in kinds:
                L = sit + b + w + bk[k] + wh[h] + self.hand_kind[h, k]
                p = np.exp(L - L.max())
                out += hs * ks * p / p.sum()
        return out / out.sum()

    def batting(self, q: np.ndarray) -> dict:
        faced = q[S.LEGAL].sum()                          # byes count as balls faced
        runs = float((q * RUNS).sum())
        w = float(q[S.WKT])
        return {"strike_rate": _r(100 * runs / faced, 1), "balls_per_dismissal": _r(faced / w, 1) if w else None,
                "runs_per_dismissal": _r(runs / w, 1) if w else None, "dot_pct": _r(100 * q[S.DOT] / faced, 1),
                "boundary_pct": _r(100 * (q[S.FOUR] + q[S.SIX]) / faced, 1), "six_pct": _r(100 * q[S.SIX] / faced, 2)}

    def bowling(self, q: np.ndarray) -> dict:
        legal = q[S.LEGAL].sum()
        conceded = float((q * RUNS).sum() + q[S.WIDE] * (1 + self.wide) + q[S.NOBALL] + q[S.BYE] * self.bye)
        w = float(q[S.WKT])
        return {"economy": _r(6 * conceded / legal, 2), "balls_per_wicket": _r(legal / w, 1) if w else None,
                "dot_pct": _r(100 * q[S.DOT] / legal, 1), "boundary_pct": _r(100 * (q[S.FOUR] + q[S.SIX]) / legal, 1),
                "extras_per_over": _r(6 * (q[S.WIDE] + q[S.NOBALL]) / legal, 2)}


_CACHE: dict[tuple[int, str], Ctx] = {}


def ctx(model: Model, fmt: str) -> Ctx:
    key = (id(model), "od" if fmt == "OD" else fmt)
    if key not in _CACHE:
        _CACHE[key] = Ctx(model, fmt)
    return _CACHE[key]


def who(model: Model, pid: str) -> dict:
    i = model.pid(pid)
    g = model.meta.get("catalog", {}).get("player_gender", "")
    return {"id": pid, "name": model.names[i] if model.knows(pid) else pid, "known": model.knows(pid),
            "hand": S.HANDS[model.hand[i]], "bowling_kind": S.BOWLING_KINDS[model.kind[i]],
            "gender": {"m": "male", "f": "female"}.get(g[i] if i < len(g) else "", None)}


def _index(me: dict, avg: dict) -> dict:
    return {k: (_r(me[k] / avg[k], 2) if me.get(k) and avg.get(k) else None) for k in me}


def _experience(model: Model, pid: str, fam: int) -> dict:
    i = model.pid(pid)
    return {"balls_faced": _r(model.balls_faced[i, fam], 0), "balls_bowled": _r(model.balls_bowled[i, fam], 0),
            "confidence": _confidence(float(model.balls_faced[i, fam] + model.balls_bowled[i, fam]))}


def _confidence(balls: float) -> str:
    return "high" if balls >= 1500 else "medium" if balls >= 400 else "low"


# ── players ────────────────────────────────────────────────────────────────────

def phase_profile(model: Model, pid: str, fmt: str = "T20", gender: str = "male") -> dict:
    c = ctx(model, fmt)
    out = {"player": who(model, pid), "format": fmt, "batting": {}, "bowling": {}}
    for ph in PHASES:
        sit = c.situation(gender, ph)
        me, avg = c.batting(c.probs(sit, batter=pid)), c.batting(c.probs(sit))
        out["batting"][ph] = {**me, "v_average": _index(me, avg)}
        me, avg = c.bowling(c.probs(sit, bowler=pid)), c.bowling(c.probs(sit))
        out["bowling"][ph] = {**me, "v_average": _index(me, avg)}
    out["experience"] = _experience(model, pid, c.fam)
    return out


def vs_bowling(model: Model, pid: str, fmt: str = "T20", gender: str = "male", phase: str = "middle") -> dict:
    c = ctx(model, fmt)
    sit = c.situation(gender, phase)
    rows = []
    for k, name in enumerate(S.BOWLING_KINDS):
        if k == 0 or name == "slow":
            continue
        me, avg = c.batting(c.probs(sit, batter=pid, kind=k)), c.batting(c.probs(sit, kind=k))
        rows.append({"bowling_kind": name, **me, "v_average_batter": _index(me, avg)})
    best = max(rows, key=lambda r: (r["v_average_batter"]["balls_per_dismissal"] or 0))
    worst = min(rows, key=lambda r: (r["v_average_batter"]["balls_per_dismissal"] or 9))
    return {"player": who(model, pid), "format": fmt, "phase": phase, "by_bowling_kind": rows,
            "strongest_against": best["bowling_kind"], "weakest_against": worst["bowling_kind"],
            "experience": _experience(model, pid, c.fam)}


def vs_batting_hand(model: Model, pid: str, fmt: str = "T20", gender: str = "male", phase: str = "middle") -> dict:
    c = ctx(model, fmt)
    sit = c.situation(gender, phase)
    rows = []
    for h in (1, 2):
        me, avg = c.bowling(c.probs(sit, bowler=pid, hand=h)), c.bowling(c.probs(sit, hand=h))
        rows.append({"batting_hand": S.HANDS[h], **me, "v_average_bowler": _index(me, avg)})
    return {"player": who(model, pid), "format": fmt, "phase": phase, "by_batting_hand": rows,
            "experience": _experience(model, pid, c.fam)}


def situations(model: Model, pid: str, fmt: str = "T20", gender: str = "male") -> dict:
    c = ctx(model, fmt)
    crease = []
    for label, bf in (("first_ball", 0), ("new_1_5", 3), ("settling_6_20", 12), ("set_21_35", 28), ("set_36_plus", 40)):
        sit = c.situation(gender, "middle", balls_faced=bf)
        me, avg = c.batting(c.probs(sit, batter=pid)), c.batting(c.probs(sit))
        crease.append({"stage": label, **me, "v_average": _index(me, avg)})
    chase = []
    for label, b in (("first_innings", 0), ("rrr_under_6", 1), ("rrr_6_8", 2), ("rrr_8_10", 3), ("rrr_10_12", 4),
                     ("rrr_12_15", 5), ("rrr_15_plus", 6)):
        sit = c.situation(gender, "middle", inn0=1 if b else 0, chase=b)
        me, avg = c.batting(c.probs(sit, batter=pid)), c.batting(c.probs(sit))
        chase.append({"situation": label, **me, "v_average": _index(me, avg)})
    return {"player": who(model, pid), "format": fmt, "at_the_crease": crease, "chasing": chase,
            "experience": _experience(model, pid, c.fam)}


def format_split(model: Model, pid: str, gender: str = "male") -> dict:
    out = {"player": who(model, pid), "formats": {}}
    for fmt in ("T20", "OD"):
        c = ctx(model, fmt)
        sit = c.situation(gender, "middle")
        out["formats"][fmt] = {"batting": {**c.batting(c.probs(sit, batter=pid)),
                                           "v_average": _index(c.batting(c.probs(sit, batter=pid)), c.batting(c.probs(sit)))},
                               "bowling": {**c.bowling(c.probs(sit, bowler=pid)),
                                           "v_average": _index(c.bowling(c.probs(sit, bowler=pid)), c.bowling(c.probs(sit)))},
                               "experience": _experience(model, pid, c.fam)}
    return out


def role(model: Model, pid: str, fmt: str = "T20") -> dict:
    i, fam = model.pid(pid), _fam(fmt)
    use = model.usage[i, fam].astype(np.float64)                       # overs per match by innings decile
    pp, death = (3, 8) if fam == 0 else (1, 8)                         # deciles: T20 overs 1-6 / 17-20; OD 1-10 / 41-50
    by_phase = {"powerplay": _r(use[:pp].sum(), 2), "middle": _r(use[pp:death].sum(), 2), "death": _r(use[death:].sum(), 2)}
    total = float(use.sum())
    pos = float(model.bat_pos[i, fam]) if model.bat_pos is not None else 0
    batting_role = ("opener" if pos and pos <= 2.5 else "top order" if pos <= 4.5 else "middle order" if pos <= 7.5
                    else "lower order") if pos else None
    bowling_role = None
    if total >= 0.5:
        top = max(by_phase, key=lambda k: by_phase[k] or 0)
        bowling_role = f"{top} specialist" if (by_phase[top] or 0) / total >= 0.5 else "all phases"
    last = int(model.last_played[i]) if model.last_played is not None else 0
    return {"player": who(model, pid), "format": fmt,
            "batting": {"average_position": _r(pos, 1) if pos else None, "role": batting_role},
            "bowling": {"overs_per_match": _r(total, 2), "overs_by_phase": by_phase, "role": bowling_role,
                        "by_innings_decile": [_r(x, 2) for x in use]},
            "matches_weighted": _r(model.appearances[i, fam], 1) if model.appearances is not None else None,
            "last_played": str(date(1970, 1, 1) + timedelta(days=last)) if last else None,
            "experience": _experience(model, pid, fam)}


def _features(c: Ctx, idx: np.ndarray, gender: str, side: str) -> np.ndarray:
    """Style fingerprint: per-ball outcome log-rates by phase and bowling type (or batting hand)."""
    feats = []
    kind = np.maximum(c.model.kind[idx].astype(np.int64), 1)
    for ph in PHASES:
        sit = c.situation(gender, ph)
        for k in (PACE_KINDS + SPIN_KINDS if side == "batting" else [1, 2]):
            if side == "batting":
                L = sit + c.bat[idx] + c.avg_bowl + c.bat_kind[idx, k] + c.avg_bowl_hand[1] + c.hand_kind[1, k]
            else:                                                       # k is the batting hand here
                L = sit + c.avg_bat + c.bowl[idx] + c.avg_bat_kind[kind] + c.bowl_hand[idx, k] + c.hand_kind[k, kind]
            p = np.exp(L - L.max(1, keepdims=True))
            p /= p.sum(1, keepdims=True)
            feats += [np.log(p[:, S.WKT]), np.log((p * RUNS).sum(1)), np.log(p[:, S.FOUR] + p[:, S.SIX])]
    X = np.stack(feats, 1)
    return X


def similar(model: Model, pid: str, fmt: str = "T20", gender: str = "male", side: str = "batting",
            limit: int = 10, min_balls: int = 300) -> dict:
    c = ctx(model, fmt)
    w = c.w_bat if side == "batting" else c.w_bowl
    g = model.meta.get("catalog", {}).get("player_gender", "")
    want = gender[0]
    pool = np.array([i for i in np.flatnonzero(w >= min_balls) if not g or g[i] in (want, "u")])
    me = model.pid(pid)
    if not model.knows(pid) or me not in set(pool.tolist()):
        pool = np.append(pool, me)
    X = _features(c, pool, gender, side)
    X = (X - X.mean(0)) / (X.std(0) + 1e-9)
    j = int(np.flatnonzero(pool == me)[0])
    d = np.sqrt(((X - X[j]) ** 2).sum(1))
    order = [k for k in np.argsort(d) if k != j][:limit]
    return {"player": who(model, pid), "format": fmt, "side": side,
            "similar": [{**who(model, model.players[pool[k]]), "distance": _r(d[k], 2),
                         "similarity": _r(1 / (1 + d[k]), 3)} for k in order]}


def compare(model: Model, ids: list[str], fmt: str = "T20", gender: str = "male") -> dict:
    c = ctx(model, fmt)
    rows = []
    for pid in ids:
        r = {"player": who(model, pid), "batting": {}, "bowling": {}, "experience": _experience(model, pid, c.fam)}
        for ph in PHASES:
            sit = c.situation(gender, ph)
            r["batting"][ph] = c.batting(c.probs(sit, batter=pid))
            r["bowling"][ph] = c.bowling(c.probs(sit, bowler=pid))
        rows.append(r)
    sit = c.situation(gender, "middle")
    return {"format": fmt, "players": rows, "average": {"batting": c.batting(c.probs(sit)), "bowling": c.bowling(c.probs(sit))}}


def _vector_probs(c: Ctx, sit: np.ndarray, side: str, idx: np.ndarray) -> np.ndarray:
    out = np.zeros((len(idx), S.K))
    if side == "batting":
        for k, ks in enumerate(c.kind_share):
            if ks <= 0:
                continue
            for h in (1, 2):
                hand = c.model.hand[idx]
                hs = np.where(hand == h, 1.0, np.where(hand == 0, c.hand_share[h], 0.0))
                L = sit + c.bat[idx] + c.avg_bowl + c.bat_kind[idx, k] + c.avg_bowl_hand[h] + c.hand_kind[h, k]
                p = np.exp(L - L.max(1, keepdims=True))
                out += (ks * hs)[:, None] * p / p.sum(1, keepdims=True)
    else:
        kind = c.model.kind[idx]
        for h, hs in enumerate(c.hand_share):
            if hs <= 0:
                continue
            for k in range(1, NK):
                ks = np.where(kind == k, 1.0, np.where(kind == 0, c.kind_share[k], 0.0))
                if not ks.any():
                    continue
                L = sit + c.avg_bat + c.bowl[idx] + c.avg_bat_kind[k] + c.bowl_hand[idx, h] + c.hand_kind[h, k]
                p = np.exp(L - L.max(1, keepdims=True))
                out += (hs * ks)[:, None] * p / p.sum(1, keepdims=True)
    return out / out.sum(1, keepdims=True)


def rankings(model: Model, side: str = "batting", fmt: str = "T20", gender: str = "male", phase: str = "middle",
             min_balls: int = 500, active_days: int = 730, limit: int = 25, sort: str = "impact") -> dict:
    """Model leaderboard. Impact = runs added (batting) or saved (bowling) per 120 balls v an average player,
    counting each wicket at a format-typical run value."""
    c = ctx(model, fmt)
    w = c.w_bat if side == "batting" else c.w_bowl
    g = model.meta.get("catalog", {}).get("player_gender", "")
    last = model.last_played.astype(np.int64) if model.last_played is not None else np.zeros(len(w), np.int64)
    ref = int(last.max())
    keep = (w >= min_balls) & (last >= ref - active_days)
    if g:
        keep &= np.array([ch in (gender[0], "u") for ch in g])
    idx = np.flatnonzero(keep)
    if not len(idx):
        return {"format": fmt, "side": side, "phase": phase, "players": []}
    sit = c.situation(gender, phase)
    q = _vector_probs(c, sit, side, idx)
    avg = c.probs(sit)
    wv = WICKET_RUNS["od" if c.fam else "short"]

    def value(p):
        legal = p[..., S.LEGAL].sum(-1)
        runs = (p * RUNS).sum(-1)
        if side == "bowling":
            runs = runs + p[..., S.WIDE] * (1 + c.wide) + p[..., S.NOBALL] + p[..., S.BYE] * c.bye
        return 120 * runs / legal, 120 * p[..., S.WKT] / legal

    r, wk = value(q)
    ar, aw = value(avg)
    impact = (r - ar) - wv * (wk - aw) if side == "batting" else (ar - r) + wv * (wk - aw)
    rows = []
    for j, i in enumerate(idx):
        m = c.batting(q[j]) if side == "batting" else c.bowling(q[j])
        rows.append({**who(model, model.players[i]), "impact_per_120": _r(impact[j], 1), **m,
                     "balls": _r(w[i], 0)})
    ascending = {"batting": {"dot_pct"}, "bowling": {"economy", "balls_per_wicket", "boundary_pct", "extras_per_over"}}[side]
    if sort == "impact":
        key = lambda x: -x["impact_per_120"]                       # noqa: E731
    elif sort in ascending:
        key = lambda x: x.get(sort) if x.get(sort) is not None else 1e9   # noqa: E731
    else:
        key = lambda x: -(x.get(sort) or 0)                        # noqa: E731
    rows.sort(key=key)
    return {"format": fmt, "gender": gender, "side": side, "phase": phase, "sort": sort, "min_balls": min_balls,
            "average": c.batting(avg) if side == "batting" else c.bowling(avg),
            "players": [{"rank": k + 1, **r} for k, r in enumerate(rows[:limit])]}


# ── matchups ───────────────────────────────────────────────────────────────────

def _edge(c: Ctx, sit, bat, bowl) -> dict:
    q, avg = c.probs(sit, batter=bat, bowler=bowl), c.probs(sit)
    me, base = c.batting(q), c.batting(avg)
    return {"strike_rate": me["strike_rate"], "balls_per_dismissal": me["balls_per_dismissal"],
            "dot_pct": me["dot_pct"], "boundary_pct": me["boundary_pct"],
            "wicket_edge": _r((base["balls_per_dismissal"] or 0) / (me["balls_per_dismissal"] or 1), 2),
            "scoring_edge": _r((me["strike_rate"] or 0) / (base["strike_rate"] or 1), 2)}


def matchup_grid(model: Model, batters: list[str], bowlers: list[str], fmt: str = "T20", gender: str = "male",
                 phase: str = "middle") -> dict:
    c = ctx(model, fmt)
    sit = c.situation(gender, phase)
    cells = [{"batter": b, "bowler": w, **_edge(c, sit, b, w)} for b in batters for w in bowlers]
    return {"format": fmt, "phase": phase, "batters": [who(model, b) for b in batters],
            "bowlers": [who(model, w) for w in bowlers], "cells": cells,
            "note": "wicket_edge > 1: the bowler is likelier than an average pairing to take the wicket; "
                    "scoring_edge > 1: the batter scores faster than against an average bowler."}


def counter(model: Model, batter: str, candidates: list[str], fmt: str = "T20", gender: str = "male",
            phase: str = "middle") -> dict:
    c = ctx(model, fmt)
    sit = c.situation(gender, phase)
    wv = WICKET_RUNS["od" if c.fam else "short"]
    rows = []
    for w in candidates:
        e = _edge(c, sit, batter, w)
        q = c.probs(sit, batter=batter, bowler=w)
        legal = q[S.LEGAL].sum()
        value = 6 * ((q * RUNS).sum() - wv * q[S.WKT]) / legal                  # runs per over, wickets priced in
        rows.append({"bowler": who(model, w), **e, "net_runs_per_over": _r(value, 2)})
    rows.sort(key=lambda r: r["net_runs_per_over"])
    return {"batter": who(model, batter), "format": fmt, "phase": phase, "ranked": rows,
            "best_option": rows[0]["bowler"] if rows else None}


# ── venues, competitions, eras ─────────────────────────────────────────────────

def _catalog(model: Model, key: str) -> dict:
    return model.meta.get("catalog", {}).get(key, {})


def venues(model: Model, q: str | None = None, limit: int = 50) -> list[dict]:
    cat = _catalog(model, "venues")
    ql = (q or "").lower()
    rows = [{"id": v, **cat.get(v, {"name": v})} for v in model.venues[1:]
            if not ql or ql in v.lower() or ql in (cat.get(v, {}).get("name") or "").lower()
            or ql in (cat.get(v, {}).get("city") or "").lower()]
    rows.sort(key=lambda r: -(r.get("matches") or 0))
    return rows[:limit]


def _env(c: Ctx, gender: str, venue=None, comp=None) -> dict:
    out = {}
    for ph in PHASES:
        here = c.batting(c.probs(c.situation(gender, ph, venue=venue, comp=comp)))
        neutral = c.batting(c.probs(c.situation(gender, ph)))
        out[ph] = {"runs_per_over": _r((here["strike_rate"] or 0) * 6 / 100, 2),
                   "balls_per_wicket": here["balls_per_dismissal"], "boundary_pct": here["boundary_pct"],
                   "v_neutral": {"scoring": _r((here["strike_rate"] or 0) / (neutral["strike_rate"] or 1), 3),
                                 "wickets": _r((neutral["balls_per_dismissal"] or 0) / (here["balls_per_dismissal"] or 1), 3),
                                 "boundaries": _r((here["boundary_pct"] or 0) / (neutral["boundary_pct"] or 1), 3)}}
    return out


def venue_profile(model: Model, vid: str, fmt: str = "T20", gender: str = "male") -> dict | None:
    if vid not in model._vidx or vid == "":
        return None
    c = ctx(model, fmt)
    env = _env(c, gender, venue=vid)
    sc = np.mean([env[p]["v_neutral"]["scoring"] for p in env])
    wk = np.mean([env[p]["v_neutral"]["wickets"] for p in env])
    label = ("high scoring" if sc > 1.03 else "low scoring" if sc < 0.97 else "par scoring") + \
        (", bowler friendly" if wk > 1.05 else ", batting friendly" if wk < 0.95 else "")
    return {"venue": {"id": vid, **_catalog(model, "venues").get(vid, {"name": vid})}, "format": fmt,
            "character": label, "scoring_index": _r(sc, 3), "wicket_index": _r(wk, 3), "by_phase": env}


def competitions(model: Model, q: str | None = None, limit: int = 50) -> list[dict]:
    cat = _catalog(model, "comps")
    ql = (q or "").lower()
    rows = [{"key": k, **cat.get(k, {"name": k})} for k in model.comps[1:]
            if not ql or ql in k.lower() or ql in (cat.get(k, {}).get("name") or "").lower()]
    rows.sort(key=lambda r: (r.get("last") or "", r.get("matches") or 0), reverse=True)
    return rows[:limit]


def comp_profile(model: Model, key: str, gender: str | None = None) -> dict | None:
    if key not in model._cidx or key == "":
        return None
    info = _catalog(model, "comps").get(key, {"name": key})
    fmt = info.get("format") or ("OD" if key.endswith("-OD") else "T20")
    fmt = fmt if fmt in FORMAT_LIST else "T20"
    g = gender or info.get("gender") or "male"
    c = ctx(model, fmt)
    env = _env(c, g, comp=key)
    return {"competition": {"key": key, **info}, "format": fmt,
            "scoring_index": _r(np.mean([env[p]["v_neutral"]["scoring"] for p in env]), 3),
            "wicket_index": _r(np.mean([env[p]["v_neutral"]["wickets"] for p in env]), 3), "by_phase": env}


def scoring_trend(model: Model, fmt: str = "T20", gender: str = "male") -> dict:
    c = ctx(model, fmt)
    f = model.factors.get("era")
    fit = model.meta.get("fit", {})
    balls = np.asarray(fit.get("era_balls", [[0] * N_ERA] * 2)[c.fam], dtype=np.float64)
    rows = []
    if f is not None:
        for s in range(N_ERA):
            if balls[s] < 1000:
                continue
            era = f[c.fam * N_ERA + s].astype(np.float64)
            row = {"season": ERA_START + s, "balls": int(balls[s])}
            for ph in PHASES:
                b = c.batting(c.probs(c.situation(gender, ph, era=era)))
                row[ph] = {"runs_per_over": _r((b["strike_rate"] or 0) * 6 / 100, 2),
                           "balls_per_wicket": b["balls_per_dismissal"], "boundary_pct": b["boundary_pct"]}
            rows.append(row)
    now = {ph: c.batting(c.probs(c.situation(gender, ph))) for ph in PHASES}
    return {"format": fmt, "gender": gender, "seasons": rows,
            "forecast": {ph: {"runs_per_over": _r((b["strike_rate"] or 0) * 6 / 100, 2),
                              "balls_per_wicket": b["balls_per_dismissal"], "boundary_pct": b["boundary_pct"]}
                         for ph, b in now.items()},
            "note": "Average batter v average attack on a neutral ground; the forecast row is the model's level "
                    "for the coming months."}


# ── teams ──────────────────────────────────────────────────────────────────────

def teams(model: Model, q: str | None = None, gender: str | None = None, limit: int = 50) -> list[dict]:
    cat = _catalog(model, "teams")
    ql = (q or "").lower()
    rows = []
    for tid, t in cat.items():
        if ql and ql not in tid.lower() and ql not in (t.get("name") or "").lower():
            continue
        if gender and t.get("gender") != gender:
            continue
        last = max((v.get("last") or "" for v in t["formats"].values()), default="")
        rows.append({"id": tid, "name": t.get("name"), "gender": t.get("gender"), "formats": sorted(t["formats"]),
                     "last_match": last})
    rows.sort(key=lambda r: r["last_match"], reverse=True)
    return rows[:limit]


def team_detail(model: Model, tid: str, fmt: str = "T20") -> dict | None:
    t = _catalog(model, "teams").get(tid)
    if not t:
        return None
    f = t["formats"].get(fmt) or next(iter(t["formats"].values()))
    xi = f.get("last_xi") or []
    out = {"id": tid, "name": t.get("name"), "gender": t.get("gender"), "format": fmt,
           "matches": f.get("matches"), "last_match": f.get("last"), "last_xi": [who(model, p) for p in xi]}
    if len(xi) == 11:
        out["profile"] = team_profile(model, xi, fmt, t.get("gender") or "male")
    return out


def team_profile(model: Model, players: list[str], fmt: str = "T20", gender: str = "male",
                 bowlers: list[str] | None = None) -> dict:
    c = ctx(model, fmt)
    fam = c.fam
    sit_mid = c.situation(gender, "middle")
    avg_b = c.batting(c.probs(sit_mid))
    bat_rows, spin_idx, pace_idx = [], [], []
    for pos, pid in enumerate(players, 1):
        me = c.batting(c.probs(sit_mid, batter=pid))
        sp = np.mean([c.batting(c.probs(sit_mid, batter=pid, kind=k))["balls_per_dismissal"] or 0 for k in SPIN_KINDS])
        pa = np.mean([c.batting(c.probs(sit_mid, batter=pid, kind=k))["balls_per_dismissal"] or 0 for k in PACE_KINDS])
        sa = np.mean([c.batting(c.probs(sit_mid, kind=k))["balls_per_dismissal"] or 0 for k in SPIN_KINDS])
        pv = np.mean([c.batting(c.probs(sit_mid, kind=k))["balls_per_dismissal"] or 0 for k in PACE_KINDS])
        if pos <= 7:
            spin_idx.append(sp / sa if sa else 1)
            pace_idx.append(pa / pv if pv else 1)
        bat_rows.append({"position": pos, **who(model, pid), **me,
                         "v_average": _index(me, avg_b)})
    pool = bowlers or [p for p in players if model.knows(p) and model.usage[model.pid(p), fam].sum() >= 0.5]
    bowl_rows = []
    for pid in pool:
        r = {**who(model, pid), "overs_per_match": _r(model.usage[model.pid(pid), fam].sum(), 2)}
        for ph in PHASES:
            r[ph] = c.bowling(c.probs(c.situation(gender, ph), bowler=pid))
        bowl_rows.append(r)
    kinds = [S.BOWLING_KINDS[model.kind[model.pid(p)]] for p in pool]
    hands = [S.HANDS[model.hand[model.pid(p)]] for p in players[:7]]
    top7 = [r for r in bat_rows if r["position"] <= 7]
    return {"format": fmt, "batting": bat_rows, "bowling": bowl_rows,
            "summary": {"top7_strike_rate": _r(np.mean([r["strike_rate"] or 0 for r in top7]), 1),
                        "top7_balls_per_dismissal": _r(np.mean([r["balls_per_dismissal"] or 0 for r in top7]), 1),
                        "left_handers_top7": hands.count("left"),
                        "spin_options": sum(k in {S.BOWLING_KINDS[i] for i in SPIN_KINDS} for k in kinds),
                        "pace_options": sum(k in ("pace_right", "pace_left") for k in kinds),
                        "survival_v_spin": _r(np.mean(spin_idx), 2) if spin_idx else None,
                        "survival_v_pace": _r(np.mean(pace_idx), 2) if pace_idx else None,
                        "bowling_depth": len(pool)},
            "note": "survival_v_spin / v_pace: top-seven balls per dismissal against that bowling type relative to "
                    "average batters (above 1 = harder to dismiss)."}
