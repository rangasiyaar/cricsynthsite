"""Simulations → match-centre outputs (plain JSON-able dicts).

    summarize(sims, model)            everything the match centre shows
    summarize(sims, model, mask)      the same, conditioned on a subset of simulations
    masks.*                           build conditions ("Team A scores 180+", "X makes 50", …)
"""
from __future__ import annotations

from dataclasses import asdict

import numpy as np

from cricsim.engine import states as S
from cricsim.engine.model import DISMISSALS, Model
from cricsim.engine.simulate import InningsLog, MatchSims

Q = (5, 10, 25, 50, 75, 90, 95)


def _r(x, nd=3):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), nd)


def _dist(a: np.ndarray) -> dict:
    if a.size == 0:
        return {"mean": None, "q": {}}
    return {"mean": _r(a.mean(), 2), "q": {str(q): _r(v, 1) for q, v in zip(Q, np.percentile(a, Q))}}


def _batting_logs(sims: MatchSims, team: int, mask: np.ndarray | None):
    """(InningsLog, row selector, innings0) for each part in which `team` batted."""
    out, start = [], 0
    for p in sims.parts:
        sel = np.ones(p.n, dtype=bool) if mask is None else mask[start:start + p.n]
        for inn0, lg in enumerate(p.innings):
            if lg.batting == team:
                out.append((lg, sel, inn0))
        start += p.n
    return out


def _cat(logs, field: str) -> np.ndarray:
    return np.concatenate([getattr(lg, field)[sel] for lg, sel, _ in logs]) if logs else np.array([])


def phases(rules: dict) -> list[tuple[str, int, int]]:
    overs, pp = rules["overs"], rules["pp"]
    death = max(pp, int(round(overs * 0.8)))
    return [("Powerplay", 0, pp), ("Middle", pp, death), ("Death", death, overs)]


def _top(ids: list[str], idx: np.ndarray, model: Model, n: int, k: int = 5) -> list[dict]:
    idx = idx[idx >= 0]
    c = np.bincount(idx, minlength=len(ids))
    order = np.argsort(-c)[:k]
    return [{"id": ids[j], "name": model.names[model.pid(ids[j])] if model.knows(ids[j]) else ids[j],
             "p": _r(c[j] / max(n, 1), 4)} for j in order if c[j] > 0]


def _team_batting(sims: MatchSims, team: int, mask, model: Model) -> dict:
    logs = _batting_logs(sims, team, mask)
    if not logs or not any(sel.any() for _, sel, _ in logs):
        return {}
    rules = sims.rules
    runs, wkts = _cat(logs, "runs"), _cat(logs, "wkts")
    width = 10 if rules["overs"] <= 20 else 20
    lo, hi = int(np.percentile(runs, 0.5)) // width * width, int(np.percentile(runs, 99.5)) // width * width + width
    hist = [{"from": b, "to": b + width, "p": _r(((runs >= b) & (runs < b + width)).mean(), 4)}
            for b in range(lo, hi, width)]
    over_runs, over_wkts = _cat(logs, "over_runs"), _cat(logs, "over_wkts")
    phase_rows = []
    for name, a, b in phases(rules):
        pr, pw = over_runs[:, a:b].sum(1), over_wkts[:, a:b].sum(1)
        phase_rows.append({"phase": name, "overs": [a + 1, b], "runs": _dist(pr), "wickets": _dist(pw),
                           "p_no_wicket": _r((pw == 0).mean())})
    per_over = [{"over": o + 1, "runs": _r(over_runs[:, o].mean(), 2), "p_wicket": _r((over_wkts[:, o] > 0).mean()),
                 "wickets": _r(over_wkts[:, o].mean())} for o in range(rules["overs"])]
    cum_runs, cum_wkts = over_runs.cumsum(1), over_wkts.cumsum(1)
    fan_q = np.percentile(cum_runs, (10, 25, 50, 75, 90), axis=0)
    fan = [{"over": o + 1, "q10": _r(fan_q[0, o], 0), "q25": _r(fan_q[1, o], 0), "q50": _r(fan_q[2, o], 0),
            "q75": _r(fan_q[3, o], 0), "q90": _r(fan_q[4, o], 0), "wickets": _r(cum_wkts[:, o].mean(), 2)}
           for o in range(rules["overs"])]
    bpo = rules["bpo"]
    fow_ball, fow_runs = _cat(logs, "fow_ball"), _cat(logs, "fow_runs")
    fow_bowler, fow_slot = _cat(logs, "fow_bowler"), _cat(logs, "fow_slot")
    fow = []
    prev_runs = np.zeros(len(runs))
    for k in range(10):
        fell = fow_ball[:, k] > 0
        started = fow_ball[:, k - 1] > 0 if k else np.ones(len(runs), dtype=bool)   # this partnership began
        if not fell.any():
            fow.append({"wicket": k + 1, "p": 0.0})
            continue
        over_of = (fow_ball[fell, k] - 1) // bpo
        by_over = np.bincount(over_of, minlength=rules["overs"])[:rules["overs"]] / len(runs)
        part = np.where(fell, fow_runs[:, k] - prev_runs, runs - prev_runs)[started]
        fow.append({"wicket": k + 1, "p": _r(fell.mean()), "over": _dist(over_of + 1), "score": _dist(fow_runs[fell, k]),
                    "partnership": _dist(part), "by_over": [_r(x, 4) for x in by_over],
                    "bowler": _top(logs[0][0].bowlers, fow_bowler[:, k], model, len(runs)),
                    "batter": _top(logs[0][0].order, fow_slot[:, k], model, len(runs))})
        prev_runs = np.where(fell, fow_runs[:, k], prev_runs)
    extras = _cat(logs, "extras")
    by_toss = []
    for lg, sel, inn0 in logs:
        if sel.any():
            by_toss.append({"innings": inn0 + 1, "score": _dist(lg.runs[sel]), "n": int(sel.sum())})
    thresholds = list(range(lo + width, hi, width))
    return {"score": {**_dist(runs), "hist": hist, "p_at_least": {str(t): _r((runs >= t).mean()) for t in thresholds}},
            "wickets": {**_dist(wkts), "dist": [_r((wkts == k).mean(), 4) for k in range(11)]},
            "balls": _dist(_cat(logs, "legal")), "by_innings": by_toss, "phases": phase_rows, "per_over": per_over,
            "fan": fan,
            "fall_of_wickets": fow,
            "extras": {"wides": _r(extras[:, 0].mean(), 2), "no_balls": _r(extras[:, 1].mean(), 2),
                       "byes": _r(extras[:, 2].mean(), 2), "total": _dist(extras.sum(1))}}


def _players(sims: MatchSims, model: Model, team: int, mask) -> list[dict]:
    spec = sims.spec
    fmt_od = spec.format == "OD"
    marks = (25, 50, 75, 100, 150) if fmt_od else (10, 20, 30, 50, 100)
    bat_logs = _batting_logs(sims, team, mask)
    bowl_logs = _batting_logs(sims, 1 - team, mask)
    players = spec.teams[team].players
    rows = []
    # batting
    br = {p: [] for p in players}
    tops = {p: [] for p in players}
    for lg, sel, _ in bat_logs:
        r = lg.bat_runs[sel]
        best = r.max(1, keepdims=True)
        is_top = (r == best) & (best > 0)
        share = is_top / np.maximum(is_top.sum(1, keepdims=True), 1)
        for slot, p in enumerate(lg.order):
            br.setdefault(p, []).append((lg, sel, slot))
            tops.setdefault(p, []).append(share[:, slot])
    bw = {p: [] for p in players}
    best_bowler = {p: [] for p in players}
    for lg, sel, _ in bowl_logs:
        wk, rn = lg.bowl_wkts[sel], lg.bowl_runs[sel]
        score = wk * 1000 - rn + (lg.bowl_balls[sel] > 0) * 0.5
        top = score == score.max(1, keepdims=True)
        share = top / np.maximum(top.sum(1, keepdims=True), 1)
        for slot, p in enumerate(lg.bowlers):
            bw.setdefault(p, []).append((lg, sel, slot))
            best_bowler.setdefault(p, []).append(share[:, slot])
    for p in players:
        i = model.pid(p)
        row = {"id": p, "name": model.names[i] if model.knows(p) else p, "known": model.knows(p)}
        if br.get(p):
            runs = np.concatenate([lg.bat_runs[sel, s] for lg, sel, s in br[p]])
            balls = np.concatenate([lg.bat_balls[sel, s] for lg, sel, s in br[p]])
            out = np.concatenate([lg.bat_out[sel, s] for lg, sel, s in br[p]])
            kind = np.concatenate([lg.bat_kind[sel, s] for lg, sel, s in br[p]])
            batted = balls > 0
            how = {DISMISSALS[k]: _r((kind == k).mean()) for k in range(len(DISMISSALS)) if (kind == k).any()}
            by = {}
            for lg, sel, s in br[p]:
                b = lg.bat_by[sel, s]
                for j in np.unique(b[b >= 0]):
                    by[lg.bowlers[j]] = by.get(lg.bowlers[j], 0) + int((b == j).sum())
            n = max(len(runs), 1)
            row["batting"] = {
                "slot": int(np.median([s for _, _, s in br[p]])) + 1,
                "p_bats": _r(batted.mean()), "runs": _dist(runs), "balls": _dist(balls),
                "strike_rate": _r(100 * runs[batted].sum() / max(balls[batted].sum(), 1), 1),
                "p_at_least": {str(t): _r((runs >= t).mean()) for t in marks},
                "p_duck": _r(((runs == 0) & out & batted).mean()), "p_out": _r(out.mean()),
                "how_out": how,
                "dismissed_by": sorted(({"bowler": b, "name": model.names[model.pid(b)] if model.knows(b) else b,
                                         "p": _r(c / n)} for b, c in by.items()), key=lambda d: -d["p"])[:5],
                "p_top_scorer": _r(np.concatenate(tops[p]).mean()),
            }
        if bw.get(p):
            wk = np.concatenate([lg.bowl_wkts[sel, s] for lg, sel, s in bw[p]])
            rn = np.concatenate([lg.bowl_runs[sel, s] for lg, sel, s in bw[p]])
            bl = np.concatenate([lg.bowl_balls[sel, s] for lg, sel, s in bw[p]])
            bowled = bl > 0
            row["bowling"] = {
                "p_bowls": _r(bowled.mean()), "overs": _r(bl.mean() / sims.rules["bpo"], 2), "wickets": _dist(wk),
                "p_wickets": {str(k): _r((wk >= k).mean()) for k in range(1, 6)},
                "runs": _dist(rn[bowled]) if bowled.any() else _dist(rn),
                "economy": _r(sims.rules["bpo"] * rn.sum() / max(bl.sum(), 1), 2),
                "p_best_bowler": _r(np.concatenate(best_bowler[p]).mean()),
            }
        row["profile"] = profile(model, p, spec.format)
        rows.append(row)
    return rows


def profile(model: Model, pid: str, fmt: str) -> dict:
    """Where the rating comes from — the cross-league / cross-format story for each player."""
    i = model.pid(pid)
    fam = 1 if fmt == "OD" else 0
    if not model.knows(pid):
        return {"source": "no history — simulated as a league-average newcomer"}
    f = model.factors
    bat = f["bat"][i] + f["bat_fmt"][i * 2 + fam]
    bowl = f["bowl"][i] + f["bowl_fmt"][i * 2 + fam]
    return {
        "balls_faced": {"short": _r(model.balls_faced[i, 0], 0), "od": _r(model.balls_faced[i, 1], 0)},
        "balls_bowled": {"short": _r(model.balls_bowled[i, 0], 0), "od": _r(model.balls_bowled[i, 1], 0)},
        "in_this_format": _r(model.balls_faced[i, fam] + model.balls_bowled[i, fam], 0),
        # multipliers v an average player (1.0 = average)
        "batting": {"wicket": _r(np.exp(bat[S.WKT] - bat[S.DOT]), 2), "four": _r(np.exp(bat[S.FOUR] - bat[S.DOT]), 2),
                    "six": _r(np.exp(bat[S.SIX] - bat[S.DOT]), 2)},
        "bowling": {"wicket": _r(np.exp(bowl[S.WKT] - bowl[S.DOT]), 2), "four": _r(np.exp(bowl[S.FOUR] - bowl[S.DOT]), 2),
                    "six": _r(np.exp(bowl[S.SIX] - bowl[S.DOT]), 2), "wide": _r(np.exp(bowl[S.WIDE] - bowl[S.DOT]), 2)},
        "hand": S.HANDS[model.hand[i]], "bowling_kind": S.BOWLING_KINDS[model.kind[i]],
    }


def _matchups(sims: MatchSims, model: Model, mask) -> list[dict]:
    """P(batter dismissed by bowler) for every pair, across the match."""
    acc: dict[tuple[str, str], float] = {}
    total = 0
    start = 0
    for p in sims.parts:
        sel = np.ones(p.n, dtype=bool) if mask is None else mask[start:start + p.n]
        total += sel.sum()
        for lg in p.innings:
            by = lg.bat_by[sel]
            for s, bat in enumerate(lg.order):
                col = by[:, s]
                for j in np.unique(col[col >= 0]):
                    key = (bat, lg.bowlers[j])
                    acc[key] = acc.get(key, 0) + int((col == j).sum())
        start += p.n
    rows = [{"batter": b, "bowler": w, "p": _r(c / max(total, 1), 4)} for (b, w), c in acc.items()]
    return sorted(rows, key=lambda r: -r["p"])


def summarize(sims: MatchSims, model: Model, mask: np.ndarray | None = None) -> dict:
    spec = sims.spec
    n_sel = sims.n if mask is None else int(mask.sum())
    win = np.zeros(2)
    tie = 0.0
    margins = {"runs": [], "wickets": []}
    by_toss = []
    start = 0
    for p in sims.parts:
        sel = np.ones(p.n, dtype=bool) if mask is None else mask[start:start + p.n]
        start += p.n
        if not sel.any():
            continue
        wv = p.winner[sel]
        for t in (0, 1):
            win[t] += (wv == t).sum()
        tie += p.tie[sel].sum()
        bf = p.batting_first
        i1, i2 = p.innings
        r1, r2 = i1.runs[sel], i2.runs[sel]
        margins["runs"].append((r1 - r2)[r1 > r2])
        margins["wickets"].append((10 - i2.wkts[sel])[r2 > r1])
        by_toss.append({"batting_first": spec.teams[bf].name, "n": int(sel.sum()),
                        "win": {spec.teams[t].name: _r((wv == t).mean()) for t in (0, 1)}})
    n_tot = max(n_sel, 1)
    curve = _first_innings_curve(sims, mask)
    mr = np.concatenate(margins["runs"]) if margins["runs"] else np.array([])
    mw = np.concatenate(margins["wickets"]) if margins["wickets"] else np.array([])
    return {
        "meta": {"format": spec.format, "gender": spec.gender, "venue_id": spec.venue_id, "comp_key": spec.comp_key,
                 "simulations": n_sel, "rules": sims.rules, "model": model.meta.get("cutoff"), "engine": _engine(model, sims),
                 "scenario": _scenario_dict(sims)},
        "result": {"win": {spec.teams[t].name: _r(win[t] / n_tot) for t in (0, 1)}, "tie": _r(tie / n_tot),
                   "win_ci95": {spec.teams[t].name: _r(1.96 * np.sqrt(max(win[t] / n_tot * (1 - win[t] / n_tot), 1e-9) / n_tot), 4)
                                for t in (0, 1)},
                   "win_by_first_innings": curve,
                   "by_toss": by_toss,
                   "margin_runs": _dist(mr), "margin_wickets": _dist(mw)},
        "teams": [{"name": spec.teams[t].name, "batting": _team_batting(sims, t, mask, model),
                   "players": _players(sims, model, t, mask)} for t in (0, 1)],
        "matchups": _matchups(sims, model, mask)[:60],
    }


def _engine(model: Model, sims: MatchSims) -> dict:
    """What produced this forecast: training volume, fit quality, match-to-match variation, simulation effort."""
    fit = model.meta.get("fit", {})
    passes = fit.get("passes") or [{}]
    balls = sum(int(lg.legal.sum()) for p in sims.parts for lg in p.innings)
    return {"balls_trained": fit.get("balls"), "players": len(model.players) - 1, "venues": len(model.venues) - 1,
            "competitions": len(model.comps) - 1, "log_loss": passes[-1].get("log_loss"), "fit_passes": len(passes),
            "conditions_sd": fit.get("conditions_sd"), "data_through": _asof(fit.get("era_asof")),
            "balls_simulated": balls, "outcomes": list(S.OUTCOMES)}


def _asof(years: float | None) -> str | None:
    if years is None:
        return None
    from datetime import date, timedelta
    return str(date(2000, 1, 1) + timedelta(days=int(years * 365.25)))


def _first_innings_curve(sims: MatchSims, mask) -> list[dict]:
    """P(side batting first wins | its total), in 10-run bins with enough simulations."""
    first, won = [], []
    start = 0
    for p in sims.parts:
        sel = np.ones(p.n, dtype=bool) if mask is None else mask[start:start + p.n]
        start += p.n
        first.append(p.innings[0].runs[sel])
        won.append(p.winner[sel] == p.batting_first)
    if not first:
        return []
    f, w = np.concatenate(first), np.concatenate(won)
    width = 10 if sims.rules["overs"] <= 20 else 20
    out = []
    for b in range(int(f.min()) // width * width, int(f.max()) + 1, width):
        sel = (f >= b) & (f < b + width)
        if sel.sum() >= 40:
            out.append({"from": b, "to": b + width, "p_win": _r(w[sel].mean(), 4), "n": int(sel.sum())})
    return out


def _scenario_dict(sims: MatchSims) -> dict:
    d = asdict(sims.scenario)
    return {k: v for k, v in d.items() if v not in (None, {}, [], 0.0, 1.0)}


class masks:
    """Conditions over simulations, for 'what happens if …' questions."""

    @staticmethod
    def _per_part(sims: MatchSims, fn) -> np.ndarray:
        return np.concatenate([fn(p) for p in sims.parts])

    @staticmethod
    def team_score(sims: MatchSims, team: int, at_least: int | None = None, at_most: int | None = None) -> np.ndarray:
        def fn(p):
            lg: InningsLog = next(x for x in p.innings if x.batting == team)
            m = np.ones(p.n, dtype=bool)
            if at_least is not None:
                m &= lg.runs >= at_least
            if at_most is not None:
                m &= lg.runs <= at_most
            return m
        return masks._per_part(sims, fn)

    @staticmethod
    def player_runs(sims: MatchSims, pid: str, at_least: int) -> np.ndarray:
        def fn(p):
            for lg in p.innings:
                if pid in lg.order:
                    return lg.bat_runs[:, lg.order.index(pid)] >= at_least
            return np.zeros(p.n, dtype=bool)
        return masks._per_part(sims, fn)

    @staticmethod
    def player_wickets(sims: MatchSims, pid: str, at_least: int) -> np.ndarray:
        def fn(p):
            for lg in p.innings:
                if pid in lg.bowlers:
                    return lg.bowl_wkts[:, lg.bowlers.index(pid)] >= at_least
            return np.zeros(p.n, dtype=bool)
        return masks._per_part(sims, fn)

    @staticmethod
    def phase_wickets(sims: MatchSims, team: int, phase: str, at_least: int) -> np.ndarray:
        a, b = next((a, b) for name, a, b in phases(sims.rules) if name.lower() == phase.lower())

        def fn(p):
            lg = next(x for x in p.innings if x.batting == team)
            return lg.over_wkts[:, a:b].sum(1) >= at_least
        return masks._per_part(sims, fn)

    @staticmethod
    def batting_first(sims: MatchSims, team: int) -> np.ndarray:
        return masks._per_part(sims, lambda p: np.full(p.n, p.batting_first == team))
