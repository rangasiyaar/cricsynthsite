"""Python port of the browser engine (app/lib/engine/sim.ts + summary.ts), run on a published engine pack.

The same ball-by-ball model as the Scenario Lab, with the same random-number generator, so a what-if asked through
MCP gives the answer the website gives. Pure standard library: the server installs with nothing but the MCP SDK.
tests/test_parity.py checks it against sim.ts.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

K = 10
DOT, ONE, TWO, THREE, FOUR, SIX, WKT, WIDE, NOBALL, BYE = range(10)
SPIN = {"off_spin", "leg_spin", "left_arm_orthodox", "left_arm_wrist", "slow"}
PACE = {"pace_right", "pace_left"}
PLAN_WEIGHT = 0.01
M32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & M32


def rng(seed: int):
    """mulberry32, bit-for-bit as in sim.ts."""
    a = seed & M32

    def r() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = _imul(a ^ (a >> 15), a | 1)
        t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & M32)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296
    return r


def _normal(r) -> float:
    u, v = max(r(), 1e-12), r()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


def _choose(r, w, n: int | None = None) -> int:
    n = len(w) if n is None else n
    u = r() * sum(w[:n])
    for i in range(n):
        u -= w[i]
        if u < 0:
            return i
    return n - 1


def _bucket(edges, x) -> int:
    i = 0
    while i < len(edges) and x >= edges[i]:
        i += 1
    return i


@dataclass
class Innings:
    overs: int
    runs: int = 0
    wkts: int = 0
    legal: int = 0
    extras: list = field(default_factory=lambda: [0, 0, 0])
    over_runs: list = None
    over_wkts: list = None
    bat_runs: list = field(default_factory=lambda: [0] * 11)
    bat_balls: list = field(default_factory=lambda: [0] * 11)
    bat_fours: list = field(default_factory=lambda: [0] * 11)
    bat_sixes: list = field(default_factory=lambda: [0] * 11)
    bat_out: list = field(default_factory=lambda: [0] * 11)
    bat_kind: list = field(default_factory=lambda: [-1] * 11)
    bat_by: list = field(default_factory=lambda: [-1] * 11)
    bowl_balls: list = field(default_factory=lambda: [0] * 11)
    bowl_runs: list = field(default_factory=lambda: [0] * 11)
    bowl_wkts: list = field(default_factory=lambda: [0] * 11)
    fow_ball: list = field(default_factory=lambda: [-1] * 10)

    def __post_init__(self):
        self.over_runs = [0] * self.overs
        self.over_wkts = [0] * self.overs


@dataclass
class Prepared:
    pair: list            # [(i*11+j)] -> list of K logits
    weights: list
    dismissal: list
    kinds: list
    order: list
    bowlers: list


def prepare(pack: dict, team: int, inn0: int, sc: dict) -> Prepared:
    """Apply scenario levers to the neutral pair table (prepare() in sim.ts)."""
    b = next(x for x in pack["batting"] if x["team"] == team)
    lb, lw = math.log(sc.get("boundaryMult") or 1), math.log(sc.get("wicketMult") or 1)
    le, dew = math.log(sc.get("extrasMult") or 1), sc.get("dew") or 0
    form = sc.get("playerForm") or {}
    pair = []
    for i in range(11):
        for j in range(11):
            o = list(b["pair"][i][j])
            o[FOUR] += lb; o[SIX] += lb; o[WKT] += lw
            o[WIDE] += le; o[NOBALL] += le; o[BYE] += le
            kind = b["bowlerKinds"][j]
            if kind in SPIN:
                o[WKT] += math.log(sc.get("spinWicketMult") or 1) + (math.log(1 - 0.3 * dew) if inn0 == 1 else 0)
            if kind in PACE:
                o[WKT] += math.log(sc.get("paceWicketMult") or 1)
            if inn0 == 1 and dew:
                o[FOUR] += math.log(1 + 0.1 * dew); o[SIX] += math.log(1 + 0.1 * dew)
            fb = form.get(b["order"][i])
            if fb:
                l = math.log(fb); o[WKT] -= l; o[FOUR] += 0.5 * l; o[SIX] += 0.5 * l
            fw = form.get(b["bowlers"][j])
            if fw:
                l = math.log(fw); o[WKT] += l; o[FOUR] -= 0.5 * l; o[SIX] -= 0.5 * l
            pair.append(o)
    excluded = set(sc.get("excludeBowlers") or [])
    weights = [[0] * len(row) if b["bowlers"][j] in excluded else row for j, row in enumerate(b["bowlWeights"])]
    if all(v == 0 for row in weights for v in row):
        weights = b["bowlWeights"]
    return Prepared(pair, weights, b["dismissal"], b["bowlerKinds"], b["order"], b["bowlers"])


def simulate_innings(pack: dict, P: Prepared, inn0: int, target: int | None, r, cond: list, start: dict | None = None
                     ) -> Innings:
    rules = pack["rules"]
    overs, bpo, quota = rules["overs"], rules["bpo"], rules["quota"]
    consecutive_ok = bpo == 5
    sit, base = pack["situation"], pack["base"][inn0]
    s_set, s_chase, s_mile, s_streak, s_dots, s_spell, s_fh = (sit[k] for k in
                                                               ("set", "chase", "mile", "streak", "dots", "spell", "freehit"))
    e_set, e_chase, e_mile, e_dots = (pack["edges"][k] for k in ("set", "chase", "mile", "dots"))
    bat_runs_of, cls = pack["batRuns"], pack["battingClasses"]
    res = Innings(overs)
    prev_runs, prev_bnd = [-1] * 11, [0] * 11
    last_over, used = [-9] * 11, [0] * 11
    striker, non, queue, qpos = 0, 1, list(range(2, 11)), 0
    if start:
        idx = {p: i for i, p in enumerate(P.order)}
        out_slots = [idx[p] for p in (start.get("out") or []) if p in idx]
        for s in out_slots:
            res.bat_out[s] = 1
        remaining = [i for i in range(11) if i not in out_slots]
        striker = idx.get(start.get("striker") or "", remaining[0])
        non = idx.get(start.get("nonStriker") or "", next(i for i in remaining if i != striker))
        queue = [i for i in remaining if i != striker and i != non]
        res.runs, res.wkts, res.legal = start["runs"], start["wickets"], start["balls"]
    plan = [r() < min(1, sum(row) / len(row) / PLAN_WEIGHT) for row in P.weights]
    in_over, bowler, spell, free_hit, dots = res.legal % bpo, -1, 0, 0, 0
    max_balls = overs * bpo
    w = [0.0] * 11
    while res.wkts < 10 and res.legal < max_balls and striker < 11 and non < 11 and (target is None or res.runs < target):
        ov = min(res.legal // bpo, overs - 1)
        if bowler < 0 or (in_over == 0 and last_over[bowler] != ov):
            dec = min(ov * 10 // overs, 9)
            anyw = 0
            for pass_ in (0, 1):
                if anyw:
                    break
                for j in range(11):
                    w[j] = (P.weights[j][dec] if used[j] < quota and (consecutive_ok or j != bowler)
                            and (pass_ == 1 or plan[j]) else 0)
                    anyw += w[j]
            if anyw == 0:
                for j in range(11):
                    w[j] = (1 if used[j] < quota else 0) + 1e-9
            b = _choose(r, w, 11)
            spell = 1 if last_over[b] < ov - 2 else 0
            bowler = b; last_over[b] = ov; used[b] += 1
        st, bw = striker, bowler
        sb = _bucket(e_set, res.bat_balls[st])
        cb = (_bucket(e_chase, 6 * (target - res.runs) / max(max_balls - res.legal, 1)) + 1
              if inn0 == 1 and target is not None else 0)
        mb = _bucket(e_mile, res.bat_runs[st])
        pr = prev_runs[st]
        stb = 0 if pr < 0 else 3 if prev_bnd[st] and pr == 4 else 4 if prev_bnd[st] and pr == 6 else 1 if pr == 0 else 2
        db = _bucket(e_dots, dots)
        L = [a + b_ + c + d + e + f + g + h + i_ + j_ for a, b_, c, d, e, f, g, h, i_, j_ in
             zip(base[ov][min(res.wkts, 9)], s_set[sb], s_chase[cb], s_mile[mb], s_streak[stb], s_dots[db],
                 s_spell[spell], s_fh[free_hit], P.pair[st * 11 + bw], cond)]
        mx = max(L)
        L = [math.exp(x - mx) for x in L]
        y = _choose(r, L, K)
        fh_now = free_hit == 1
        free_hit = 0
        bat_r, ext = bat_runs_of[y], 0
        if y == NOBALL:
            sub = _choose(r, [L[c] for c in cls])
            bat_r = bat_runs_of[cls[sub]]
            free_hit = 1; ext = 1; res.extras[1] += 1
        elif y == WIDE:
            ext = 1 + _choose(r, pack["wideRuns"]); res.extras[0] += ext
        elif y == BYE:
            ext = 1 + _choose(r, pack["byeRuns"]); res.extras[2] += ext
        total, legal, faced = bat_r + ext, y not in (WIDE, NOBALL), y != WIDE
        res.runs += total; res.over_runs[ov] += total
        res.bat_runs[st] += bat_r
        if bat_r == 4:
            res.bat_fours[st] += 1
        elif bat_r == 6:
            res.bat_sixes[st] += 1
        if faced:
            res.bat_balls[st] += 1; prev_runs[st] = bat_r; prev_bnd[st] = 1 if bat_r >= 4 else 0
        res.bowl_runs[bw] += bat_r + (ext if y in (WIDE, NOBALL) else 0)
        if legal:
            res.bowl_balls[bw] += 1
        dots = dots + 1 if legal and total == 0 else 0
        if y == WKT:
            kind = _choose(r, P.dismissal[bw])
            if fh_now:
                kind = pack["runOut"]
            ns_out = kind == pack["runOut"] and r() < pack["runoutNonStriker"]
            out_slot = non if ns_out else striker
            credited = bw if pack["bowlerDismissals"][kind] else -1
            res.bat_out[out_slot] = 1; res.bat_kind[out_slot] = kind; res.bat_by[out_slot] = credited
            if credited >= 0:
                res.bowl_wkts[credited] += 1
            res.fow_ball[res.wkts] = res.legal + 1
            res.wkts += 1; res.over_wkts[ov] += 1
            nb = queue[qpos] if qpos < len(queue) else 11
            qpos += 1
            if out_slot == striker:
                striker = nb
            else:
                non = nb
        else:
            ran = bat_r + (ext if y == BYE else ext - 1 if y == WIDE else 0)
            if ran % 2 == 1:
                striker, non = non, striker
        if legal:
            res.legal += 1; in_over += 1
            if in_over == bpo:
                in_over = 0; striker, non = non, striker
    return res


@dataclass
class MatchSim:
    batting_first: int
    innings: tuple
    winner: int
    tie: bool


def simulate_matches(pack: dict, n: int, sc: dict | None = None, seed: int = 1) -> list[MatchSim]:
    """n full matches (simulateMatches in sim.ts). battingFirst None = half each way."""
    sc = sc or {}
    r = rng(seed)
    out = []
    sd = {} if sc.get("conditions") is False else (pack.get("conditionsSd") or {})
    cache: dict = {}

    def prep(team, inn0):
        if (team, inn0) not in cache:
            cache[(team, inn0)] = prepare(pack, team, inn0, sc)
        return cache[(team, inn0)]
    start = sc.get("start")
    for i in range(n):
        bf = sc.get("battingFirst")
        if bf is None:
            bf = 0 if start else (0 if i < n - n // 2 else 1)
        cond = [0.0] * K
        if sd.get("boundary"):
            z = -0.5 * sd["boundary"] ** 2 + sd["boundary"] * _normal(r)
            cond[FOUR] = z; cond[SIX] = z
        if sd.get("wicket"):
            cond[WKT] = -0.5 * sd["wicket"] ** 2 + sd["wicket"] * _normal(r)
        if start and start.get("innings") == 2:
            first = Innings(pack["rules"]["overs"], runs=start.get("firstInningsTotal") or 0)
        else:
            first = simulate_innings(pack, prep(bf, 0), 0, None, r, cond, start)
        target = sc.get("target") or first.runs + 1
        second = simulate_innings(pack, prep(1 - bf, 1), 1, target, r, cond,
                                  start if start and start.get("innings") == 2 else None)
        r1 = sc["target"] - 1 if sc.get("target") else first.runs
        r2 = second.runs
        tie = r1 == r2
        winner = (1 - bf) if r2 > r1 else bf if r1 > r2 else (0 if r() < 0.5 else 1)
        out.append(MatchSim(bf, (first, second), winner, tie))
    return out


# ── summaries ──────────────────────────────────────────────────────────────────────────────────────────────────

def _quant(a, q):
    if not a:
        return 0
    s = sorted(a)
    i = (len(s) - 1) * q
    lo, hi = math.floor(i), math.ceil(i)
    return s[lo] + (s[hi] - s[lo]) * (i - lo)


def dist(a) -> dict:
    return {"mean": round(sum(a) / max(len(a), 1), 2), "q10": _quant(a, .1), "q50": _quant(a, .5), "q90": _quant(a, .9)}


def phase_bounds(overs: int, pp: int):
    death = max(pp, round(overs * 0.8))
    return [("Powerplay", 0, pp), ("Middle", pp, death), ("Death", death, overs)]


def team_innings(m: MatchSim, team: int):
    """(this team's batting innings, the innings this team bowled in)."""
    return (m.innings[0], m.innings[1]) if m.batting_first == team else (m.innings[1], m.innings[0])


def summarize(pack: dict, sims: list[MatchSim]) -> dict:
    """Win chances, scores, phases and player outlooks (summarizeLab in summary.ts)."""
    n = max(len(sims), 1)
    win = [0, 0]
    tie = 0
    for m in sims:
        win[m.winner] += 1
        tie += m.tie
    overs, pp, bpo = pack["rules"]["overs"], pack["rules"]["pp"], pack["rules"]["bpo"]
    teams = []
    for t in (0, 1):
        inns = [team_innings(m, t)[0] for m in sims]
        opp = [team_innings(m, t)[1] for m in sims]
        scores = [x.runs for x in inns]
        phases = []
        for name, a, b in phase_bounds(overs, pp):
            runs = sum(sum(x.over_runs[a:b]) for x in inns)
            wk = sum(sum(x.over_wkts[a:b]) for x in inns)
            phases.append({"phase": name, "overs": f"{a + 1}-{b}", "runs": round(runs / n, 1), "wickets": round(wk / n, 2)})
        fw = [(x.fow_ball[0] - 1) // bpo + 1 for x in inns if x.fow_ball[0] > 0]
        bat = next(x for x in pack["batting"] if x["team"] == t)
        oth = next(x for x in pack["batting"] if x["team"] == 1 - t)
        players = []
        for pid in pack["teams"][t]["players"]:
            s = bat["order"].index(pid) if pid in bat["order"] else -1
            j = oth["bowlers"].index(pid) if pid in oth["bowlers"] else -1
            runs = [x.bat_runs[s] if s >= 0 else 0 for x in inns]
            top = 0.0
            for x in inns:
                best = max(x.bat_runs)
                if best > 0 and s >= 0 and x.bat_runs[s] == best:
                    top += 1 / x.bat_runs.count(best)
            row = {"id": pid, "name": pack["players"].get(pid, {}).get("name", pid),
                   "runs": round(sum(runs) / n, 1), "p_30": round(sum(v >= 30 for v in runs) / n, 3),
                   "p_50": round(sum(v >= 50 for v in runs) / n, 3), "p_top_scorer": round(top / n, 3)}
            if j >= 0 and sum(x.bowl_balls[j] > 0 for x in opp) / n > 0.5:
                wk = [x.bowl_wkts[j] for x in opp]
                row["wickets"] = round(sum(wk) / n, 2)
                row["p_2_wickets"] = round(sum(v >= 2 for v in wk) / n, 3)
            players.append(row)
        teams.append({"name": pack["teams"][t]["name"], "score": dist(scores),
                      "wickets": round(sum(x.wkts for x in inns) / n, 1), "phases": phases,
                      "first_wicket_over": _quant(fw, .5) if fw else None, "players": players})
    return {"simulations": len(sims), "win": {pack["teams"][t]["name"]: round(win[t] / n, 3) for t in (0, 1)},
            "tie": round(tie / n, 3), "teams": teams}


# ── fantasy (Dream11-style T20 table, as in cricsim/fantasy.py) ─────────────────────────────────────────────────

def _bat_points(r, b, f4, f6, out):
    p = r + 4 * f4 + 6 * f6 + (16 if r >= 100 else 12 if r >= 75 else 8 if r >= 50 else 4 if r >= 25 else 0)
    if r == 0 and out:
        p -= 2
    if b >= 10:
        sr = 100 * r / b
        p += (6 if sr > 170 else 4 if sr > 150 else 2 if sr >= 130 else -6 if sr < 50 else -4 if sr < 60
              else -2 if sr <= 70 else 0)
    return p


def _bowl_points(balls, runs, wkts, bowled_lbw):
    p = 30 * wkts + 8 * bowled_lbw + (12 if wkts >= 5 else 8 if wkts == 4 else 4 if wkts == 3 else 0)
    if balls >= 12:
        e = 6 * runs / balls
        p += 6 if e < 5 else 4 if e < 6 else 2 if e <= 7 else -6 if e > 12 else -4 if e > 11 else -2 if e >= 10 else 0
    return p


def fantasy_points(pack: dict, sims: list[MatchSim]) -> dict[str, list[float]]:
    """Points per player per simulated match (catches, run-outs and maidens left out: fielders aren't simulated)."""
    bl = {pack["dismissals"].index(k) for k in ("bowled", "lbw") if k in pack["dismissals"]}
    pts = {p: [] for t in pack["teams"] for p in t["players"]}
    for m in sims:
        got = {p: 4.0 for p in pts}
        for i, inn in enumerate(m.innings):
            team = m.batting_first if i == 0 else 1 - m.batting_first
            b = next(x for x in pack["batting"] if x["team"] == team)
            for s, p in enumerate(b["order"]):
                got[p] += _bat_points(inn.bat_runs[s], inn.bat_balls[s], inn.bat_fours[s], inn.bat_sixes[s], inn.bat_out[s])
            for k, p in enumerate(b["bowlers"]):
                bowled_lbw = sum(1 for s in range(11) if inn.bat_out[s] and inn.bat_by[s] == k and inn.bat_kind[s] in bl)
                got[p] += _bowl_points(inn.bowl_balls[k], inn.bowl_runs[k], inn.bowl_wkts[k], bowled_lbw)
        for p, v in got.items():
            pts[p].append(v)
    return pts
