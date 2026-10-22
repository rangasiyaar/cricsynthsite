"""Fantasy points (Dream11-style T20 table) from simulations and from real scorecards, and XI selection.

Batting: run 1, four +4, six +6, 25/50/75/100 bonus 4/8/12/16 (highest only), duck -2 (not bowlers),
strike-rate bands (10+ balls, not bowlers). Bowling: wicket 30, bowled/LBW +8, 3/4/5-wicket bonus 4/8/12,
economy bands (2+ overs). Playing +4. Stumping +12 to the keeper when roles are known.
Fielding (`fielding=True`, needs a model with fielding shares): catch 8 (+4 for 3 or more), stumping 12,
run-out 12 (6 each when two fielders share it). The simulation knows how many catches, stumpings and run-outs
happen, not who made them, so each is split over the fielding XI by the players' usual share. Without it,
fielding is left out on both sides. Maidens are left out on both sides.
"""
from __future__ import annotations

import itertools

import numpy as np

from cricsim.engine.model import DISMISSALS

BOWLED_LBW = (DISMISSALS.index("bowled"), DISMISSALS.index("lbw"))
STUMPED = DISMISSALS.index("stumped")
CAUGHT, CAUGHT_BOWLED, RUN_OUT = DISMISSALS.index("caught"), DISMISSALS.index("caught and bowled"), DISMISSALS.index("run out")
FIELD_POINTS = (8, 12, 12)                 # catch, stumping, run-out


def batting_points(r, b, f4, f6, out, bowler_role=False):
    r, b, f4, f6, out = (np.asarray(x) for x in (r, b, f4, f6, out))
    p = r + 4 * f4 + 6 * f6
    p = p + np.select([r >= 100, r >= 75, r >= 50, r >= 25], [16, 12, 8, 4], 0)
    if not bowler_role:
        p = p - 2 * ((r == 0) & out)
        sr = np.where(b > 0, 100 * r / np.maximum(b, 1), 0)
        band = np.select([sr > 170, sr > 150, sr >= 130, sr < 50, sr < 60, sr <= 70], [6, 4, 2, -6, -4, -2], 0)
        p = p + np.where(b >= 10, band, 0)
    return p


def bowling_points(balls, runs, wkts, bowled_lbw):
    balls, runs, wkts, bowled_lbw = (np.asarray(x) for x in (balls, runs, wkts, bowled_lbw))
    p = 30 * wkts + 8 * bowled_lbw + np.select([wkts >= 5, wkts == 4, wkts == 3], [12, 8, 4], 0)
    econ = np.where(balls > 0, 6 * runs / np.maximum(balls, 1), 0)
    band = np.select([econ < 5, econ < 6, econ <= 7, econ > 12, econ > 11, econ >= 10], [6, 4, 2, -6, -4, -2], 0)
    return p + np.where(balls >= 12, band, 0)


def sim_points(sims, roles: dict[str, str] | None = None, model=None,
               fielding: bool = False) -> tuple[list[str], np.ndarray]:
    """(player ids, (n_sims, 22) points per simulation)."""
    roles = roles or {}
    share = model.fielding if fielding and model is not None else None
    pids = [p for t in sims.spec.teams for p in t.everyone]
    col = {p: i for i, p in enumerate(pids)}
    out = []
    for part in sims.parts:
        pts = np.full((part.n, len(pids)), 4.0)
        for lg in part.innings:
            for s, p in enumerate(lg.order):
                pts[:, col[p]] += batting_points(lg.bat_runs[:, s], lg.bat_balls[:, s], lg.bat_4s[:, s],
                                                 lg.bat_6s[:, s], lg.bat_out[:, s], roles.get(p) == "BOWL")
            kind, by, dismissed = lg.bat_kind, lg.bat_by, lg.bat_out
            keeper = next((q for q in lg.bowlers if roles.get(q) == "WK"), None)
            for k, p in enumerate(lg.bowlers):
                mine = dismissed & (by == k)
                bl = (mine & np.isin(kind, BOWLED_LBW)).sum(1)
                pts[:, col[p]] += bowling_points(lg.bowl_balls[:, k], lg.bowl_runs[:, k], lg.bowl_wkts[:, k], bl)
                if share is not None:
                    pts[:, col[p]] += 8 * (mine & (kind == CAUGHT_BOWLED)).sum(1)
                elif keeper is not None:
                    pts[:, col[keeper]] += 12 * (mine & (kind == STUMPED)).sum(1)
            if share is not None:
                sh = share[[model.pid(q) for q in lg.bowlers]]
                sh = sh / np.maximum(sh.sum(0), 1e-9)
                for j, (k, pts_k) in enumerate(zip((CAUGHT, STUMPED, RUN_OUT), FIELD_POINTS)):
                    n_ev = (dismissed & (kind == k)).sum(1)
                    for q, p in enumerate(lg.bowlers):
                        pts[:, col[p]] += pts_k * sh[q, j] * n_ev
        out.append(pts)
    return pids, np.concatenate(out)


def fielding_points(events) -> dict[str, float]:
    """Real fielding points from (kind, fielder ids, bowler id) per dismissal."""
    pts: dict[str, float] = {}
    catches: dict[str, int] = {}
    for kind, fielders, bowler in events:
        fielders = [f for f in (fielders or []) if f]
        if kind in ("caught", "caught and bowled"):
            who = bowler if kind == "caught and bowled" or not fielders else fielders[0]
            if who:
                catches[who] = catches.get(who, 0) + 1
        elif kind == "stumped" and fielders:
            pts[fielders[0]] = pts.get(fielders[0], 0) + 12
        elif kind == "run out" and fielders:
            for f in fielders[:2]:
                pts[f] = pts.get(f, 0) + (12 if len(fielders) == 1 else 6)
    for who, n in catches.items():
        pts[who] = pts.get(who, 0) + 8 * n + (4 if n >= 3 else 0)
    return pts


def actual_points(con, match_id: str, table: str = "hold", fielding: list | None = None) -> dict[str, float]:
    """Real points per player from a deliveries table with one match in it; fielding from `fielding`
    ((kind, fielder ids, bowler id) per dismissal) when given."""
    bat = con.execute(f"""
        SELECT batter_id, sum(runs_batter), count(*) FILTER (WHERE wides = 0),
               count(*) FILTER (WHERE runs_batter = 4 AND NOT coalesce(non_boundary, FALSE)),
               count(*) FILTER (WHERE runs_batter = 6 AND NOT coalesce(non_boundary, FALSE))
        FROM {table} WHERE match_id = ? GROUP BY 1""", [match_id]).fetchall()
    outs = {r[0] for r in con.execute(f"""
        SELECT player_out_id FROM {table} WHERE match_id = ? AND is_wicket
          AND wicket_kind NOT IN ('retired hurt', 'retired not out')""", [match_id]).fetchall()}
    bowl = con.execute(f"""
        SELECT bowler_id, count(*) FILTER (WHERE is_legal), sum(runs_batter + wides + noballs),
               count(*) FILTER (WHERE wicket_kind IN ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled',
                                                     'hit wicket')),
               count(*) FILTER (WHERE wicket_kind IN ('bowled', 'lbw'))
        FROM {table} WHERE match_id = ? GROUP BY 1""", [match_id]).fetchall()
    pts: dict[str, float] = {}
    for pid, r, b, f4, f6 in bat:
        pts[pid] = pts.get(pid, 0) + float(batting_points(r, b, f4, f6, pid in outs))
    for pid, balls, runs, w, bl in bowl:
        pts[pid] = pts.get(pid, 0) + float(bowling_points(balls, runs, w, bl))
    for pid, v in fielding_points(fielding or []).items():
        pts[pid] = pts.get(pid, 0) + v
    return pts


DECISIVE = 1.2      # picks lean towards the favourite winning: log-odds × this (won at all three backtest cutoffs)


def decisive_mean(pts: np.ndarray, winner: np.ndarray, stretch: float = DECISIVE) -> np.ndarray:
    """Expected points with the simulations reweighted so the favourite wins a little more often (win chance's
    log-odds × stretch): real matches are more one-sided than the simulations, and picks follow the winners."""
    p0 = float((winner == 0).mean())
    if not 0 < p0 < 1 or stretch == 1:
        return pts.mean(0)
    q0 = 1 / (1 + np.exp(-stretch * np.log(p0 / (1 - p0))))
    w = np.where(winner == 0, q0 / p0, (1 - q0) / (1 - p0))
    return (pts * w[:, None]).sum(0) / w.sum()


def pick_xi(score: dict[str, float], team_of: dict[str, int], roles: dict[str, str] | None = None,
            captain_score: dict[str, float] | None = None) -> tuple[list[str], str, str]:
    """Best 11 by `score` with 1-10 per team (and 1-8 per role when roles are given). Captain and vice-captain
    are the two highest by `captain_score` (default `score`) inside the XI."""
    ranked = sorted(score, key=lambda p: -score[p])
    if not roles:
        xi = ranked[:11]
        for t in (0, 1):                       # at least one from each side
            if not any(team_of[p] == t for p in xi):
                xi[-1] = next(p for p in ranked if team_of[p] == t)
    else:
        pool = ranked[:15]
        for role in ("WK", "BAT", "AR", "BOWL"):
            pool += [p for p in ranked if roles.get(p) == role and p not in pool][:2]
        best, best_total = None, -1e9
        for combo in itertools.combinations(pool, 11):
            per_team = [sum(team_of[p] == t for p in combo) for t in (0, 1)]
            per_role = [sum(roles.get(p) == r for p in combo) for r in ("WK", "BAT", "AR", "BOWL")]
            if min(per_team) < 1 or max(per_team) > 10 or min(per_role) < 1 or max(per_role) > 8:
                continue
            total = sum(score[p] for p in combo)
            if total > best_total:
                best, best_total = list(combo), total
        xi = best
    cs = captain_score or score
    c, vc = sorted(xi, key=lambda p: -cs[p])[:2]
    return xi, c, vc


def team_points(xi: list[str], c: str, vc: str, real: dict[str, float]) -> float:
    return sum(real.get(p, 4.0) for p in xi) + real.get(c, 4.0) + 0.5 * real.get(vc, 4.0)


def _roles_ok(xi, roles) -> bool:
    if not roles:
        return True
    per_role = [sum(roles.get(p) == r for p in xi) for r in ("WK", "BAT", "AR", "BOWL")]
    return min(per_role) >= 1 and max(per_role) <= 8


def portfolio(pids: list[str], pts: np.ndarray, team_of: dict[str, int], k: int = 5,
              roles: dict[str, str] | None = None, n_candidates: int = 300,
              seed: int = 0, captains: int = 0) -> list[tuple[list[str], str, str]]:
    """k teams that together cover the likely matches: start from the expected-points XI, then greedily add
    the candidate that most raises the average (over simulations) of the portfolio's best team.
    Candidates are the best XI of individual simulations, so each is the right team for some plausible game;
    with `captains`, also every captain / vice-captain pair among each XI's top `captains` by expected points
    (the expected-points XI included), so the set can spread its captaincy as well as its players.
    Greedy, so the first j teams of a k-team set are the j-team set."""
    col = {p: i for i, p in enumerate(pids)}
    half = len(pts) // 2
    ev = pts[half:]                                     # candidates come from one half, are judged on the other

    def scores(team):                                   # points of a team in every evaluation simulation
        xi, c, vc = team
        return ev[:, [col[p] for p in xi]].sum(1) + ev[:, col[c]] + 0.5 * ev[:, col[vc]]

    mean = dict(zip(pids, pts.mean(0)))
    teams = [pick_xi(mean, team_of, roles)]
    rng = np.random.default_rng(seed)
    rows = rng.choice(half, size=min(n_candidates, half), replace=False)
    cands, seen = [], set()
    for r in rows:
        t = pick_xi(dict(zip(pids, pts[r])), team_of)
        key = (frozenset(t[0]), t[1], t[2])
        if key not in seen and _roles_ok(t[0], roles):
            seen.add(key)
            cands.append(t)
    if captains:
        for xi, _, _ in [teams[0], *cands]:
            top = sorted(xi, key=lambda p: -mean[p])[:captains]
            for c, vc in itertools.permutations(top, 2):
                key = (frozenset(xi), c, vc)
                if key not in seen:
                    seen.add(key)
                    cands.append((xi, c, vc))
    best = scores(teams[0])
    cand_scores = [scores(t) for t in cands]
    while len(teams) < k and cands:
        gains = [np.maximum(best, s).mean() for s in cand_scores]
        j = int(np.argmax(gains))
        teams.append(cands.pop(j))
        best = np.maximum(best, cand_scores.pop(j))
    return teams


def main() -> None:
    """python -m cricsim.fantasy --model M --coverage C.json [--real real.json] : expected points + picked XI."""
    import json
    from pathlib import Path

    import click

    from cricsim.engine.io import spec_from_dict
    from cricsim.engine.model import Model
    from cricsim.engine.simulate import simulate

    @click.command()
    @click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
    @click.option("--coverage", type=click.Path(exists=True, path_type=Path), required=True)
    @click.option("--n", default=20_000)
    @click.option("--seed", default=0)
    def run(model_dir: Path, coverage: Path, n: int, seed: int) -> None:
        cov = json.loads(coverage.read_text())
        model = Model.load(model_dir)
        spec, scenario = spec_from_dict(cov)
        sims = simulate(model, spec, n=n, scenario=scenario, seed=seed)
        roles = {p: r for t in cov["teams"] for p, r in zip(t["players"], t.get("roles") or [])}
        team_of = {p: k for k, t in enumerate(spec.teams) for p in t.everyone}
        name = {p: model.names[model.pid(p)] if model.knows(p) else p for p in team_of}
        pids, pts = sim_points(sims, roles)
        mean = dict(zip(pids, pts.mean(0)))
        p90 = dict(zip(pids, np.percentile(pts, 90, axis=0)))
        bowl = {p: 0.0 for p in pids}
        for part in sims.parts:
            for lg in part.innings:
                for k, p in enumerate(lg.bowlers):
                    bowl[p] += float((lg.bowl_balls[:, k] > 0).sum()) / sims.n
        rows = [{"player": name[p], "team": spec.teams[team_of[p]].name, "role": roles.get(p),
                 "mean": round(mean[p], 1), "p90": round(p90[p], 1), "bowls": round(bowl[p], 2)}
                for p in sorted(pids, key=lambda q: -mean[q])]
        xi, c, vc = pick_xi(mean, team_of, roles)
        out = {"players": rows, "xi": [name[p] for p in sorted(xi, key=lambda q: -mean[q])],
               "captain": name[c], "vice_captain": name[vc]}
        out["portfolio"] = [{"xi": [name[p] for p in sorted(x, key=lambda q: -mean[q])], "captain": name[c_],
                             "vice_captain": name[v_]} for x, c_, v_ in portfolio(pids, pts, team_of, 5, roles)]
        xi_u, c_u, vc_u = pick_xi(mean, team_of, roles, captain_score=p90)
        out["upside_captain"] = {"captain": name[c_u], "vice_captain": name[vc_u]}
        click.echo(json.dumps(out, indent=1))

    run()


if __name__ == "__main__":
    main()
