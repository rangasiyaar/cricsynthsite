"""Backtest: fit on matches before a cutoff, simulate every later match from its XIs, score the forecasts.

    python -m cricsim.engine backtest --parquet data/parquet --cutoff 2025-01-01 --out data/backtest/report

Scores (all out-of-sample):
  match result     Brier score and log-loss v a coin flip; calibration table
  team totals      PIT (where the real score fell in the simulated distribution; uniform = calibrated),
                   80% interval coverage, median absolute error
  player runs      80% interval coverage, Brier for P(30+), mean predicted v actual —
                   split into established players, cross-league debutants (no balls in this
                   competition before the cutoff, but history elsewhere) and complete unknowns
  bowler wickets   Brier for P(2+ wickets)
"""
from __future__ import annotations

import json
import logging
import zlib
from datetime import date
from pathlib import Path

import duckdb
import numpy as np

from cricsim.engine.fit import FitConfig, fit
from cricsim.engine.model import Model
from cricsim.engine.simulate import simulate
from cricsim.engine.spec import MatchSpec, TeamSpec
from cricsim.fantasy import actual_points, pick_xi, portfolio, sim_points, team_points

log = logging.getLogger(__name__)


def holdout_matches(con, parquet: Path, cutoff: date, limit: int, seed: int = 0, end: date | None = None) -> list[dict]:
    m = (parquet / "matches" / "*.parquet").as_posix()
    mp = (parquet / "match_players" / "*.parquet").as_posix()
    inn = (parquet / "innings" / "*.parquet").as_posix()
    rows = con.execute(f"""
        WITH ok AS (
          SELECT match_id FROM read_parquet('{inn}') WHERE NOT is_super_over AND innings_no <= 2
          GROUP BY 1 HAVING count(*) = 2)
        SELECT m.match_id, m.format, m.gender, m.venue_id, m.team_type,
               coalesce(m.competition_id, 'intl-' || coalesce(m.team_type, '') || '-' || m.format) AS comp,
               m.team1, m.team2, m.winner, m.result, m.overs, m.method, m.match_date
        FROM read_parquet('{m}') m JOIN ok USING (match_id)
        WHERE m.match_date >= DATE '{cutoff}' {f"AND m.match_date < DATE '{end}'" if end else ""} AND m.format IN ('T20', 'HUNDRED', 'OD', 'T10')
          AND m.gender IN ('male', 'female') AND m.method IS NULL
        ORDER BY hash(m.match_id || '{seed}') LIMIT {limit}""").fetchall()
    out = []
    for mid, fmt, gender, venue, team_type, comp, t1, t2, winner, result, overs, method, day in rows:
        xi = {}
        for team in (t1, t2):
            xi[team] = [r[0] for r in con.execute(
                f"SELECT player_id FROM read_parquet('{mp}') WHERE match_id = ? AND team = ? ORDER BY list_order",
                [mid, team]).fetchall()]
        if any(len(v) != 11 or None in v for v in xi.values()):
            continue
        innings = con.execute(f"""SELECT innings_no, team, runs, wickets FROM read_parquet('{inn}')
                                  WHERE match_id = ? AND innings_no <= 2 ORDER BY innings_no""", [mid]).fetchall()
        out.append({"match_id": mid, "format": fmt, "gender": gender, "venue_id": venue, "comp": comp, "team_type": team_type,
                    "teams": [t1, t2], "xi": xi, "winner": winner, "result": result, "innings": innings,
                    "date": day})
    return out


def batting_order(con, match_id: str) -> dict[tuple[int, str], int]:
    rows = con.execute(f"""
        WITH e AS (
          SELECT innings_no, batter_id AS pid, min("over" * 100 + ball_seq) * 2 AS k FROM hold
          WHERE match_id = ? GROUP BY ALL
          UNION ALL
          SELECT innings_no, non_striker_id, min("over" * 100 + ball_seq) * 2 + 1 FROM hold
          WHERE match_id = ? GROUP BY ALL)
        SELECT innings_no, pid, min(k) FROM e GROUP BY ALL""", [match_id, match_id]).fetchall()
    return {(i, p): k for i, p, k in rows}


def _xi_order(model: Model, xi: list[str], fmt: str) -> list[str]:
    """Pre-match batting order: usual position from history; unknowns keep their team-sheet position."""
    fam = 1 if fmt == "OD" else 0
    keyed = []
    for i, p in enumerate(xi):
        pos = float(model.bat_pos[model.pid(p), fam]) if model.knows(p) else 0.0
        keyed.append((pos if pos > 0 else i + 1 + 0.5, i, p))
    return [p for _, _, p in sorted(keyed)]


def run_backtest(parquet: Path, cutoff: date, limit: int = 600, n_sims: int = 1000,
                 model: Model | None = None, memory: str = "4GB", insample: int = 0,
                 half_life: float | None = None, fantasy_bowlers: bool = False) -> dict:
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    cfg = FitConfig(cutoff=cutoff, **({"half_life_years": half_life} if half_life else {}))
    model = model or fit(parquet, cfg, memory=memory, con=con)
    rep = _run(con, parquet, model, cutoff, None, limit, n_sims, fantasy_bowlers)
    rep["half_life_years"] = cfg.half_life_years
    if insample:      # same model on its own last six months: tells model bias apart from drift after the cutoff
        start = date(cutoff.year - (cutoff.month <= 6), (cutoff.month - 7) % 12 + 1, 1)
        log.info("in-sample check from %s", start)
        ins = _run(con, parquet, model, start, cutoff, insample, n_sims, False)
        rep["insample"] = {"from": str(start), "team_innings": ins.get("team_innings"),
                           "first_innings_by_group": ins.get("first_innings_by_group")}
    return rep


def _run(con, parquet: Path, model: Model, cutoff: date, end: date | None, limit: int, n_sims: int,
         fantasy_bowlers: bool = False) -> dict:
    matches = holdout_matches(con, parquet, cutoff, limit, end=end)
    log.info("backtesting %d matches", len(matches))
    d = (parquet / "deliveries" / "*.parquet").as_posix()
    seen = {r[0] for r in con.execute(f"""
        SELECT DISTINCT batter_id || '|' || coalesce(competition_id, 'intl-' || coalesce(team_type, '') || '-' || format)
        FROM read_parquet('{d}') WHERE match_date < DATE '{cutoff}' AND batter_id IS NOT NULL""").fetchall()}
    con.execute(f"""CREATE OR REPLACE TABLE hold AS SELECT * FROM read_parquet('{d}')
                    WHERE match_date >= DATE '{cutoff}' {f"AND match_date < DATE '{end}'" if end else ""}
                    AND NOT is_super_over""")

    res = {"win": [], "score": [], "players": [], "bowlers": []}
    for mt in matches:
        t1, t2 = mt["teams"]
        first_team = mt["innings"][0][1]
        bf = 0 if first_team == t1 else 1
        spec = MatchSpec(mt["format"], mt["gender"],
                         (TeamSpec(t1, _xi_order(model, mt["xi"][t1], mt["format"])),
                          TeamSpec(t2, _xi_order(model, mt["xi"][t2], mt["format"]))),
                         venue_id=mt["venue_id"], comp_key=mt["comp"], batting_first=bf)
        sims = simulate(model, spec, n=n_sims, seed=zlib.crc32(mt["match_id"].encode()))
        part = sims.parts[0]
        p1 = float((part.winner == 0).mean())
        if mt["winner"] in (t1, t2):
            res["win"].append((p1, 1.0 if mt["winner"] == t1 else 0.0, mt["format"]))
        actual_order = batting_order(con, mt["match_id"])
        if mt["format"] != "OD":
            res.setdefault("fantasy", []).append(_fantasy(con, model, spec, sims, mt, n_sims, fantasy_bowlers,
                                                          actual_order))
        for inn0, lg in enumerate(part.innings):
            actual = mt["innings"][inn0][2]
            sim = lg.runs
            act_wk = mt["innings"][inn0][3] if len(mt["innings"][inn0]) > 3 else None
            used = con.execute("SELECT count(DISTINCT bowler_id), max(c) FROM (SELECT bowler_id, count(*) FILTER "
                               "(WHERE wides = 0 AND noballs = 0) OVER (PARTITION BY bowler_id) AS c FROM hold "
                               "WHERE match_id = ? AND innings_no = ?)", [mt["match_id"], inn0 + 1]).fetchone()
            bat_xi = mt["xi"][spec.teams[(bf + inn0) % 2].name]
            n_new = sum(not model.knows(p) for p in bat_xi)
            res.setdefault("team", []).append({"inn": inn0 + 1, "pred_runs": float(sim.mean()), "act_runs": actual,
                                               "split": {"competition": "seen" if model.comp(mt["comp"]) else "new",
                                                         "venue": "seen" if model.venue(mt["venue_id"]) else "new",
                                                         "unknown batters": "0" if n_new == 0 else
                                                         "1-2" if n_new <= 2 else "3+",
                                                         "months after cutoff": _horizon(mt["date"], cutoff)},
                                               "group": f"{mt['format']} {mt['gender']} {mt['team_type']}",
                                               "pred_wkts": float(lg.wkts.mean()), "act_wkts": act_wk,
                                               "pred_bowlers": float((lg.bowl_balls > 0).sum(1).mean()),
                                               "act_bowlers": used[0],
                                               "pred_top_balls": float(lg.bowl_balls.max(1).mean()),
                                               "act_top_balls": used[1]})
            if inn0 == 0:
                res["score"].append({"pit": float((sim < actual).mean() + 0.5 * (sim == actual).mean()),
                                     "in80": bool(np.percentile(sim, 10) <= actual <= np.percentile(sim, 90)),
                                     "abs_err": float(abs(np.median(sim) - actual)), "format": mt["format"]})
        # players
        runs_by, balls_by, wk_by = _actual_player_stats(con, mt["match_id"])
        for inn0, lg in enumerate(part.innings):
            for s, p in enumerate(lg.order):
                if (inn0 + 1, p) not in actual_order:
                    continue                           # didn't bat
                batted = lg.bat_balls[:, s] > 0              # like with like: simulations where he batted too
                if not batted.any():
                    continue
                sim_r = lg.bat_runs[batted, s]
                act = runs_by.get(p, 0)
                group = ("established" if f"{p}|{mt['comp']}" in seen else
                         "cross-league debutant" if model.knows(p) else "unknown")
                res["players"].append({"group": group, "pred_mean": float(sim_r.mean()), "actual": act,
                                       "in80": bool(np.percentile(sim_r, 10) <= act <= np.percentile(sim_r, 90)),
                                       "p30": float((sim_r >= 30).mean()), "hit30": act >= 30})
            for j, p in enumerate(lg.bowlers):
                if p not in wk_by:
                    continue
                bowled = lg.bowl_balls[:, j] > 0              # compare like with like: simulations where he bowled
                if not bowled.any():
                    continue
                sim_w = lg.bowl_wkts[bowled, j]
                res["bowlers"].append({"p2": float((sim_w >= 2).mean()), "hit2": wk_by[p] >= 2,
                                       "pred_mean": float(sim_w.mean()), "actual": wk_by[p]})
    rep = score(res, cutoff, len(matches))
    rep["era_recent"] = model.meta.get("fit", {}).get("era_recent")
    return rep


def _horizon(day, cutoff: date) -> str:
    months = (day.year - cutoff.year) * 12 + day.month - cutoff.month
    return "0-5" if months < 6 else "6-11" if months < 12 else "12+"


def _p_top(pids: list[str], pts: np.ndarray, xi: list[str]) -> dict[str, float]:
    """Chance each XI player is the XI's top scorer (captain by "who is most often the best")."""
    cols = [pids.index(p) for p in xi]
    top = np.bincount(pts[:, cols].argmax(1), minlength=len(cols)) / len(pts)
    return {p: float(top[i]) for i, p in enumerate(xi)}


def _xi_score(pids, pts, team) -> np.ndarray:
    xi, c, vc = team
    col = {p: i for i, p in enumerate(pids)}
    return pts[:, [col[p] for p in xi]].sum(1) + pts[:, col[c]] + 0.5 * pts[:, col[vc]]


def _fantasy(con, model: Model, spec: MatchSpec, sims, mt: dict, n_sims: int, bowlers_known: bool,
             actual_order: dict | None = None) -> dict:
    """Pick fantasy XIs from the simulations, score them on the real match (no fielding points either side)."""
    team_of = {p: k for k, t in enumerate(spec.teams) for p in t.players}
    real = actual_points(con, mt["match_id"])
    real = {p: real.get(p, 4.0) for p in team_of}            # in the XI but did nothing: playing points only
    pids, pts = sim_points(sims)
    mean = dict(zip(pids, pts.mean(0)))
    upside = dict(zip(pids, np.percentile(pts, 90, axis=0)))
    out = {}
    xi, c, vc = pick_xi(mean, team_of)
    out["mean"] = team_points(xi, c, vc, real)
    out["overlap"] = len(set(xi) & set(pick_xi(real, team_of)[0]))
    # ceiling: the same single team inside the simulations, v each simulation's own best team
    # (what a perfect model could reach; only cricket's randomness stands in the way)
    srt = -np.sort(-pts, axis=1)
    out["ceil_team"] = float(_xi_score(pids, pts, (xi, c, vc)).mean())
    out["ceil_best"] = float((srt[:, :11].sum(1) + srt[:, 0] + 0.5 * srt[:, 1]).mean())
    # where the points go: our XI with hindsight captain / vice-captain
    rc = sorted(xi, key=lambda p: -real[p])
    out["oracle_captain"] = team_points(xi, rc[0], rc[1], real)
    ptop = _p_top(pids, pts, xi)
    pc = sorted(xi, key=lambda p: -ptop[p])
    out["ptop_captain"] = team_points(xi, pc[0], pc[1], real)
    xi, c, vc = pick_xi(mean, team_of, captain_score=upside)
    out["upside_captain"] = team_points(xi, c, vc, real)
    xi, c, vc = pick_xi(real, team_of)
    out["best"] = team_points(xi, c, vc, real)
    teams = portfolio(pids, pts, team_of, k=5)
    got = [team_points(*t, real) for t in teams]
    out["portfolio_3"], out["portfolio_5"] = max(got[:3]), max(got)
    xi, _, _ = pick_xi(mean, team_of)                   # baseline: same XI, five different captains
    caps = sorted(xi, key=lambda p: -mean[p])[:6]
    out["captains_5"] = max(team_points(xi, caps[i], caps[i + 1], real) for i in range(5))
    rng = np.random.default_rng(zlib.crc32(mt["match_id"].encode()))
    every = list(team_of)
    rand = []
    for _ in range(5):
        r = list(rng.choice(every, 11, replace=False))
        rand.append(team_points(r, r[0], r[1], real))
    out["random_5"] = max(rand)
    out["random"] = 12.5 * float(np.mean(list(real.values())))
    if bowlers_known:   # upper bound for entering the bowling plan: who actually bowled
        used = {r[0] for r in con.execute("SELECT DISTINCT bowler_id FROM hold WHERE match_id = ?",
                                          [mt["match_id"]]).fetchall()}
        spec2 = MatchSpec(spec.format, spec.gender, tuple(TeamSpec(t.name, t.players, [p for p in t.players if p in used])
                                                          for t in spec.teams),
                          venue_id=spec.venue_id, comp_key=spec.comp_key, batting_first=spec.batting_first)
        sims2 = simulate(model, spec2, n=n_sims, seed=zlib.crc32(mt["match_id"].encode()))
        pids2, pts2 = sim_points(sims2)
        xi, c, vc = pick_xi(dict(zip(pids2, pts2.mean(0))), team_of)
        out["bowlers_known"] = team_points(xi, c, vc, real)
        # toss unknown: half the simulations each way (the backtest otherwise knows who batted first)
        spec_u = MatchSpec(spec.format, spec.gender, spec.teams, venue_id=spec.venue_id, comp_key=spec.comp_key)
        pids_u, pts_u = sim_points(simulate(model, spec_u, n=n_sims, seed=zlib.crc32(mt["match_id"].encode()) + 1))
        out["toss_unknown"] = team_points(*pick_xi(dict(zip(pids_u, pts_u.mean(0))), team_of), real)
        # full team news: real batting order and who bowls; then also captain by top-scorer chance
        if actual_order:
            def order(t):
                k = {p: v for (_, p), v in actual_order.items() if p in t.players}
                return sorted(t.players, key=lambda p: (k.get(p, 10 ** 6), t.players.index(p)))
            spec3 = MatchSpec(spec.format, spec.gender,
                              tuple(TeamSpec(t.name, order(t), [p for p in t.players if p in used]) for t in spec.teams),
                              venue_id=spec.venue_id, comp_key=spec.comp_key, batting_first=spec.batting_first)
            pids3, pts3 = sim_points(simulate(model, spec3, n=n_sims, seed=zlib.crc32(mt["match_id"].encode())))
            m3 = dict(zip(pids3, pts3.mean(0)))
            xi3, c3, vc3 = pick_xi(m3, team_of)
            out["team_news"] = team_points(xi3, c3, vc3, real)
            pt3 = _p_top(pids3, pts3, xi3)
            pc3 = sorted(xi3, key=lambda p: -pt3[p])
            out["team_news_ptop"] = team_points(xi3, pc3[0], pc3[1], real)
            rc3 = sorted(xi3, key=lambda p: -real[p])
            out["team_news_oracle_captain"] = team_points(xi3, rc3[0], rc3[1], real)
    return out


def _actual_player_stats(con, match_id: str):
    runs = dict(con.execute(f"""SELECT batter_id, sum(runs_batter) FROM hold
                                WHERE match_id = ? GROUP BY 1""", [match_id]).fetchall())
    balls = dict(con.execute(f"""SELECT batter_id, count(*) FROM hold
                                 WHERE match_id = ? AND wides = 0 GROUP BY 1""", [match_id]).fetchall())
    wk = dict(con.execute(f"""SELECT bowler_id, sum(CASE WHEN wicket_kind IN ('bowled','caught','lbw','stumped',
                              'caught and bowled','hit wicket') THEN 1 ELSE 0 END)
                              FROM hold WHERE match_id = ? GROUP BY 1""",
                           [match_id]).fetchall())
    return runs, balls, wk


def _calibration(pairs: list[tuple[float, float]], bins: int = 10) -> list[dict]:
    if not pairs:
        return []
    p = np.array([a for a, _ in pairs])
    y = np.array([b for _, b in pairs])
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & (p < hi if hi < 1 else p <= hi)
        if m.sum():
            out.append({"bin": f"{lo:.1f}–{hi:.1f}", "n": int(m.sum()), "predicted": round(float(p[m].mean()), 3),
                        "observed": round(float(y[m].mean()), 3)})
    return out


def score(res: dict, cutoff: date, n_matches: int) -> dict:
    out = {"cutoff": str(cutoff), "matches": n_matches}
    if res["win"]:
        p = np.array([a for a, _, _ in res["win"]])
        y = np.array([b for _, b, _ in res["win"]])
        pc = np.clip(p, 0.01, 0.99)
        out["result"] = {"n": len(p), "brier": round(float(((p - y) ** 2).mean()), 4), "brier_coin_flip": 0.25,
                         "log_loss": round(float(-(y * np.log(pc) + (1 - y) * np.log(1 - pc)).mean()), 4),
                         "log_loss_coin_flip": round(float(np.log(2)), 4),
                         "accuracy": round(float(((p > 0.5) == (y == 1)).mean()), 3),
                         "calibration": _calibration([(a, b) for a, b, _ in res["win"]], 5)}
    if res.get("team"):
        out["team_innings"] = {}
        for inn in (1, 2):
            rows = [r for r in res["team"] if r["inn"] == inn]
            if rows:
                out["team_innings"][str(inn)] = {
                    "n": len(rows),
                    "runs_predicted": round(float(np.mean([r["pred_runs"] for r in rows])), 1),
                    "runs_actual": round(float(np.mean([r["act_runs"] for r in rows])), 1),
                    "wickets_predicted": round(float(np.mean([r["pred_wkts"] for r in rows])), 2),
                    "wickets_actual": round(float(np.mean([r["act_wkts"] for r in rows if r["act_wkts"] is not None])), 2),
                    "bowlers_used_predicted": round(float(np.mean([r["pred_bowlers"] for r in rows])), 2),
                    "bowlers_used_actual": round(float(np.mean([r["act_bowlers"] for r in rows if r["act_bowlers"]])), 2),
                    "top_bowler_balls_predicted": round(float(np.mean([r["pred_top_balls"] for r in rows])), 1),
                    "top_bowler_balls_actual": round(float(np.mean([r["act_top_balls"] for r in rows if r["act_top_balls"]])), 1)}
    if res.get("team"):
        groups: dict[str, list] = {}
        for r in res["team"]:
            if r["inn"] == 1:
                groups.setdefault(r["group"], []).append(r)
        out["first_innings_by_group"] = {g: {"n": len(rows),
                                             "runs_predicted": round(float(np.mean([r["pred_runs"] for r in rows])), 1),
                                             "runs_actual": round(float(np.mean([r["act_runs"] for r in rows])), 1)}
                                         for g, rows in sorted(groups.items(), key=lambda kv: -len(kv[1])) if len(rows) >= 15}
        splits: dict[str, list] = {}
        for r in res["team"]:
            if r["inn"] == 1 and "split" in r:
                for k, v in r["split"].items():
                    splits.setdefault(f"{k}: {v}", []).append(r)
        out["first_innings_by_split"] = {k: {"n": len(rows),
                                             "runs_predicted": round(float(np.mean([r["pred_runs"] for r in rows])), 1),
                                             "runs_actual": round(float(np.mean([r["act_runs"] for r in rows])), 1)}
                                         for k, rows in sorted(splits.items())}
    if res["score"]:
        pit = np.array([s["pit"] for s in res["score"]])
        out["first_innings_total"] = {
            "n": len(pit), "in_80pct_band": round(float(np.mean([s["in80"] for s in res["score"]])), 3),
            "median_abs_error": round(float(np.median([s["abs_err"] for s in res["score"]])), 1),
            "pit_deciles": [round(float(((pit >= lo) & (pit < lo + 0.1)).mean()), 3) for lo in np.arange(0, 1, 0.1)]}
    groups = {}
    for r in res["players"]:
        groups.setdefault(r["group"], []).append(r)
    out["player_runs"] = {}
    for g, rows in groups.items():
        out["player_runs"][g] = {
            "n": len(rows),
            "mean_predicted": round(float(np.mean([r["pred_mean"] for r in rows])), 2),
            "mean_actual": round(float(np.mean([r["actual"] for r in rows])), 2),
            "in_80pct_band": round(float(np.mean([r["in80"] for r in rows])), 3),
            "brier_30plus": round(float(np.mean([(r["p30"] - r["hit30"]) ** 2 for r in rows])), 4),
            "brier_30plus_base_rate": round(float(np.var([r["hit30"] for r in rows])), 4),
            "corr_pred_actual": round(float(np.corrcoef([r["pred_mean"] for r in rows],
                                                        [r["actual"] for r in rows])[0, 1]), 3) if len(rows) > 2 else None}
    if res.get("fantasy"):
        f = res["fantasy"]
        best = np.mean([r["best"] for r in f])
        out["fantasy"] = {"n": len(f), "best_possible": round(float(best), 1),
                          "overlap_with_best_xi": round(float(np.mean([r["overlap"] for r in f])), 2),
                          "strategies": {k: {"points": round(float(np.mean([r[k] for r in f])), 1),
                                             "share_of_best": round(float(np.mean([r[k] for r in f]) / best), 3)}
                                         for k in ("random", "mean", "upside_captain", "ptop_captain",
                                                   "oracle_captain", "toss_unknown", "bowlers_known", "team_news",
                                                   "team_news_ptop", "team_news_oracle_captain", "captains_5",
                                                   "random_5", "portfolio_3", "portfolio_5")
                                         if all(k in r for r in f)},
                          "ceiling_perfect_model": round(float(np.mean([r["ceil_team"] for r in f])
                                                               / np.mean([r["ceil_best"] for r in f])), 3)}
    if res["bowlers"]:
        b = res["bowlers"]
        out["bowler_wickets"] = {"n": len(b), "brier_2plus": round(float(np.mean([(r["p2"] - r["hit2"]) ** 2 for r in b])), 4),
                                 "brier_2plus_base_rate": round(float(np.var([r["hit2"] for r in b])), 4),
                                 "mean_predicted": round(float(np.mean([r["pred_mean"] for r in b])), 3),
                                 "mean_actual": round(float(np.mean([r["actual"] for r in b])), 3),
                                 "calibration_2plus": _calibration([(r["p2"], float(r["hit2"])) for r in b], 5)}
    return out


def write_report(rep: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.with_suffix(".json").write_text(json.dumps(rep, indent=2))
    L = [f"# Backtest — trained before {rep['cutoff']}, tested on {rep['matches']} later matches", ""]
    if "result" in rep:
        r = rep["result"]
        L += ["## Match result", "",
              f"Brier **{r['brier']}** (coin flip 0.25) · log-loss **{r['log_loss']}** (coin flip {r['log_loss_coin_flip']}) · "
              f"favourite won **{100 * r['accuracy']:.1f}%** of {r['n']} matches", "",
              "| Predicted | Matches | Predicted win % | Actual win % |", "|---|---|---|---|"]
        L += [f"| {c['bin']} | {c['n']} | {100 * c['predicted']:.1f} | {100 * c['observed']:.1f} |" for c in r["calibration"]]
        L.append("")
    if "first_innings_total" in rep:
        s = rep["first_innings_total"]
        L += ["## First-innings totals", "",
              f"Real score inside the simulated 80% band: **{100 * s['in_80pct_band']:.1f}%** (target 80%) · "
              f"median error {s['median_abs_error']} runs", "",
              "Where real scores fell in the simulated distribution, by decile (calibrated = 10% each): "
              + " · ".join(f"{100 * x:.0f}%" for x in s["pit_deciles"]), ""]
    if rep.get("team_innings"):
        L += ["## Team innings (average, predicted / actual)", "",
              "| Innings | Matches | Runs | Wickets | Bowlers used | Top bowler's balls |", "|---|---|---|---|---|---|"]
        for k, r in rep["team_innings"].items():
            L.append(f"| {k} | {r['n']} | {r['runs_predicted']} / {r['runs_actual']} | {r['wickets_predicted']} / "
                     f"{r['wickets_actual']} | {r['bowlers_used_predicted']} / {r['bowlers_used_actual']} | "
                     f"{r['top_bowler_balls_predicted']} / {r['top_bowler_balls_actual']} |")
        L.append("")
    if rep.get("first_innings_by_group"):
        L += ["## First-innings runs by group (predicted / actual)", "", "| Group | Matches | Runs |", "|---|---|---|"]
        L += [f"| {g} | {r['n']} | {r['runs_predicted']} / {r['runs_actual']} |" for g, r in rep["first_innings_by_group"].items()]
        L.append("")
    if rep.get("first_innings_by_split"):
        L += ["## First-innings runs by split (predicted / actual)", "", "| Split | Matches | Runs |", "|---|---|---|"]
        L += [f"| {g} | {r['n']} | {r['runs_predicted']} / {r['runs_actual']} |" for g, r in rep["first_innings_by_split"].items()]
        L.append("")
    if rep.get("insample"):
        ins = rep["insample"]
        L += [f"## In-sample check (same model, matches from {ins['from']} to the cutoff)", "",
              "| Innings / group | Matches | Runs |", "|---|---|---|"]
        L += [f"| innings {k} | {r['n']} | {r['runs_predicted']} / {r['runs_actual']} |"
              for k, r in (ins.get("team_innings") or {}).items()]
        L += [f"| {g} | {r['n']} | {r['runs_predicted']} / {r['runs_actual']} |"
              for g, r in (ins.get("first_innings_by_group") or {}).items()]
        L.append("")
    if rep.get("player_runs"):
        L += ["## Player runs (players who batted, v simulations where they batted)", "", "| Group | Innings | Predicted mean | Actual mean | In 80% band | Brier 30+ (base rate) | Corr |",
              "|---|---|---|---|---|---|---|"]
        for g, r in rep["player_runs"].items():
            L.append(f"| {g} | {r['n']} | {r['mean_predicted']} | {r['mean_actual']} | {100 * r['in_80pct_band']:.1f}% | "
                     f"{r['brier_30plus']} ({r['brier_30plus_base_rate']}) | {r['corr_pred_actual']} |")
        L.append("")
    if "bowler_wickets" in rep:
        b = rep["bowler_wickets"]
        L += ["## Bowler wickets", "", f"Brier for 2+ wickets **{b['brier_2plus']}** (base rate {b['brier_2plus_base_rate']}) · "
              f"mean predicted {b['mean_predicted']} v actual {b['mean_actual']}", ""]
    if rep.get("fantasy"):
        fz = rep["fantasy"]
        L += [f"## Fantasy XI (picked from simulations, scored on the real match; {fz['n']} T20-type matches, "
              f"half-life {rep.get('half_life_years')} y)", "",
              f"Best possible XI averages **{fz['best_possible']}** points · picked XI shares "
              f"**{fz['overlap_with_best_xi']}** of 11 players with it · ceiling if the model were perfect "
              f"(single team v each simulation's best): **{100 * fz['ceiling_perfect_model']:.1f}%**", "",
              "| Strategy | Avg points | Share of best |", "|---|---|---|"]
        L += [f"| {k} | {v['points']} | {100 * v['share_of_best']:.1f}% |" for k, v in fz["strategies"].items()]
        L.append("")
    if rep.get("era_recent"):
        L += ["## Season scoring levels learned (log-multipliers; T20-type family)", "",
              " · ".join(f"{y}: 4s {v['four']:+.3f} 6s {v['six']:+.3f} W {v['wicket']:+.3f}"
                         for y, v in rep["era_recent"].get("short", {}).items()), ""]
    path.with_suffix(".md").write_text("\n".join(L) + "\n")
