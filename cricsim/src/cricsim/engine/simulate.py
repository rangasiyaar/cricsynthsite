"""Vectorised Monte Carlo: N simulations of a limited-overs match, ball by ball, with full event logs.

Every simulation is a complete scorecard: who scored what, who bowled which over, every wicket
(ball, batter, bowler, how out), extras, partnerships. Summaries (win %, score bands, phase runs,
wicket timelines, dismissal matrices, player probabilities) are computed from these logs, so any
condition ("if India post 180+", "if Kohli makes 50") can be applied afterwards by filtering.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from cricsim.engine import states as S
from cricsim.engine.model import (BOWLER_DISMISSALS, FORMAT_LIST, GENDERS, MAX_OVERS, N_DECILES, RUN_OUT,
                                  SITUATION, Model, era_vector)
from cricsim.engine.spec import MatchSpec, Scenario

SPIN = {S.BOWLING_KINDS.index(k) for k in ("off_spin", "leg_spin", "left_arm_orthodox", "left_arm_wrist", "slow")}
PACE = {S.BOWLING_KINDS.index(k) for k in ("pace_right", "pace_left")}
BOWL_FOCUS = 2.0
PART_TIMER = 0.0003      # base weight for players who rarely bowl (backtest: 8.0 bowlers used v 6.2 real)


@dataclass
class InningsLog:
    batting: int                      # team index (0/1)
    order: list[str]                  # batting order (player ids)
    bowlers: list[str]                # bowling XI (player ids)
    runs: np.ndarray                  # (N,)
    wkts: np.ndarray
    legal: np.ndarray                 # legal balls used
    extras: np.ndarray                # (N, 3) wides, no-balls, byes/leg-byes runs
    over_runs: np.ndarray             # (N, overs)
    over_wkts: np.ndarray
    bat_runs: np.ndarray              # (N, 11)
    bat_balls: np.ndarray
    bat_4s: np.ndarray
    bat_6s: np.ndarray
    bat_out: np.ndarray               # bool
    bat_kind: np.ndarray              # dismissal kind index, -1 not out
    bat_by: np.ndarray                # bowling slot credited, -1 none
    bowl_balls: np.ndarray            # (N, 11) legal balls
    bowl_runs: np.ndarray
    bowl_wkts: np.ndarray
    fow_ball: np.ndarray              # (N, 10) legal ball number of the k-th wicket, -1 if it didn't fall
    fow_runs: np.ndarray
    fow_slot: np.ndarray              # batting slot dismissed
    fow_bowler: np.ndarray            # bowling slot credited, -1 (run out)


@dataclass
class Part:
    batting_first: int
    n: int
    innings: tuple[InningsLog, InningsLog]
    winner: np.ndarray                # (N,) 0/1 team index; ties broken by a coin flip (super over)
    tie: np.ndarray                   # bool


@dataclass
class MatchSims:
    spec: MatchSpec
    scenario: Scenario
    parts: list[Part]
    rules: dict

    @property
    def n(self) -> int:
        return sum(p.n for p in self.parts)


class _Tables:
    """Everything a ball needs, gathered once per innings: situation slices + an 11×11×K player-pair table."""

    def __init__(self, model: Model, spec: MatchSpec, sc: Scenario, inn0: int, order: list[str], bowlers: list[str],
                 allowed_bowlers: list[str] | None = None):
        f = model.factors
        K = S.K
        fmt = FORMAT_LIST.index(spec.format)
        g = GENDERS.index(spec.gender)
        fam = 1 if spec.format == "OD" else 0
        self.base = f["base"].reshape(len(FORMAT_LIST), 2, 2, MAX_OVERS, 10, K)[fmt, g, inn0] + era_vector(model, fam)
        self.sit = {name: f[name].reshape(2, n, K)[fam] for name, n in SITUATION.items()}
        nk, nh = len(S.BOWLING_KINDS), len(S.HANDS)
        pb = np.array([model.pid(p) for p in order])
        pw = np.array([model.pid(p) for p in bowlers])

        def attr(pids, ids, arr, key, conv):
            out = arr[pids].astype(np.int64).copy()
            for i, p in enumerate(ids):
                a = spec.attributes.get(p)
                if a and a.get(key):
                    out[i] = conv(a)
            return out

        hand = attr(pb, order, model.hand, "hand", lambda a: S.hand_index(a["hand"]))
        kind = attr(pw, bowlers, model.kind, "kind", lambda a: S.bowling_kind_index(a.get("arm"), a["kind"]))
        self.kind = kind
        pair = (f["bat"][pb][:, None] + f["bat_fmt"][pb * 2 + fam][:, None]
                + f["bowl"][pw][None] + f["bowl_fmt"][pw * 2 + fam][None]
                + f["bat_kind"][pb[:, None] * nk + kind[None]]
                + f["bowl_hand"][pw[None] * nh + hand[:, None]]
                + self.sit["hand_kind"][hand[:, None] * nk + kind[None]]
                + f["venue"][model.venue(spec.venue_id)] + f["comp"][model.comp(spec.comp_key)])
        pair = pair.astype(np.float64)
        # scenario levers (log-multipliers on outcome classes)
        bnd = [S.FOUR, S.SIX]
        pair[..., bnd] += np.log(sc.boundary_mult)
        pair[..., S.WKT] += np.log(sc.wicket_mult)
        pair[..., [S.WIDE, S.NOBALL, S.BYE]] += np.log(sc.extras_mult)
        for j, k in enumerate(kind):
            if k in SPIN:
                pair[:, j, S.WKT] += np.log(sc.spin_wicket_mult) + (np.log(1 - 0.3 * sc.dew) if inn0 == 1 else 0)
            if k in PACE:
                pair[:, j, S.WKT] += np.log(sc.pace_wicket_mult)
        if inn0 == 1 and sc.dew:
            pair[..., bnd] += np.log(1 + 0.1 * sc.dew)
        for i, p in enumerate(order):
            if p in sc.player_form:
                lf = np.log(sc.player_form[p])
                pair[i, :, S.WKT] -= lf
                pair[i, :, bnd] += 0.5 * lf
        for j, p in enumerate(bowlers):
            if p in sc.player_form:
                lf = np.log(sc.player_form[p])
                pair[:, j, S.WKT] += lf
                pair[:, j, bnd] -= 0.5 * lf
        self.pair = pair

        rules = spec.rules
        # share of a decile's overs this bowler usually bowls (sums to ~1 across a settled attack)
        per_decile = rules["overs"] / N_DECILES if fam else 2.0
        share = model.usage[pw, fam].astype(np.float64) / per_decile
        # captains lean on their frontline bowlers: sharpen the usage shares (backtest: wickets were spread too thin)
        weights = share ** BOWL_FOCUS + PART_TIMER
        allowed = np.array([p not in sc.exclude_bowlers for p in bowlers])
        if allowed_bowlers:
            listed = np.array([p in allowed_bowlers for p in bowlers])
            weights[listed] += 0.3
            allowed &= listed
        if not allowed.any():
            allowed[:] = True
        self.bowl_weights = weights * allowed[:, None]
        self.dismissal = model.dismissal[fam][kind].astype(np.float64)        # (11, kinds)
        self.wide_runs = model.wide_runs[fam].astype(np.float64)
        self.bye_runs = model.bye_runs[fam].astype(np.float64)
        self.runout_ns = model.runout_non_striker


def _choose(rng, probs: np.ndarray) -> np.ndarray:
    cum = probs.cumsum(1)
    u = rng.random(len(probs))[:, None] * cum[:, -1:]
    return np.minimum((u > cum).sum(1), probs.shape[1] - 1)


def simulate_innings(rng: np.random.Generator, T: _Tables, n: int, rules: dict, inn0: int,
                     target: np.ndarray | None, start=None, order: list[str] | None = None,
                     bowlers: list[str] | None = None, conditions: np.ndarray | None = None) -> dict:
    """conditions: (n, K) log-multipliers per simulated match (pitch/weather draw), or None."""
    overs, bpo, quota = rules["overs"], rules["bpo"], rules["quota"]
    consecutive_ok = rules.get("bpo") == 5
    K = S.K
    ar = np.arange(n)
    striker = np.zeros(n, dtype=np.int64)
    non = np.ones(n, dtype=np.int64)
    runs = np.zeros(n, dtype=np.int64)
    wkts = np.zeros(n, dtype=np.int64)
    legal = np.zeros(n, dtype=np.int64)
    in_over = np.zeros(n, dtype=np.int64)
    bowler = np.full(n, -1, dtype=np.int64)
    last_over = np.full((n, 11), -9, dtype=np.int64)
    used = np.zeros((n, 11), dtype=np.int64)
    spell = np.zeros(n, dtype=np.int64)
    free_hit = np.zeros(n, dtype=np.int64)
    dots = np.zeros(n, dtype=np.int64)
    log = {k: np.zeros((n, 11), dtype=np.int64) for k in ("bat_runs", "bat_balls", "bat_4s", "bat_6s",
                                                           "bowl_balls", "bowl_runs", "bowl_wkts")}
    bat_out = np.zeros((n, 11), dtype=bool)
    bat_kind = np.full((n, 11), -1, dtype=np.int64)
    bat_by = np.full((n, 11), -1, dtype=np.int64)
    prev_runs = np.full((n, 11), -1, dtype=np.int64)
    prev_bnd = np.zeros((n, 11), dtype=bool)
    extras = np.zeros((n, 3), dtype=np.int64)
    over_runs = np.zeros((n, overs), dtype=np.int64)
    over_wkts = np.zeros((n, overs), dtype=np.int64)
    fow_ball = np.full((n, 10), -1, dtype=np.int64)
    fow_runs = np.full((n, 10), -1, dtype=np.int64)
    fow_slot = np.full((n, 10), -1, dtype=np.int64)
    fow_bowler = np.full((n, 10), -1, dtype=np.int64)

    if start is not None:                                # resume mid-innings
        idx = {p: i for i, p in enumerate(order)}
        out_slots = [idx[p] for p in start.out if p in idx]
        bat_out[:, out_slots] = True
        s_slot = idx.get(start.striker, None)
        ns_slot = idx.get(start.non_striker, None)
        remaining = [i for i in range(11) if i not in out_slots]
        s_slot = s_slot if s_slot is not None else remaining[0]
        ns_slot = ns_slot if ns_slot is not None else next(i for i in remaining if i != s_slot)
        striker[:], non[:] = s_slot, ns_slot
        waiting = [i for i in remaining if i not in (s_slot, ns_slot)]
        queue = np.array(waiting + [11] * 11)
        log["bat_runs"][:, s_slot], log["bat_balls"][:, s_slot] = start.striker_score
        log["bat_runs"][:, ns_slot], log["bat_balls"][:, ns_slot] = start.non_striker_score
        runs[:], wkts[:], legal[:] = start.runs, start.wickets, start.balls
        in_over[:] = start.balls % bpo
        bidx = {p: i for i, p in enumerate(bowlers)}
        for p, o in start.bowler_overs.items():
            if p in bidx:
                used[:, bidx[p]] = o
    else:
        queue = np.array(list(range(2, 11)) + [11] * 11)
    qpos = np.zeros(n, dtype=np.int64)

    def over_of(lg):
        return np.minimum(lg // bpo, overs - 1)

    active = (wkts < 10) & (legal < overs * bpo)
    if target is not None:
        active &= runs < target
    sit = T.sit
    while active.any():
        a = np.flatnonzero(active)
        ov = over_of(legal[a])
        # new over → pick a bowler
        need = (bowler[a] < 0) | ((in_over[a] == 0) & (last_over[a, np.maximum(bowler[a], 0)] != ov))
        if need.any():
            sel = a[need]
            o = over_of(legal[sel])
            dec = np.minimum(o * N_DECILES // overs, N_DECILES - 1)
            w = T.bowl_weights[:, dec].T * (used[sel] < quota)
            if not consecutive_ok:
                prev = bowler[sel]
                has = prev >= 0
                w[np.flatnonzero(has), prev[has]] = 0
            empty = w.sum(1) == 0
            if empty.any():
                w[empty] = (quota - used[sel[empty]] > 0).astype(float) + 1e-9
            b = _choose(rng, w)
            spell[sel] = (last_over[sel, b] < o - 2).astype(np.int64)
            bowler[sel] = b
            last_over[sel, b] = o
            used[sel, b] += 1
        st = striker[a]
        bw = bowler[a]
        bb = log["bat_balls"][a, st]
        L = (T.base[ov, np.minimum(wkts[a], 9)]
             + sit["set"][S.set_bucket(bb)]
             + sit["chase"][S.chase_bucket(np.full(len(a), inn0 + 1), (target[a] - runs[a]) if target is not None else 0,
                                           overs * bpo - legal[a])]
             + sit["mile"][S.milestone_bucket(log["bat_runs"][a, st])]
             + sit["streak"][S.streak_bucket(prev_runs[a, st], prev_bnd[a, st])]
             + sit["dots"][S.dots_bucket(dots[a])]
             + sit["spell"][spell[a]] + sit["freehit"][free_hit[a]]
             + T.pair[st, bw])
        if conditions is not None:
            L += conditions[a]
        L -= L.max(1, keepdims=True)
        P = np.exp(L)
        y = _choose(rng, P)
        fh_now = free_hit[a].astype(bool)
        free_hit[a] = 0

        is_wide, is_nb, is_bye, is_w = y == S.WIDE, y == S.NOBALL, y == S.BYE, y == S.WKT
        bat_r = S.BAT_RUNS[y].astype(np.int64)
        if is_nb.any():                                   # runs off the bat from a no-ball
            nbp = P[is_nb][:, S.BATTING_CLASSES]
            bat_r[is_nb] = S.BAT_RUNS[S.BATTING_CLASSES[_choose(rng, nbp)]]
            free_hit[a[is_nb]] = 1
        ext = np.zeros(len(a), dtype=np.int64)
        if is_wide.any():
            ext[is_wide] = 1 + _choose(rng, np.broadcast_to(T.wide_runs, (is_wide.sum(), 5)))
            extras[a[is_wide], 0] += ext[is_wide]
        if is_nb.any():
            ext[is_nb] = 1
            extras[a[is_nb], 1] += 1
        if is_bye.any():
            ext[is_bye] = 1 + _choose(rng, np.broadcast_to(T.bye_runs, (is_bye.sum(), 4)))
            extras[a[is_bye], 2] += ext[is_bye]
        total = bat_r + ext
        lg = ~(is_wide | is_nb)
        faced = ~is_wide
        runs[a] += total
        o_idx = ov
        over_runs[a, o_idx] += total
        log["bat_runs"][a, st] += bat_r
        log["bat_balls"][a, st] += faced
        log["bat_4s"][a, st] += (bat_r == 4)
        log["bat_6s"][a, st] += (bat_r == 6)
        conceded = bat_r + np.where(is_wide | is_nb, ext, 0)
        log["bowl_runs"][a, bw] += conceded
        log["bowl_balls"][a, bw] += lg
        dots[a] = np.where(lg & (total == 0), dots[a] + 1, 0)      # same definition as the Pattern Lab
        upd = faced
        prev_runs[a[upd], st[upd]] = bat_r[upd]
        prev_bnd[a[upd], st[upd]] = (bat_r[upd] >= 4)

        if is_w.any():
            wa = a[is_w]
            kprob = T.dismissal[bw[is_w]]
            kind = _choose(rng, kprob)
            kind = np.where(fh_now[is_w], RUN_OUT, kind)
            ro = kind == RUN_OUT
            ns_out = ro & (rng.random(len(wa)) < T.runout_ns)
            out_slot = np.where(ns_out, non[wa], striker[wa])
            credited = np.where(BOWLER_DISMISSALS[kind], bw[is_w], -1)
            bat_out[wa, out_slot] = True
            bat_kind[wa, out_slot] = kind
            bat_by[wa, out_slot] = credited
            log["bowl_wkts"][wa[credited >= 0], credited[credited >= 0]] += 1
            k = wkts[wa]
            fow_ball[wa, k] = legal[wa] + 1
            fow_runs[wa, k] = runs[wa]
            fow_slot[wa, k] = out_slot
            fow_bowler[wa, k] = credited
            wkts[wa] += 1
            over_wkts[wa, ov[is_w]] += 1
            # next batter in
            nb_slot = queue[np.minimum(qpos[wa], len(queue) - 1)]
            qpos[wa] += 1
            striker[wa] = np.where(out_slot == striker[wa], nb_slot, striker[wa])
            non[wa] = np.where(out_slot == non[wa], nb_slot, non[wa])
        # strike rotation on odd runs (completed runs; boundaries are even except 5s, ignored)
        odd = ((bat_r + np.where(is_bye | is_wide, ext - (is_wide.astype(int)), 0)) % 2 == 1) & ~is_w
        sw = a[odd]
        striker[sw], non[sw] = non[sw], striker[sw].copy()
        legal[a] += lg
        in_over[a] = np.where(lg, in_over[a] + 1, in_over[a])
        end_over = a[in_over[a] == bpo]
        in_over[end_over] = 0
        striker[end_over], non[end_over] = non[end_over], striker[end_over].copy()

        active = (wkts < 10) & (legal < overs * bpo) & (striker < 11) & (non < 11)
        if target is not None:
            active &= runs < target
    out = dict(runs=runs, wkts=wkts, legal=legal, extras=extras, over_runs=over_runs, over_wkts=over_wkts,
               bat_out=bat_out, bat_kind=bat_kind, bat_by=bat_by, fow_ball=fow_ball, fow_runs=fow_runs,
               fow_slot=fow_slot, fow_bowler=fow_bowler, **log)
    return out


def _order(spec: MatchSpec, sc: Scenario, team: int) -> list[str]:
    return list(sc.batting_order.get(team) or spec.teams[team].players)


def simulate(model: Model, spec: MatchSpec, n: int = 10_000, scenario: Scenario | None = None,
             seed: int | None = None) -> MatchSims:
    sc = scenario or Scenario()
    rng = np.random.default_rng(seed)
    rules = spec.rules
    if sc.start is not None or spec.batting_first is not None:
        firsts = [(spec.batting_first or 0, n)]
    else:
        firsts = [(0, n - n // 2), (1, n // 2)]
    parts = []
    for bf, m in firsts:
        if m == 0:
            continue
        teams = (bf, 1 - bf)
        logs = []
        # one draw of match conditions per simulation, shared by both innings (same pitch, same day)
        sd = model.meta.get("fit", {}).get("conditions_sd", {}) if sc.conditions else {}
        cond = np.zeros((m, S.K))
        if sd:
            zb = rng.normal(-0.5 * sd.get("boundary", 0) ** 2, sd.get("boundary", 0), m)
            zw = rng.normal(-0.5 * sd.get("wicket", 0) ** 2, sd.get("wicket", 0), m)
            cond[:, [S.FOUR, S.SIX]] = zb[:, None]
            cond[:, S.WKT] = zw
        start = sc.start
        first_total = None
        for inn0, bat in enumerate(teams):
            order, bowlers = _order(spec, sc, bat), list(spec.teams[1 - bat].players)
            T = _Tables(model, spec, sc, inn0, order, bowlers, spec.teams[1 - bat].bowlers)
            st = start if (start is not None and start.innings == inn0 + 1) else None
            if inn0 == 0 and start is not None and start.innings == 2:
                total = np.full(m, start.first_innings_total or 0)
                res = _empty_innings(m, rules, total)
            else:
                target = None
                if inn0 == 1:
                    target = np.full(m, sc.target) if sc.target else first_total + 1
                res = simulate_innings(rng, T, m, rules, inn0, target, st, order, bowlers, cond)
            logs.append(InningsLog(batting=bat, order=order, bowlers=bowlers, **res))
            first_total = logs[0].runs
        r1 = np.full(m, sc.target - 1) if sc.target else logs[0].runs
        r2 = logs[1].runs
        tie = r1 == r2
        coin = rng.random(m) < 0.5
        winner = np.where(r2 > r1, teams[1], np.where(r1 > r2, teams[0], np.where(coin, 0, 1)))
        parts.append(Part(batting_first=bf, n=m, innings=(logs[0], logs[1]), winner=winner, tie=tie))
    return MatchSims(spec=spec, scenario=sc, parts=parts, rules=rules)


def _empty_innings(n: int, rules: dict, total: np.ndarray) -> dict:
    z = lambda *s: np.zeros((n, *s), dtype=np.int64)  # noqa: E731
    m1 = lambda *s: np.full((n, *s), -1, dtype=np.int64)  # noqa: E731
    return dict(runs=total.astype(np.int64), wkts=z(), legal=z(), extras=z(3), over_runs=z(rules["overs"]),
                over_wkts=z(rules["overs"]), bat_out=np.zeros((n, 11), dtype=bool), bat_kind=m1(11), bat_by=m1(11),
                fow_ball=m1(10), fow_runs=m1(10), fow_slot=m1(10), fow_bowler=m1(10),
                **{k: z(11) for k in ("bat_runs", "bat_balls", "bat_4s", "bat_6s", "bowl_balls", "bowl_runs", "bowl_wkts")})
