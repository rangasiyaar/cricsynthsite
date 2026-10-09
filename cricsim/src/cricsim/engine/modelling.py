"""Decision models on top of the simulator: live win probability, par scores, chase curves, toss calls,
scenario and lineup comparisons, player impact, batting order and bowling plans, fantasy projections.

Comparisons use common random numbers (same seed for every variant), so differences come from the change,
not from simulation noise.
"""
from __future__ import annotations

import numpy as np

from cricsim.engine import states as S
from cricsim.engine.insight import PHASES, WICKET_RUNS, ctx, who
from cricsim.engine.model import Model
from cricsim.engine.simulate import MatchSims, simulate
from cricsim.engine.spec import MatchSpec, Scenario, StartState, TeamSpec
from cricsim.engine.summary import _dist, _r, phases, summarize

SEED = 7


def _team_runs(sims: MatchSims, team: int) -> np.ndarray:
    return np.concatenate([lg.runs for p in sims.parts for lg in p.innings if lg.batting == team])


def _wins(sims: MatchSims) -> np.ndarray:
    return np.concatenate([p.winner for p in sims.parts])


def _short(sims: MatchSims, model: Model) -> dict:
    """Compact result: win %, median and 80% range of each side's score."""
    win = _wins(sims)
    out = {"simulations": sims.n, "win": {}, "score": {}}
    for t in (0, 1):
        name = sims.spec.teams[t].name
        r = _team_runs(sims, t)
        out["win"][name] = _r((win == t).mean(), 4)
        out["score"][name] = {"median": _r(np.median(r), 0), "q10": _r(np.percentile(r, 10), 0),
                              "q90": _r(np.percentile(r, 90), 0)}
    return out


def _delta(a: dict, b: dict) -> dict:
    return {"win": {k: _r(b["win"][k] - a["win"][k], 4) for k in a["win"]},
            "median_score": {k: _r((b["score"][k]["median"] or 0) - (a["score"][k]["median"] or 0), 0) for k in a["score"]}}


# ── live state ─────────────────────────────────────────────────────────────────

def state_scenario(spec: MatchSpec, innings: int, runs: int, wickets: int, overs: float,
                   target: int | None = None, batting_first: int = 0, base: Scenario | None = None) -> tuple[MatchSpec, Scenario]:
    """Overs as cricket notation (12.3 = 12 overs 3 balls)."""
    bpo = spec.rules["bpo"]
    whole = int(overs)
    balls = whole * bpo + int(round((overs - whole) * 10))
    sc = base or Scenario()
    sc.start = StartState(innings=innings, runs=runs, wickets=wickets, balls=min(balls, spec.rules["overs"] * bpo),
                          first_innings_total=(target - 1) if (innings == 2 and target) else None)
    spec.batting_first = batting_first
    return spec, sc


def win_probability(model: Model, spec: MatchSpec, sc: Scenario, n: int = 4000) -> dict:
    sims = simulate(model, spec, n=n, scenario=sc, seed=SEED)
    st = sc.start
    bat = spec.batting_first if st.innings == 1 else 1 - spec.batting_first
    out = _short(sims, model)
    final = _team_runs(sims, bat)
    out["state"] = {"innings": st.innings, "batting": spec.teams[bat].name, "runs": st.runs, "wickets": st.wickets,
                    "balls": st.balls, "target": (st.first_innings_total + 1) if st.innings == 2 else None}
    out["projected_total"] = _dist(final)
    if st.innings == 2:
        need = st.first_innings_total + 1 - st.runs
        left = spec.rules["overs"] * spec.rules["bpo"] - st.balls
        out["required"] = {"runs": need, "balls": left, "rate": _r(6 * need / max(left, 1), 2)}
    return out


def innings_projection(model: Model, spec: MatchSpec, sc: Scenario, n: int = 4000,
                       thresholds: list[int] | None = None) -> dict:
    sims = simulate(model, spec, n=n, scenario=sc, seed=SEED)
    st = sc.start
    bat = spec.batting_first if st.innings == 1 else 1 - spec.batting_first
    lg = [lg for p in sims.parts for lg in p.innings if lg.batting == bat][0]
    final = lg.runs
    lo = int(np.percentile(final, 5) // 10 * 10)
    th = thresholds or list(range(lo, lo + 90, 10))
    overs = spec.rules["overs"]
    done = st.balls // spec.rules["bpo"]
    per_over = lg.over_runs[:, done:].mean(0)
    return {"team": spec.teams[bat].name, "innings": st.innings, "from": {"runs": st.runs, "wickets": st.wickets,
                                                                           "balls": st.balls},
            "final_total": _dist(final), "final_wickets": _dist(lg.wkts),
            "p_at_least": {str(t): _r((final >= t).mean(), 4) for t in th},
            "p_all_out": _r((lg.wkts >= 10).mean(), 4),
            "expected_runs_by_over": [{"over": done + k + 1, "runs": _r(v, 2)} for k, v in enumerate(per_over)][: overs - done],
            "simulations": sims.n}


# ── pre-match decisions ────────────────────────────────────────────────────────

def par_score(model: Model, spec: MatchSpec, n: int = 6000) -> dict:
    """Median first-innings score for each side batting first, and the totals that make it 50/60/70% to win."""
    out = {"teams": []}
    for bf in (0, 1):
        spec.batting_first = bf
        sims = simulate(model, spec, n=n, scenario=Scenario(), seed=SEED + bf)
        first = _team_runs(sims, bf)
        won = _wins(sims) == bf
        order = np.argsort(first)
        fs, ws = first[order], won[order].astype(float)
        k = max(len(fs) // 25, 50)
        smooth = np.convolve(ws, np.ones(k) / k, mode="same")             # P(win | first-innings total), smoothed

        def needed(p):
            hit = np.flatnonzero(smooth >= p)
            return int(fs[hit[0]]) if len(hit) else None
        out["teams"].append({"batting_first": spec.teams[bf].name, "first_innings": _dist(first),
                             "par": _r(np.median(first), 0), "win_batting_first": _r(won.mean(), 4),
                             "score_for_win_probability": {"50%": needed(0.5), "60%": needed(0.6), "70%": needed(0.7)}})
    spec.batting_first = None
    return out


def chase_curve(model: Model, spec: MatchSpec, chasing: int, targets: list[int], n: int = 800) -> dict:
    rows = []
    for t in targets:
        spec.batting_first = 1 - chasing
        sc = Scenario(start=StartState(innings=2, runs=0, wickets=0, balls=0, first_innings_total=t - 1))
        sims = simulate(model, spec, n=n, scenario=sc, seed=SEED)
        win = (_wins(sims) == chasing).mean()
        lg = [lg for p in sims.parts for lg in p.innings if lg.batting == chasing][0]
        rows.append({"target": t, "chase_success": _r(win, 4), "median_balls_left_when_won":
                     _r(np.median((spec.rules["overs"] * spec.rules["bpo"] - lg.legal)[lg.runs >= t]), 0)
                     if (lg.runs >= t).any() else None})
    spec.batting_first = None
    even = next((r["target"] for r in rows if (r["chase_success"] or 0) < 0.5), None)
    return {"chasing": spec.teams[chasing].name, "curve": rows, "coin_flip_target": even,
            "simulations_per_target": n}


def toss(model: Model, spec: MatchSpec, n: int = 6000) -> dict:
    spec.batting_first = None
    sims = simulate(model, spec, n=n, scenario=Scenario(), seed=SEED)
    res = summarize(sims, model)["result"]
    out = []
    for t in (0, 1):
        name = spec.teams[t].name
        bat = next(b for b in res["by_toss"] if b["batting_first"] == name)["win"][name]
        chase = next(b for b in res["by_toss"] if b["batting_first"] != name)["win"][name]
        out.append({"team": name, "win_batting_first": bat, "win_chasing": chase,
                    "choose": "bat" if bat > chase else "bowl", "edge": _r(abs(bat - chase), 4)})
    return {"teams": out, "simulations": n}


def compare_scenarios(model: Model, spec: MatchSpec, base: Scenario, alt: Scenario, n: int = 4000) -> dict:
    a = _short(simulate(model, spec, n=n, scenario=base, seed=SEED), model)
    b = _short(simulate(model, spec, n=n, scenario=alt, seed=SEED), model)
    return {"base": a, "scenario": b, "change": _delta(a, b)}


def _replace(spec: MatchSpec, out_pid: str, in_pid: str) -> tuple[MatchSpec, int]:
    for k, t in enumerate(spec.teams):
        if out_pid in t.players:
            players = [in_pid if p == out_pid else p for p in t.players]
            bowl = [in_pid if p == out_pid else p for p in t.bowlers] if t.bowlers else None
            teams = list(spec.teams)
            teams[k] = TeamSpec(t.name, players, bowl, t.team_id)
            return MatchSpec(spec.format, spec.gender, tuple(teams), spec.venue_id, spec.comp_key,
                             spec.batting_first, spec.overs, spec.attributes), k
    raise ValueError(f"{out_pid} is not in either XI")


def swap(model: Model, spec: MatchSpec, out_pid: str, in_pid: str, n: int = 4000) -> dict:
    alt, k = _replace(spec, out_pid, in_pid)
    a = _short(simulate(model, spec, n=n, seed=SEED), model)
    b = _short(simulate(model, alt, n=n, seed=SEED), model)
    team = spec.teams[k].name
    return {"team": team, "out": who(model, out_pid), "in": who(model, in_pid), "before": a, "after": b,
            "change": _delta(a, b), "win_change_for_team": _r(b["win"][team] - a["win"][team], 4)}


def player_impact(model: Model, spec: MatchSpec, pid: str, n: int = 4000) -> dict:
    """Win probability the player adds over a replacement-level newcomer in the same slot."""
    r = swap(model, spec, pid, "__replacement__", n)
    return {"player": who(model, pid), "team": r["team"], "win_with": r["before"]["win"][r["team"]],
            "win_without": r["after"]["win"][r["team"]], "win_added": _r(-r["win_change_for_team"], 4),
            "runs_added": _r(-r["change"]["median_score"][r["team"]], 0), "simulations": n}


def batting_order(model: Model, spec: MatchSpec, team: int, n: int = 2500, max_candidates: int = 12) -> dict:
    """Try the given order, every adjacent swap in the top eight, and each batter promoted to No. 3."""
    base = list(spec.teams[team].players)
    cands = [base]
    for i in range(7):
        o = base[:]
        o[i], o[i + 1] = o[i + 1], o[i]
        cands.append(o)
    for j in range(3, 8):
        o = base[:]
        o.insert(2, o.pop(j))
        cands.append(o)
    seen, uniq = set(), []
    for o in cands:
        if tuple(o) not in seen:
            seen.add(tuple(o))
            uniq.append(o)
    rows = []
    for o in uniq[:max_candidates]:
        sc = Scenario(batting_order={team: o})
        sims = simulate(model, spec, n=n, scenario=sc, seed=SEED)
        runs = _team_runs(sims, team)
        rows.append({"order": [who(model, p)["name"] for p in o], "ids": o,
                     "win": _r((_wins(sims) == team).mean(), 4), "median_score": _r(np.median(runs), 0),
                     "mean_score": _r(runs.mean(), 1)})
    base_row = rows[0]
    rows.sort(key=lambda r: (-r["win"], -r["mean_score"]))
    for r in rows:
        r["win_vs_given"] = _r(r["win"] - base_row["win"], 4)
    return {"team": spec.teams[team].name, "given": base_row, "best": rows[0], "candidates": rows,
            "simulations_per_order": n,
            "note": "Differences under about 1 percentage point are within simulation noise."}


def bowling_plan(model: Model, spec: MatchSpec, bowling_team: int, bowlers: list[str] | None = None) -> dict:
    """Assign each over to the bowler with the best expected value against the batters likely to be in,
    within the quota and without consecutive overs."""
    c = ctx(model, spec.format)
    rules = spec.rules
    bat = spec.teams[1 - bowling_team].players
    pool = bowlers or spec.teams[bowling_team].bowlers or [
        p for p in spec.teams[bowling_team].players if model.knows(p) and model.usage[model.pid(p), c.fam].sum() >= 0.5]
    if len(pool) < 2:
        raise ValueError("need at least two bowlers")
    wv = WICKET_RUNS["od" if c.fam else "short"]
    in_phase = {"powerplay": bat[:3], "middle": bat[2:7], "death": bat[5:9]}
    value = {}
    for ph in PHASES:
        sit = c.situation(spec.gender, ph)
        for w in pool:
            qs = [c.probs(sit, batter=b, bowler=w) for b in in_phase[ph]]
            q = np.mean(qs, 0)
            m = c.bowling(q)
            value[(ph, w)] = {"economy": m["economy"], "balls_per_wicket": m["balls_per_wicket"],
                              "net": (m["economy"] or 0) - wv * 6 * q[S.WKT] / q[S.LEGAL].sum()}
    ph_of = {}
    for name, a, b in phases(rules):
        for o in range(a, b):
            ph_of[o] = name.lower()
    quota = {w: rules["quota"] for w in pool}
    plan, prev = [], None
    # hardest overs first (death, then powerplay), so specialists are kept for them
    order = sorted(range(rules["overs"]), key=lambda o: {"death": 0, "powerplay": 1, "middle": 2}[ph_of[o]])
    assigned = {}
    for o in order:
        opts = [w for w in pool if quota[w] > 0 and assigned.get(o - 1) != w and assigned.get(o + 1) != w]
        if not opts:
            opts = [w for w in pool if quota[w] > 0] or pool
        w = min(opts, key=lambda x: value[(ph_of[o], x)]["net"])
        assigned[o] = w
        quota[w] -= 1
    for o in range(rules["overs"]):
        w = assigned[o]
        v = value[(ph_of[o], w)]
        plan.append({"over": o + 1, "phase": ph_of[o], "bowler": who(model, w)["name"], "id": w,
                     "expected_economy": v["economy"]})
        prev = w
    del prev
    summary = []
    for w in pool:
        overs = [p["over"] for p in plan if p["id"] == w]
        summary.append({**who(model, w), "overs": len(overs), "which": overs,
                        "by_phase": {ph: value[(ph, w)] for ph in PHASES}})
    exp = sum(p["expected_economy"] or 0 for p in plan)
    return {"bowling_team": spec.teams[bowling_team].name, "plan": plan, "bowlers": summary,
            "expected_runs_conceded": _r(exp, 0)}


# ── fantasy ────────────────────────────────────────────────────────────────────

def infer_roles(model: Model, spec: MatchSpec, roles: dict[str, str] | None = None) -> dict[str, str]:
    fam = 1 if spec.format == "OD" else 0
    out = dict(roles or {})
    for t in spec.teams:
        for pos, p in enumerate(t.players, 1):
            if p in out:
                continue
            ov = float(model.usage[model.pid(p), fam].sum()) if model.knows(p) else 0.0
            out[p] = "BOWL" if ov >= 2.5 and pos >= 7 else "AR" if ov >= 1.0 else "BAT"
    return out


def fantasy_projections(model: Model, spec: MatchSpec, roles: dict[str, str] | None = None, n: int = 4000,
                        sc: Scenario | None = None):
    from cricsim.fantasy import sim_points
    sims = simulate(model, spec, n=n, scenario=sc or Scenario(), seed=SEED)
    roles = infer_roles(model, spec, roles)
    pids, pts = sim_points(sims, roles)
    team_of = {p: k for k, t in enumerate(spec.teams) for p in t.players}
    best = pts.argmax(1)
    rows = []
    for j, p in enumerate(pids):
        x = pts[:, j]
        rows.append({**who(model, p), "team": spec.teams[team_of[p]].name, "role": roles.get(p),
                     "mean": _r(x.mean(), 1), "median": _r(np.median(x), 1), "p10": _r(np.percentile(x, 10), 1),
                     "p90": _r(np.percentile(x, 90), 1), "p_top_scorer": _r((best == j).mean(), 4)})
    rows.sort(key=lambda r: -r["mean"])
    return {"players": rows, "simulations": n,
            "scoring": "Dream11-style T20 points without catches, run-outs and maidens (not simulated per fielder)"}, \
        (pids, pts, roles, team_of)


def fantasy_team(model: Model, spec: MatchSpec, roles=None, n: int = 4000, captain: str = "mean") -> dict:
    from cricsim.fantasy import pick_xi
    proj, (pids, pts, roles, team_of) = fantasy_projections(model, spec, roles, n)
    mean = dict(zip(pids, pts.mean(0)))
    cap = dict(zip(pids, np.percentile(pts, 90, axis=0))) if captain == "upside" else None
    use_roles = roles if any(r == "WK" for r in roles.values()) else None
    xi, c, vc = pick_xi(mean, team_of, use_roles, captain_score=cap)
    name = {p: who(model, p)["name"] for p in pids}
    expected = sum(mean[p] for p in xi) + mean[c] + 0.5 * mean[vc]
    return {"xi": [{"id": p, "name": name[p], "team": spec.teams[team_of[p]].name, "role": roles.get(p),
                    "expected": _r(mean[p], 1)} for p in sorted(xi, key=lambda q: -mean[q])],
            "captain": name[c], "vice_captain": name[vc], "expected_points": _r(expected, 1),
            "captain_rule": captain, "simulations": n}


def fantasy_portfolio(model: Model, spec: MatchSpec, k: int = 5, roles=None, n: int = 4000) -> dict:
    from cricsim.fantasy import portfolio
    proj, (pids, pts, roles, team_of) = fantasy_projections(model, spec, roles, n)
    use_roles = roles if any(r == "WK" for r in roles.values()) else None
    teams = portfolio(pids, pts, team_of, k, use_roles)
    name = {p: who(model, p)["name"] for p in pids}
    col = {p: i for i, p in enumerate(pids)}
    best = None
    out = []
    for xi, c, vc in teams:
        s = pts[:, [col[p] for p in xi]].sum(1) + pts[:, col[c]] + 0.5 * pts[:, col[vc]]
        best = s if best is None else np.maximum(best, s)
        out.append({"xi": [name[p] for p in xi], "captain": name[c], "vice_captain": name[vc],
                    "expected_points": _r(s.mean(), 1)})
    return {"teams": out, "expected_best_of_portfolio": _r(best.mean(), 1) if best is not None else None,
            "simulations": n}
