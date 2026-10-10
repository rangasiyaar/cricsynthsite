"""Decision models for a covered match, run on the user's machine from its engine pack.

Mirrors cricsim/engine/modelling.py (par score, chase curve, toss, scenario comparison, batting order, bowling plan,
fantasy projections / team / portfolio) on the 22 players of a published match. Win probability and innings
projection from a live state are in server.py.
"""
from __future__ import annotations

import random
import statistics

from cricmcp import sim

SEED = 7


def _r(x, nd=4):
    return None if x is None else round(float(x), nd)


def _pct(xs, q):
    return sim._quant(list(xs), q / 100)


def team_runs(sims, team: int) -> list[int]:
    return [sim.team_innings(m, team)[0].runs for m in sims]


def short(pack: dict, sims) -> dict:
    """Compact result: win %, median and 80% range of each side's score (modelling._short)."""
    n = max(len(sims), 1)
    out = {"simulations": len(sims), "win": {}, "score": {}}
    for t in (0, 1):
        name = pack["teams"][t]["name"]
        r = team_runs(sims, t)
        out["win"][name] = _r(sum(m.winner == t for m in sims) / n)
        out["score"][name] = {"median": _r(statistics.median(r), 0), "q10": _r(_pct(r, 10), 0), "q90": _r(_pct(r, 90), 0)}
    return out


def delta(a: dict, b: dict) -> dict:
    return {"win": {k: _r(b["win"][k] - a["win"][k]) for k in a["win"]},
            "median_score": {k: _r((b["score"][k]["median"] or 0) - (a["score"][k]["median"] or 0), 0) for k in a["score"]}}


def par_score(pack: dict, n: int = 3000) -> dict:
    out = {"teams": []}
    for bf in (0, 1):
        sims = sim.simulate_matches(pack, n, {"battingFirst": bf}, SEED + bf)
        first = team_runs(sims, bf)
        won = [m.winner == bf for m in sims]
        pairs = sorted(zip(first, won))
        fs, ws = [p[0] for p in pairs], [float(p[1]) for p in pairs]
        k = max(len(fs) // 25, 50)
        half = k // 2
        pre = [0.0]
        for w in ws:
            pre.append(pre[-1] + w)
        # centred moving average, zero-padded at the ends (numpy.convolve mode="same")
        smooth = [(pre[min(len(ws), i + k - half)] - pre[max(0, i - half)]) / k for i in range(len(ws))]

        def needed(p):
            return next((fs[i] for i, v in enumerate(smooth) if v >= p), None)
        out["teams"].append({"batting_first": pack["teams"][bf]["name"], "first_innings": sim.dist(first),
                             "par": _r(statistics.median(first), 0), "win_batting_first": _r(sum(won) / len(won)),
                             "score_for_win_probability": {"50%": needed(0.5), "60%": needed(0.6), "70%": needed(0.7)}})
    return out


def chase_curve(pack: dict, chasing: int, targets: list[int], n: int = 600) -> dict:
    rules = pack["rules"]
    rows = []
    for t in targets:
        sc = {"battingFirst": 1 - chasing, "target": t,
              "start": {"innings": 2, "runs": 0, "wickets": 0, "balls": 0, "firstInningsTotal": t - 1}}
        sims = sim.simulate_matches(pack, n, sc, SEED)
        won = [m for m in sims if m.innings[1].runs >= t]
        left = [rules["overs"] * rules["bpo"] - m.innings[1].legal for m in won]
        rows.append({"target": t, "chase_success": _r(sum(m.winner == chasing for m in sims) / len(sims)),
                     "median_balls_left_when_won": _r(statistics.median(left), 0) if left else None})
    even = next((r["target"] for r in rows if (r["chase_success"] or 0) < 0.5), None)
    return {"chasing": pack["teams"][chasing]["name"], "curve": rows, "coin_flip_target": even,
            "simulations_per_target": n}


def toss(pack: dict, n: int = 4000) -> dict:
    out = []
    by = {}
    for bf in (0, 1):
        sims = sim.simulate_matches(pack, n // 2, {"battingFirst": bf}, SEED + bf)
        by[bf] = [sum(m.winner == t for m in sims) / len(sims) for t in (0, 1)]
    for t in (0, 1):
        bat, chase = by[t][t], by[1 - t][t]
        out.append({"team": pack["teams"][t]["name"], "win_batting_first": _r(bat), "win_chasing": _r(chase),
                    "choose": "bat" if bat > chase else "bowl", "edge": _r(abs(bat - chase))})
    return {"teams": out, "simulations": n}


def compare(pack: dict, base: dict, alt: dict, n: int = 3000) -> dict:
    a = short(pack, sim.simulate_matches(pack, n, base, SEED))
    b = short(pack, sim.simulate_matches(pack, n, alt, SEED))
    return {"base": a, "scenario": b, "change": delta(a, b)}


def batting_order(pack: dict, team: int, n: int = 1500, max_candidates: int = 12) -> dict:
    """Try the given order, every adjacent swap in the top eight and each batter promoted to No. 3."""
    base = list(next(b for b in pack["batting"] if b["team"] == team)["order"])
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
    name = lambda p: pack["players"].get(p, {}).get("name", p)  # noqa: E731
    rows = []
    for o in uniq[:max_candidates]:
        sims = sim.simulate_matches(pack, n, {"battingOrder": {team: o}}, SEED)
        runs = team_runs(sims, team)
        rows.append({"order": [name(p) for p in o], "win": _r(sum(m.winner == team for m in sims) / len(sims)),
                     "median_score": _r(statistics.median(runs), 0), "mean_score": _r(sum(runs) / len(runs), 1)})
    given = rows[0]
    rows.sort(key=lambda r: (-r["win"], -r["mean_score"]))
    for r in rows:
        r["win_vs_given"] = _r(r["win"] - given["win"])
    return {"team": pack["teams"][team]["name"], "given": given, "best": rows[0], "candidates": rows,
            "simulations_per_order": n, "note": "Differences under about 1 percentage point are within simulation noise."}


def bowling_plan(kit, pack: dict, players: dict, bowling_team: int, gender: str, bowlers: list[str] | None = None,
                 overs_per_match: dict | None = None) -> dict:
    """Each over to the bowler with the best expected value against the batters likely to be in (modelling.bowling_plan).
    `players` maps id -> kit player (or stub)."""
    fmt, rules = pack["format"], pack["rules"]
    bat = pack["teams"][1 - bowling_team]["players"]
    if bowlers:
        pool = bowlers
    else:
        fam = kit.fam(fmt)
        pool = [p for p in pack["teams"][bowling_team]["players"]
                if players[p].get("known", True) and sum((players[p].get("usage") or [[0] * 10] * 2)[fam]) >= 0.5]
    if len(pool) < 2:
        raise ValueError("Need at least two bowlers.")
    wv = kit.c["wicket_runs"]["od" if kit.fam(fmt) else "short"]
    in_phase = {"powerplay": bat[:3], "middle": bat[2:7], "death": bat[5:9]}
    value = {}
    for ph in ("powerplay", "middle", "death"):
        s = kit.sit(fmt, gender, f"phase:{ph}")
        for w in pool:
            qs = [kit.probs(fmt, s, batter=players[b], bowler=players[w]) for b in in_phase[ph]]
            q = [sum(col) / len(qs) for col in zip(*qs)]
            m = kit.bowling(q, fmt)
            legal = sum(v for v, lg in zip(q, kit.legal) if lg)
            value[(ph, w)] = {"economy": m["economy"], "balls_per_wicket": m["balls_per_wicket"],
                              "net": (m["economy"] or 0) - wv * 6 * q[kit.WKT] / legal}
    ph_of = {}
    for nm, a, b in sim.phase_bounds(rules["overs"], rules["pp"]):
        for o in range(a, b):
            ph_of[o] = nm.lower()
    quota = {w: rules["quota"] for w in pool}
    order = sorted(range(rules["overs"]), key=lambda o: {"death": 0, "powerplay": 1, "middle": 2}[ph_of[o]])
    assigned = {}
    for o in order:
        opts = [w for w in pool if quota[w] > 0 and assigned.get(o - 1) != w and assigned.get(o + 1) != w]
        if not opts:
            opts = [w for w in pool if quota[w] > 0] or pool
        w = min(opts, key=lambda x: value[(ph_of[o], x)]["net"])
        assigned[o] = w
        quota[w] -= 1
    plan = [{"over": o + 1, "phase": ph_of[o], "bowler": players[assigned[o]]["name"],
             "expected_economy": value[(ph_of[o], assigned[o])]["economy"]} for o in range(rules["overs"])]
    summary = [{"bowler": players[w]["name"], "bowling_kind": players[w]["bowling_kind"],
                "overs": sum(1 for o in range(rules["overs"]) if assigned[o] == w),
                "which": [o + 1 for o in range(rules["overs"]) if assigned[o] == w],
                "by_phase": {ph: {k: v for k, v in value[(ph, w)].items() if k != "net"}
                             for ph in ("powerplay", "middle", "death")}} for w in pool]
    return {"bowling_team": pack["teams"][bowling_team]["name"], "plan": plan, "bowlers": summary,
            "expected_runs_conceded": _r(sum(p["expected_economy"] or 0 for p in plan), 0)}


# ── fantasy ────────────────────────────────────────────────────────────────────

def pick_xi(score: dict, team_of: dict, captain_score: dict | None = None):
    """Best 11 by score with at least one per side (cricsim.fantasy.pick_xi without roles); C and VC by captain_score."""
    ranked = sorted(score, key=lambda p: -score[p])
    xi = ranked[:11]
    for t in (0, 1):
        if not any(team_of[p] == t for p in xi):
            xi[-1] = next(p for p in ranked if team_of[p] == t)
    cs = captain_score or score
    c, vc = sorted(xi, key=lambda p: -cs[p])[:2]
    return xi, c, vc


def fantasy(pack: dict, n: int = 3000, sc: dict | None = None):
    sims = sim.simulate_matches(pack, n, sc or {}, SEED)
    pts = sim.fantasy_points(pack, sims)
    pids = list(pts)
    team_of = {p: t for t, team in enumerate(pack["teams"]) for p in team["players"]}
    return sims, pids, pts, team_of


def fantasy_projections(pack: dict, roles: dict, n: int = 3000) -> dict:
    sims, pids, pts, team_of = fantasy(pack, n)
    best = [max(pids, key=lambda p: pts[p][i]) for i in range(len(sims))]
    rows = []
    for p in pids:
        x = pts[p]
        rows.append({"id": p, "name": pack["players"].get(p, {}).get("name", p), "team": pack["teams"][team_of[p]]["name"],
                     "role": roles.get(p), "mean": _r(sum(x) / len(x), 1), "median": _r(statistics.median(x), 1),
                     "p10": _r(_pct(x, 10), 1), "p90": _r(_pct(x, 90), 1), "p_top_scorer": _r(best.count(p) / len(sims))})
    rows.sort(key=lambda r: -r["mean"])
    return {"players": rows, "simulations": len(sims),
            "scoring": "Dream11-style T20 points without catches, run-outs and maidens (not simulated per fielder)"}


def fantasy_team(pack: dict, roles: dict, n: int = 3000, captain: str = "mean") -> dict:
    sims, pids, pts, team_of = fantasy(pack, n)
    mean = {p: sum(v) / len(v) for p, v in pts.items()}
    cap = {p: _pct(v, 90) for p, v in pts.items()} if captain == "upside" else None
    xi, c, vc = pick_xi(mean, team_of, cap)
    name = lambda p: pack["players"].get(p, {}).get("name", p)  # noqa: E731
    return {"xi": [{"name": name(p), "team": pack["teams"][team_of[p]]["name"], "role": roles.get(p),
                    "expected": _r(mean[p], 1)} for p in sorted(xi, key=lambda q: -mean[q])],
            "captain": name(c), "vice_captain": name(vc),
            "expected_points": _r(sum(mean[p] for p in xi) + mean[c] + 0.5 * mean[vc], 1),
            "captain_rule": captain, "simulations": len(sims)}


def fantasy_portfolio(pack: dict, k: int = 5, n: int = 3000, n_candidates: int = 300) -> dict:
    """k teams that together cover the likely matches (cricsim.fantasy.portfolio): candidates are the best XI of
    single simulations from one half, judged on how much they raise the portfolio's best score on the other half."""
    sims, pids, pts, team_of = fantasy(pack, n)
    half = len(sims) // 2

    def scores(team):
        xi, c, vc = team
        return [sum(pts[p][i] for p in xi) + pts[c][i] + 0.5 * pts[vc][i] for i in range(half, len(sims))]
    mean = {p: sum(v) / len(v) for p, v in pts.items()}
    teams = [pick_xi(mean, team_of)]
    rows = random.Random(0).sample(range(half), min(n_candidates, half))
    cands, seen = [], set()
    for r in rows:
        t = pick_xi({p: pts[p][r] for p in pids}, team_of)
        key = (frozenset(t[0]), t[1], t[2])
        if key not in seen:
            seen.add(key)
            cands.append(t)
    best = scores(teams[0])
    cand_scores = [scores(t) for t in cands]
    while len(teams) < k and cands:
        gains = [sum(max(a, b) for a, b in zip(best, s)) for s in cand_scores]
        j = max(range(len(gains)), key=gains.__getitem__)
        teams.append(cands.pop(j))
        best = [max(a, b) for a, b in zip(best, cand_scores.pop(j))]
    name = lambda p: pack["players"].get(p, {}).get("name", p)  # noqa: E731
    out = []
    for xi, c, vc in teams:
        s = scores((xi, c, vc))
        out.append({"xi": [name(p) for p in xi], "captain": name(c), "vice_captain": name(vc),
                    "expected_points": _r(sum(s) / len(s), 1)})
    return {"teams": out, "expected_best_of_portfolio": _r(sum(best) / len(best), 1), "simulations": len(sims)}


def infer_roles(pack: dict, overs: dict[str, float], roles: dict | None = None) -> dict:
    """BOWL / AR / BAT from expected overs per match and batting position (modelling.infer_roles)."""
    out = dict(roles or {})
    for t in pack["teams"]:
        for pos, p in enumerate(t["players"], 1):
            if p not in out:
                ov = overs.get(p, 0.0)
                out[p] = "BOWL" if ov >= 2.5 and pos >= 7 else "AR" if ov >= 1.0 else "BAT"
    return out
