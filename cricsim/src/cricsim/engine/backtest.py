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

log = logging.getLogger(__name__)


def holdout_matches(con, parquet: Path, cutoff: date, limit: int, seed: int = 0) -> list[dict]:
    m = (parquet / "matches" / "*.parquet").as_posix()
    mp = (parquet / "match_players" / "*.parquet").as_posix()
    inn = (parquet / "innings" / "*.parquet").as_posix()
    rows = con.execute(f"""
        WITH ok AS (
          SELECT match_id FROM read_parquet('{inn}') WHERE NOT is_super_over AND innings_no <= 2
          GROUP BY 1 HAVING count(*) = 2)
        SELECT m.match_id, m.format, m.gender, m.venue_id, m.team_type,
               coalesce(m.competition_id, 'intl-' || coalesce(m.team_type, '') || '-' || m.format) AS comp,
               m.team1, m.team2, m.winner, m.result, m.overs, m.method
        FROM read_parquet('{m}') m JOIN ok USING (match_id)
        WHERE m.match_date >= DATE '{cutoff}' AND m.format IN ('T20', 'HUNDRED', 'OD', 'T10')
          AND m.gender IN ('male', 'female') AND m.method IS NULL
        ORDER BY hash(m.match_id || '{seed}') LIMIT {limit}""").fetchall()
    out = []
    for mid, fmt, gender, venue, team_type, comp, t1, t2, winner, result, overs, method in rows:
        xi = {}
        for team in (t1, t2):
            xi[team] = [r[0] for r in con.execute(
                f"SELECT player_id FROM read_parquet('{mp}') WHERE match_id = ? AND team = ? ORDER BY list_order",
                [mid, team]).fetchall()]
        if any(len(v) != 11 or None in v for v in xi.values()):
            continue
        innings = con.execute(f"""SELECT innings_no, team, runs FROM read_parquet('{inn}')
                                  WHERE match_id = ? AND innings_no <= 2 ORDER BY innings_no""", [mid]).fetchall()
        out.append({"match_id": mid, "format": fmt, "gender": gender, "venue_id": venue, "comp": comp,
                    "teams": [t1, t2], "xi": xi, "winner": winner, "result": result, "innings": innings})
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
                 model: Model | None = None, memory: str = "4GB") -> dict:
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    model = model or fit(parquet, FitConfig(cutoff=cutoff), memory=memory, con=con)
    matches = holdout_matches(con, parquet, cutoff, limit)
    log.info("backtesting %d matches", len(matches))
    d = (parquet / "deliveries" / "*.parquet").as_posix()
    seen = {r[0] for r in con.execute(f"""
        SELECT DISTINCT batter_id || '|' || coalesce(competition_id, 'intl-' || coalesce(team_type, '') || '-' || format)
        FROM read_parquet('{d}') WHERE match_date < DATE '{cutoff}' AND batter_id IS NOT NULL""").fetchall()}
    con.execute(f"""CREATE OR REPLACE TABLE hold AS SELECT * FROM read_parquet('{d}')
                    WHERE match_date >= DATE '{cutoff}' AND NOT is_super_over""")

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
        for inn0, lg in enumerate(part.innings):
            actual = mt["innings"][inn0][2]
            sim = lg.runs
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
                sim_r = lg.bat_runs[:, s]
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
    return score(res, cutoff, len(matches))


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
    if rep.get("player_runs"):
        L += ["## Player runs", "", "| Group | Innings | Predicted mean | Actual mean | In 80% band | Brier 30+ (base rate) | Corr |",
              "|---|---|---|---|---|---|---|"]
        for g, r in rep["player_runs"].items():
            L.append(f"| {g} | {r['n']} | {r['mean_predicted']} | {r['mean_actual']} | {100 * r['in_80pct_band']:.1f}% | "
                     f"{r['brier_30plus']} ({r['brier_30plus_base_rate']}) | {r['corr_pred_actual']} |")
        L.append("")
    if "bowler_wickets" in rep:
        b = rep["bowler_wickets"]
        L += ["## Bowler wickets", "", f"Brier for 2+ wickets **{b['brier_2plus']}** (base rate {b['brier_2plus_base_rate']}) · "
              f"mean predicted {b['mean_predicted']} v actual {b['mean_actual']}", ""]
    path.with_suffix(".md").write_text("\n".join(L) + "\n")
