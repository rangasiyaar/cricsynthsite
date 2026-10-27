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
from cricsim.engine.model import RECENT, Model
from cricsim.engine.simulate import RECENT_ROLE, simulate
from cricsim.engine.spec import MatchSpec, TeamSpec
from cricsim.fantasy import actual_points, decisive_mean, pick_xi, portfolio, sim_features, team_points
from cricsim.fantasy import sim_points as _sim_points

log = logging.getLogger(__name__)


def holdout_matches(con, parquet: Path, cutoff: date, limit: int, seed: int = 0, end: date | None = None,
                    twelve: bool = False, skipped: dict | None = None, latest: bool = False,
                    latest_format: str = "T20", teams: list[str] | None = None, family_only: bool = False) -> list[dict]:
    """Held-out matches with both XIs. Matches listing 12 players a side (an Impact Player or other substitute
    rule) are skipped and counted in `skipped`, or with twelve=True kept with the first 11 listed as the XI (what a
    forecast from the announced XI sees). latest=True: the most recent matches of `latest_format` (T20 = any
    T20-type format), between two of `teams` when given, instead of a random draw."""
    m = (parquet / "matches" / "*.parquet").as_posix()
    mp = (parquet / "match_players" / "*.parquet").as_posix()
    inn = (parquet / "innings" / "*.parquet").as_posix()
    rows = con.execute(f"""
        WITH ok AS (
          SELECT match_id FROM read_parquet('{inn}') WHERE NOT is_super_over AND innings_no <= 2
          GROUP BY 1 HAVING count(*) = 2)
        SELECT m.match_id, m.format, m.gender, m.venue_id, m.team_type,
               coalesce(m.competition_id, 'intl-' || coalesce(m.team_type, '') || '-' || m.format) AS comp,
               m.team1, m.team2, m.winner, m.result, m.overs, m.method, m.match_date, m.toss_winner, m.toss_decision
        FROM read_parquet('{m}') m JOIN ok USING (match_id)
        WHERE m.match_date >= DATE '{cutoff}' {f"AND m.match_date < DATE '{end}'" if end else ""} AND m.format IN ('T20', 'HUNDRED', 'OD', 'T10')
          AND m.gender IN ('male', 'female') AND m.method IS NULL
          {(("AND m.format = 'OD'" if latest_format == "OD" else "AND m.format IN ('T20', 'HUNDRED', 'T10')")
            + (" AND m.team1 IN (" + ",".join("'" + t.replace("'", "''") + "'" for t in teams) + ")"
               " AND m.team2 IN (" + ",".join("'" + t.replace("'", "''") + "'" for t in teams) + ")" if teams else ""))
           if latest or family_only else ""}
        ORDER BY {"m.match_date DESC, m.match_id DESC" if latest else f"hash(m.match_id || '{seed}')"}
        LIMIT {4 * limit if latest else limit}""").fetchall()
    out = []
    for mid, fmt, gender, venue, team_type, comp, t1, t2, winner, result, overs, method, day, toss_w, toss_d in rows:
        xi = {}
        for team in (t1, t2):
            xi[team] = [r[0] for r in con.execute(
                f"SELECT player_id FROM read_parquet('{mp}') WHERE match_id = ? AND team = ? ORDER BY list_order",
                [mid, team]).fetchall()]
        if any(None in v for v in xi.values()):
            continue
        listed = max(len(v) for v in xi.values())
        full = None
        if listed > 11 and min(len(v) for v in xi.values()) >= 11:
            if skipped is not None:
                skipped[comp] = skipped.get(comp, 0) + 1
            if not twelve:
                continue
            full = {t: list(v) for t, v in xi.items()}
            xi = {t: v[:11] for t, v in xi.items()}
        elif any(len(v) != 11 for v in xi.values()):
            continue
        innings = con.execute(f"""SELECT innings_no, team, runs, wickets FROM read_parquet('{inn}')
                                  WHERE match_id = ? AND innings_no <= 2 ORDER BY innings_no""", [mid]).fetchall()
        out.append({"match_id": mid, "format": fmt, "gender": gender, "venue_id": venue, "comp": comp, "team_type": team_type,
                    "teams": [t1, t2], "xi": xi, "winner": winner, "result": result, "innings": innings,
                    "date": day, "listed": listed, "toss_winner": toss_w, "toss_decision": toss_d, "full": full})
    return out[:limit]


def impact_xis(model: Model, team: TeamSpec, squad: list[str], fmt: str) -> TeamSpec:
    """A 12-player side under a substitute rule: it bats its 11 best batters (the 12 minus the player who usually
    bats lowest) and fields its 11 best bowlers (the 12 minus the one who bowls least)."""
    if len(squad) <= 11:
        return team
    fam = 1 if fmt == "OD" else 0
    idx = [model.pid(p) for p in squad]
    pos = [model.bat_pos[i, fam] if i and model.bat_pos is not None and model.bat_pos[i, fam] > 0 else 8.0 for i in idx]
    balls = [model.balls_bowled[i, fam] if i and model.balls_bowled is not None else 0.0 for i in idx]
    keep = len(squad) - 11
    bat = [squad[j] for j in sorted(np.argsort(pos, kind="stable")[:11])]
    field = [squad[j] for j in sorted(np.argsort(balls, kind="stable")[keep:])]
    bowlers = [p for p in (team.bowlers or []) if p in field] or None
    return TeamSpec(team.name, bat, bowlers, bowling_xi=field)


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
        rr = (model.meta.get("sim") or {}).get("recent_role", RECENT_ROLE)
        if rr and pos > 0 and model.bat_pos_recent is not None and model.bat_pos_recent[model.pid(p), fam] > 0:
            w = rr * float(model.recent_n[model.pid(p), fam]) / RECENT        # current role counts extra
            pos = (1 - w) * pos + w * float(model.bat_pos_recent[model.pid(p), fam])
        keyed.append((pos if pos > 0 else i + 1 + 0.5, i, p))
    return [p for _, _, p in sorted(keyed)]


def run_backtest(parquet: Path, cutoff: date, limit: int = 600, n_sims: int = 1000,
                 model: Model | None = None, memory: str = "4GB", insample: int = 0,
                 half_life: float | None = None, fantasy_bowlers: bool = False, fit_overrides: dict | None = None,
                 sim_overrides: dict | None = None, order: str = "history", roles: bool = False,
                 twelve: bool = False, latest: int = 0, latest_format: str = "T20",
                 latest_teams: list[str] | None = None, fantasy_rows: bool = False, stack_rows: bool = False,
                 end: date | None = None) -> dict:
    """fit_overrides: FitConfig fields for a model variant, e.g. {"comp_groups": "club", "shrink": {"bat": 150}};
    sim_overrides: simulator settings, e.g. {"slot_usage": True, "bowl_focus": 3.0}.
    latest: test on the most recent N T20-type matches instead, the model trained up to the day before the first.
    fantasy_rows: also return every fantasy match's players (predictions, recent real points, real points) as
    rep["fantasy_rows"], for cricsim.fantasy_lab.
    stack_rows: also return every match's win chance and players' runs and wickets predictions next to real recent
    form, team results and the outcome as rep["stack_rows"], for cricsim.stack_lab (one format family: with
    a cutoff, only `latest_format` matches are drawn). end: only matches before this date (an earlier test window)."""
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    if latest:
        recent = holdout_matches(con, parquet, date(1990, 1, 1), latest, twelve=twelve, latest=True,
                                 latest_format=latest_format, teams=latest_teams)
        cutoff, limit = min(m["date"] for m in recent), latest
    over = dict(fit_overrides or {})
    if "shrink" in over:
        over["shrink"] = {**FitConfig().shrink, **over["shrink"]}
    cfg = FitConfig(cutoff=cutoff, **({"half_life_years": half_life} if half_life else {}), **over)
    model = model or fit(parquet, cfg, memory=memory, con=con)
    if sim_overrides:
        model.meta["sim"] = dict(sim_overrides)
    rep = _run(con, parquet, model, cutoff, end, limit, n_sims, fantasy_bowlers, order, roles, twelve, bool(latest),
               latest_format, latest_teams, fantasy_rows, stack_rows)
    rep["half_life_years"] = cfg.half_life_years
    rep["variant"] = {"order": order, "roles": roles, "phase_skill": cfg.phase_skill, "comp_groups": cfg.comp_groups, "experience": cfg.experience, "home": cfg.home,
                      "collapse": cfg.collapse, "bat_switch": cfg.bat_switch, "era_team_type": cfg.era_team_type,
                      "chase_wickets": cfg.chase_wickets, "rule_split": cfg.rule_split, "sim": sim_overrides or {},
                      "shrink": {k: v for k, v in cfg.shrink.items() if FitConfig().shrink.get(k) != v}}
    if insample:      # same model on its own last six months: tells model bias apart from drift after the cutoff
        start = date(cutoff.year - (cutoff.month <= 6), (cutoff.month - 7) % 12 + 1, 1)
        log.info("in-sample check from %s", start)
        ins = _run(con, parquet, model, start, cutoff, insample, n_sims, False)
        rep["insample"] = {"from": str(start), "team_innings": ins.get("team_innings"), "chase": ins.get("chase"),
                           "first_innings_by_group": ins.get("first_innings_by_group")}
    return rep


def _run(con, parquet: Path, model: Model, cutoff: date, end: date | None, limit: int, n_sims: int,
         fantasy_bowlers: bool = False, order: str = "history", roles: bool = False, twelve: bool = False,
         latest: bool = False, latest_format: str = "T20", latest_teams: list[str] | None = None,
         fantasy_rows: bool = False, stack_rows: bool = False) -> dict:
    skipped: dict = {}
    matches = holdout_matches(con, parquet, cutoff, limit, end=end, twelve=twelve, skipped=skipped, latest=latest,
                              latest_format=latest_format, teams=latest_teams, family_only=stack_rows)
    od_fantasy = latest and latest_format == "OD"          # one-day fantasy only when asked for (separate benchmark)
    history = None
    if fantasy_rows:
        from cricsim import fantasy_history
        history = fantasy_history.build(con, parquet, "OD" if od_fantasy else "T20")
    stats = None
    if stack_rows:
        from cricsim import fantasy_history
        from cricsim.direct_features import Builder
        fam = "OD" if latest_format == "OD" else "T20"
        stats = fantasy_history.build_stats(con, parquet, fam)
        direct = Builder(con, parquet, fam)
    log.info("backtesting %d matches", len(matches))
    d = (parquet / "deliveries" / "*.parquet").as_posix()
    seen = {r[0] for r in con.execute(f"""
        SELECT DISTINCT batter_id || '|' || coalesce(competition_id, 'intl-' || coalesce(team_type, '') || '-' || format)
        FROM read_parquet('{d}') WHERE match_date < DATE '{cutoff}' AND batter_id IS NOT NULL""").fetchall()}
    con.execute(f"""CREATE OR REPLACE TABLE hold AS SELECT * FROM read_parquet('{d}')
                    WHERE match_date >= DATE '{cutoff}' {f"AND match_date < DATE '{end}'" if end else ""}
                    AND NOT is_super_over""")
    if any((parquet / "wickets").glob("*.parquet")):
        con.execute(f"""CREATE OR REPLACE VIEW hold_wickets AS SELECT match_id, kind, fielder_ids, bowler_id, is_super_over
                        FROM read_parquet('{(parquet / "wickets" / "*.parquet").as_posix()}')
                        WHERE match_date >= DATE '{cutoff}'""")

    res = {"win": [], "score": [], "players": [], "bowlers": []}
    for mt in matches:
        t1, t2 = mt["teams"]
        first_team = mt["innings"][0][1]
        bf = 0 if first_team == t1 else 1
        xi = ((lambda t: list(mt["xi"][t])) if order == "sheet"     # the team sheet, as live forecasts use it
              else (lambda t: _xi_order(model, mt["xi"][t], mt["format"])))
        bowl = {}
        if roles:           # who bowls, as a fixture's roles tell live forecasts (here: who did bowl)
            did = {r[0] for r in con.execute("SELECT DISTINCT bowler_id FROM hold WHERE match_id = ?",
                                             [mt["match_id"]]).fetchall()}
            bowl = {t: [p for p in (mt.get("full") or mt["xi"])[t] if p in did] or None for t in (t1, t2)}
        comp_key = mt["comp"] + ("|ip" if mt.get("listed", 11) > 11 and model.meta.get("rule_split") else "")
        teams = [TeamSpec(t1, xi(t1), bowl.get(t1)), TeamSpec(t2, xi(t2), bowl.get(t2))]
        if mt.get("full") and (model.meta.get("sim") or {}).get("impact12"):
            teams = [impact_xis(model, tm, mt["full"][tm.name], mt["format"]) for tm in teams]
        spec = MatchSpec(mt["format"], mt["gender"], tuple(teams),
                         venue_id=mt["venue_id"], comp_key=comp_key, batting_first=bf, team_type=mt["team_type"])
        sims = simulate(model, spec, n=n_sims, seed=zlib.crc32(mt["match_id"].encode()))
        part = sims.parts[0]
        p1 = float((part.winner == 0).mean())
        if mt["winner"] in (t1, t2):
            res["win"].append((p1, 1.0 if mt["winner"] == t1 else 0.0, mt["format"]))
            # the chase: how often it succeeds, and how far short failed chases fall (sims v actual)
            r1, r2 = part.innings[0].runs, part.innings[1].runs
            fail = r2 <= r1
            act_won = mt["winner"] != first_team
            won_sim = part.winner == 1 - bf
            res.setdefault("chase", []).append({
                "p": float(won_sim.mean()), "won": act_won,
                "short_sim": float((r1 - r2)[fail].mean()) if fail.any() else None,
                "short_act": None if act_won else float(mt["innings"][0][2] - mt["innings"][1][2]),
                "r2_won_sim": float(r2[won_sim].mean()) if won_sim.any() else None,
                "r2_lost_sim": float(r2[~won_sim].mean()) if (~won_sim).any() else None,
                "r2_act": float(mt["innings"][1][2]),
                "toss": ("chose to chase" if mt.get("toss_decision") == "field" else "chose to bat first")
                        if mt.get("toss_winner") else None,
                "listed": mt.get("listed", 11)})
        actual_order = batting_order(con, mt["match_id"])
        stack = None
        if stats is not None:
            stack = {"date": mt["date"], "format": mt["format"], "label": f"{mt['date']} · {t1} v {t2} ({mt['comp']})",
                     "win": None, "bat": [], "bowl": []}
            res.setdefault("stack", []).append(stack)
            ctx = direct.context(mt["date"], mt["venue_id"], mt["comp"], mt["xi"], [t1, t2], bf,
                                 spec.rules["overs"] * spec.rules["bpo"], mt["gender"] == "female",
                                 mt["team_type"] == "international")
            if mt["winner"] in (t1, t2):
                stack["win"] = {"p": p1, "won": mt["winner"] == t1, "bf": bf, "x": direct.match(ctx),
                                "t1": _form(stats["teams"], t1, mt["date"]), "t2": _form(stats["teams"], t2, mt["date"]),
                                "h2h": _form(stats["h2h"], f"{t1}|{t2}", mt["date"])}
        if mt["format"] != "OD" or od_fantasy:
            res.setdefault("fantasy", []).append(_fantasy(con, model, spec, sims, mt, n_sims, fantasy_bowlers,
                                                          actual_order, history))
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
                                               "finished": mt["result"] != "no result",
                                               "split": {"competition": "seen" if model.comp(mt["comp"]) else "new",
                                                         "venue": "seen" if model.venue(mt["venue_id"]) else "new",
                                                         "unknown batters": "0" if n_new == 0 else
                                                         "1-2" if n_new <= 2 else "3+",
                                                         "months after cutoff": _horizon(mt["date"], cutoff),
                                                         "players listed": "12 (substitute rule)" if mt.get("listed", 11) > 11 else "11"},
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
        runs_by, balls_by, wk_by, bowled_by, conceded_by = _actual_player_stats(con, mt["match_id"])
        draw = np.random.default_rng(zlib.crc32(mt["match_id"].encode()) + 7)   # one simulated outcome per player:
                                                                                 # what a perfect model would face
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
                if stack is not None:
                    stack["bat"].append({"p": p, "team": (bf + inn0) % 2, "slot": s + 1, "mean": float(sim_r.mean()),
                                         "p30": float((sim_r >= 30).mean()), "p_bat": float(batted.mean()),
                                         "balls": float(lg.bat_balls[batted, s].mean()), "known": model.knows(p),
                                         "actual": act, "form": _form(stats["runs"], p, mt["date"], hit=30),
                                         "x": direct.batter(p, ctx, spec.teams[(bf + inn0) % 2].name, s + 1)})
                res["players"].append({"group": group, "pred_mean": float(sim_r.mean()), "actual": act,
                                       "in80": bool(np.percentile(sim_r, 10) <= act <= np.percentile(sim_r, 90)),
                                       "p30": float((sim_r >= 30).mean()), "hit30": act >= 30,
                                       "draw": float(sim_r[draw.integers(len(sim_r))]),
                                       "pred_balls": float(lg.bat_balls[batted, s].mean()),
                                       "act_balls": balls_by.get(p, 0)})
            for j, p in enumerate(lg.bowlers):
                if p not in wk_by:
                    continue
                bowled = lg.bowl_balls[:, j] > 0              # compare like with like: simulations where he bowled
                if not bowled.any():
                    continue
                sim_w = lg.bowl_wkts[bowled, j]
                quota = spec.rules["quota"] * spec.rules["bpo"]
                act_b = bowled_by.get(p, 0)
                sim_c = lg.bowl_runs[bowled, j]
                act_c = conceded_by.get(p, 0)
                if stack is not None:
                    stack["bowl"].append({"p": p, "mean": float(sim_w.mean()), "p2": float((sim_w >= 2).mean()),
                                          "p_bowls": float(bowled.mean()), "balls": float(lg.bowl_balls[bowled, j].mean()),
                                          "known": model.knows(p), "actual": wk_by[p],
                                          "form": _form(stats["wkts"], p, mt["date"], hit=2),
                                          "x": direct.bowler(p, ctx, spec.teams[(bf + inn0 + 1) % 2].name)})
                res["bowlers"].append({"p2": float((sim_w >= 2).mean()), "hit2": wk_by[p] >= 2,
                                       "pred_conceded": float(sim_c.mean()), "act_conceded": act_c,
                                       "conceded_in80": bool(np.percentile(sim_c, 10) <= act_c <= np.percentile(sim_c, 90)),
                                       "draw_conceded": float(sim_c[draw.integers(len(sim_c))]),
                                       "pred_econ": float(6 * sim_c.sum() / max(lg.bowl_balls[bowled, j].sum(), 1)),
                                       "act_econ": 6 * act_c / act_b if act_b else None,
                                       "pred_mean": float(sim_w.mean()), "actual": wk_by[p],
                                       "known": model.knows(p), "p_bowls": float(bowled.mean()),
                                       "pred_balls": float(lg.bowl_balls[bowled, j].mean()), "act_balls": act_b,
                                       "share": "full quota" if act_b >= quota else
                                                "half+ quota" if act_b >= quota / 2 else "under half"})
    rep = score(res, cutoff, len(matches))
    if fantasy_rows:
        rep["fantasy_rows"] = [r["rows"] for r in res.get("fantasy", []) if "rows" in r]
    if stack_rows:
        rep["stack_rows"] = res.get("stack", [])
    rep["listed_12"] = dict(sorted(skipped.items(), key=lambda kv: -kv[1]))
    rep["listed_12_included"] = twelve
    rep["era_recent"] = model.meta.get("fit", {}).get("era_recent")
    return rep


def _form(hist, key: str, day, hit: float | None = None) -> dict:
    from cricsim.fantasy_history import form
    return form(hist, key, day, hit)


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
             actual_order: dict | None = None, history=None) -> dict:
    """Pick fantasy XIs from the simulations, score them on the real match (fielding on both sides or neither)."""
    team_of = {p: k for k, t in enumerate(spec.teams) for p in t.everyone}
    mode = (model.meta.get("sim") or {}).get("fielding")     # "real": fielding scored, not used in picks; "both"
    events = _fielding_events(con, mt["match_id"]) if mode else None
    real = actual_points(con, mt["match_id"], fielding=events, od=mt["format"] == "OD")
    real = {p: 4.0 + real.get(p, 0.0) for p in team_of}      # playing points for everyone in the XI
    in_picks = mode in ("both", True) and model.fielding is not None

    def sim_points(s):
        return _sim_points(s, model=model, fielding=in_picks)
    pids, pts = sim_points(sims)
    mean = dict(zip(pids, pts.mean(0)))
    upside = dict(zip(pids, np.percentile(pts, 90, axis=0)))
    out = {"label": f"{mt['date']} · {mt['teams'][0]} v {mt['teams'][1]} ({mt['comp']})"}
    xi, c, vc = pick_xi(mean, team_of)
    out["mean"] = team_points(xi, c, vc, real)
    out["overlap"] = len(set(xi) & set(pick_xi(real, team_of)[0]))
    # ceiling: the same single team inside the simulations, v each simulation's own best team
    # (what a perfect model could reach; only cricket's randomness stands in the way)
    srt = -np.sort(-pts, axis=1)
    out["ceil_team"] = float(_xi_score(pids, pts, (xi, c, vc)).mean())
    out["ceil_best"] = float((srt[:, :11].sum(1) + srt[:, 0] + 0.5 * srt[:, 1]).mean())
    # captain diagnostics: how the top candidates' predicted points compare with what they scored, by role
    win = np.concatenate([p.winner for p in sims.parts])
    slot, bowl = {}, {}
    for part in sims.parts:
        for lg in part.innings:
            for k, p in enumerate(lg.order):
                slot[p] = k + 1
            for k, p in enumerate(lg.bowlers):
                bowl[p] = bowl.get(p, 0.0) + float(lg.bowl_balls[:, k].sum()) / sims.n
    sd = dict(zip(pids, pts.std(0)))
    top = sorted(xi, key=lambda p: -mean[p])[:6]
    out["cap_rows"] = [{"rank": i + 1, "pred": float(mean[p]), "real": float(real[p]), "sd": float(sd[p]),
                        "slot": slot.get(p, 11), "bowl": bowl.get(p, 0.0),
                        "win": float((win == team_of[p]).mean()), "best": p == max(xi, key=lambda q: real[q])}
                       for i, p in enumerate(top)]
    # captain rules a fantasy expert might use (vice-captain: the best of the rest by expected points)
    p25 = dict(zip(pids, np.percentile(pts, 25, axis=0)))
    is_ar = {p: bowl.get(p, 0.0) >= 12 and slot.get(p, 11) <= 7 for p in xi}
    fav_side = int((win == 1).mean() > 0.5)

    def by_rule(ok, key=mean):
        pool = [p for p in xi if ok(p)] or xi
        cap = max(pool, key=lambda p: key[p])
        vc_ = max((p for p in xi if p != cap), key=lambda p: mean[p])
        return team_points(xi, cap, vc_, real)
    out["cap_top_order"] = by_rule(lambda p: slot.get(p, 11) <= 3 and bowl.get(p, 0.0) < 12)
    out["cap_all_rounder"] = by_rule(lambda p: is_ar[p])
    out["cap_favoured_side"] = by_rule(lambda p: team_of[p] == fav_side)
    out["cap_floor"] = by_rule(lambda p: True, p25)
    # winner's-curse correction: the highest of several noisy estimates is too high, more so the noisier it is
    for k in (0.1, 0.2, 0.3):
        out[f"cap_shrink_{k}"] = by_rule(lambda p: True, {p: mean[p] - k * sd[p] for p in pids})
    # more decisive matches: reweight simulations so the favourite wins more often (log-odds × s)
    for st in (1.2, 1.4):
        wmean = dict(zip(pids, decisive_mean(pts, win, st)))
        out[f"cap_stretch_{st}"] = by_rule(lambda p: True, wmean)
        out[f"xi_stretch_{st}"] = team_points(*pick_xi(wmean, team_of), real)
    # where the points go: our XI with hindsight captain / vice-captain
    rc = sorted(xi, key=lambda p: -real[p])
    out["oracle_captain"] = team_points(xi, rc[0], rc[1], real)
    # "most probable scenario" teams
    d = np.abs(pts - pts.mean(0)).sum(1)                 # (a) the single most typical simulation
    out["typical_sim"] = team_points(*pick_xi(dict(zip(pids, pts[int(np.argmin(d))])), team_of), real)
    win = np.concatenate([p.winner for p in sims.parts])
    first = np.concatenate([p.innings[0].runs for p in sims.parts])
    fav = 0 if (win == 0).mean() >= 0.5 else 1
    band = np.digitize(first, np.percentile(first, [33.3, 66.7]))
    key = win * 3 + band                                  # (b) most common (winner, first-innings band) scenario
    common = np.bincount(key, minlength=6).argmax()
    out["common_scenario"] = team_points(*pick_xi(dict(zip(pids, pts[key == common].mean(0))), team_of), real)
    out["favourite_wins"] = team_points(*pick_xi(dict(zip(pids, pts[win == fav].mean(0))), team_of), real)  # (c)
    if history is not None:          # every player: what we predicted, recent real form, what he scored
        feats = sim_features(model, sims, pids, pts, team_of)
        out["rows"] = {"match": mt["match_id"], "date": str(mt["date"]), "label": out["label"], "format": mt["format"],
                       "players": [{"p": p, "team": team_of[p], **feats[p], "real": float(real[p]),
                                    **history.features(p, mt["date"])} for p in pids]}
    ptop = _p_top(pids, pts, xi)
    pc = sorted(xi, key=lambda p: -ptop[p])
    out["ptop_captain"] = team_points(xi, pc[0], pc[1], real)
    xi, c, vc = pick_xi(mean, team_of, captain_score=upside)
    out["upside_captain"] = team_points(xi, c, vc, real)
    xi, c, vc = pick_xi(real, team_of)
    out["best"] = team_points(xi, c, vc, real)
    teams = portfolio(pids, pts, team_of, k=20)
    got = [team_points(*t, real) for t in teams]
    for j in (3, 5, 10, 20):
        out[f"portfolio_{j}"] = max(got[:j])
    teams = portfolio(pids, pts, team_of, k=20, captains=5)
    got = [team_points(*t, real) for t in teams]
    for j in (5, 10, 20):
        out[f"portfolio_cap_{j}"] = max(got[:j])
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
        spec2 = MatchSpec(spec.format, spec.gender, tuple(TeamSpec(t.name, t.players, [p for p in t.everyone if p in used], bowling_xi=t.bowling_xi)
                                                          for t in spec.teams),
                          venue_id=spec.venue_id, comp_key=spec.comp_key, batting_first=spec.batting_first,
                          team_type=spec.team_type)
        sims2 = simulate(model, spec2, n=n_sims, seed=zlib.crc32(mt["match_id"].encode()))
        pids2, pts2 = sim_points(sims2)
        xi, c, vc = pick_xi(dict(zip(pids2, pts2.mean(0))), team_of)
        out["bowlers_known"] = team_points(xi, c, vc, real)
        # toss unknown: half the simulations each way (the backtest otherwise knows who batted first)
        spec_u = MatchSpec(spec.format, spec.gender, spec.teams, venue_id=spec.venue_id, comp_key=spec.comp_key,
                           team_type=spec.team_type)
        pids_u, pts_u = sim_points(simulate(model, spec_u, n=n_sims, seed=zlib.crc32(mt["match_id"].encode()) + 1))
        out["toss_unknown"] = team_points(*pick_xi(dict(zip(pids_u, pts_u.mean(0))), team_of), real)
        # full team news: real batting order and who bowls; then also captain by top-scorer chance
        if actual_order:
            def order(t):
                k = {p: v for (_, p), v in actual_order.items() if p in t.players}
                return sorted(t.players, key=lambda p: (k.get(p, 10 ** 6), t.players.index(p)))
            spec3 = MatchSpec(spec.format, spec.gender,
                              tuple(TeamSpec(t.name, order(t), [p for p in t.everyone if p in used], bowling_xi=t.bowling_xi) for t in spec.teams),
                              venue_id=spec.venue_id, comp_key=spec.comp_key, batting_first=spec.batting_first,
                              team_type=spec.team_type)
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


def _fielding_events(con, match_id: str) -> list:
    """(kind, fielder ids, bowler id) per dismissal of the held-out match (from the wickets table)."""
    if not con.execute("SELECT count(*) FROM duckdb_views() WHERE view_name = 'hold_wickets'").fetchone()[0]:
        return []
    return con.execute("""SELECT kind, fielder_ids, bowler_id FROM hold_wickets
                          WHERE match_id = ? AND NOT is_super_over""", [match_id]).fetchall()


def _actual_player_stats(con, match_id: str):
    runs = dict(con.execute(f"""SELECT batter_id, sum(runs_batter) FROM hold
                                WHERE match_id = ? GROUP BY 1""", [match_id]).fetchall())
    balls = dict(con.execute(f"""SELECT batter_id, count(*) FROM hold
                                 WHERE match_id = ? AND wides = 0 GROUP BY 1""", [match_id]).fetchall())
    wk = dict(con.execute(f"""SELECT bowler_id, sum(CASE WHEN wicket_kind IN ('bowled','caught','lbw','stumped',
                              'caught and bowled','hit wicket') THEN 1 ELSE 0 END)
                              FROM hold WHERE match_id = ? GROUP BY 1""",
                           [match_id]).fetchall())
    bowled = dict(con.execute("""SELECT bowler_id, count(*) FILTER (WHERE wides = 0 AND noballs = 0) FROM hold
                                 WHERE match_id = ? GROUP BY 1""", [match_id]).fetchall())
    conceded = dict(con.execute("""SELECT bowler_id, sum(runs_batter + wides + noballs) FROM hold
                                   WHERE match_id = ? GROUP BY 1""", [match_id]).fetchall())
    return runs, balls, wk, bowled, conceded


def _sharpen(p: np.ndarray, y: np.ndarray) -> dict:
    """How far win chances sit from where they should: the stretch a (on the log-odds scale) that would minimise the
    Brier score on these matches. a > 1: the forecasts are too cautious; a < 1: too bold. Fitted on the same
    matches, so the Brier it reaches is an optimistic ceiling for a calibration step."""
    lo = np.log(np.clip(p, 0.005, 0.995) / (1 - np.clip(p, 0.005, 0.995)))
    grid = np.round(np.arange(0.5, 3.01, 0.05), 2)
    briers = [float(((1 / (1 + np.exp(-a * lo)) - y) ** 2).mean()) for a in grid]
    k = int(np.argmin(briers))
    fixed = {str(a): round(float(((1 / (1 + np.exp(-a * lo)) - y) ** 2).mean()), 4) for a in (1.1, 1.2, 1.3)}
    return {"sharpen": float(grid[k]), "brier_sharpened": round(briers[k], 4), "brier_fixed_stretch": fixed}


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
                         "calibration": _calibration([(a, b) for a, b, _ in res["win"]], 5),
                         **_sharpen(p, y)}
    if res.get("chase"):
        c = res["chase"]
        ss = [r["short_sim"] for r in c if r["short_sim"] is not None]
        sa = [r["short_act"] for r in c if r["short_act"] is not None]
        # weighted by each match's chance of the outcome, so predicted and actual describe the same matches
        def wmean(key, wkey):
            v = [(r[key], r[wkey]) for r in c if r[key] is not None]
            w = sum(x for _, x in v)
            return round(float(sum(a * x for a, x in v) / w), 1) if w else None
        for r in c:
            r["q"] = 1 - r["p"]
        lost = [r["r2_act"] for r in c if not r["won"]]
        won = [r["r2_act"] for r in c if r["won"]]
        out["chase"] = {"n": len(c), "win_predicted": round(float(np.mean([r["p"] for r in c])), 3),
                        "win_actual": round(float(np.mean([r["won"] for r in c])), 3),
                        "failed_short_by_predicted": wmean("short_sim", "q"),
                        "failed_short_by_actual": round(float(np.mean(sa)), 1) if sa else None,
                        "won_runs_predicted": wmean("r2_won_sim", "p"),
                        "won_runs_actual": round(float(np.mean(won)), 1) if won else None,
                        "lost_runs_predicted": wmean("r2_lost_sim", "q"),
                        "lost_runs_actual": round(float(np.mean(lost)), 1) if lost else None}
        # the toss as information: a captain who chose to chase expects something (dew, a flat second-innings
        # pitch); a side made to chase was sent in. Chasing side's win chance, predicted v actual, by toss call.
        by = {}
        for r in c:
            if r.get("toss"):
                by.setdefault(r["toss"], []).append(r)
            by.setdefault(f"{r.get('listed', 11)} listed", []).append(r)
        out["chase_by"] = {k: {"n": len(v), "win_predicted": round(float(np.mean([r["p"] for r in v])), 3),
                               "win_actual": round(float(np.mean([r["won"] for r in v])), 3),
                               "brier": round(float(np.mean([(r["p"] - r["won"]) ** 2 for r in v])), 4)}
                           for k, v in by.items()}
    if res.get("team"):
        out["team_innings"] = {}
        for inn in (1, 2, "2, finished matches"):
            rows = [r for r in res["team"] if r["inn"] == inn
                    or (inn == "2, finished matches" and r["inn"] == 2 and r.get("finished", True))]
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
                                                        [r["actual"] for r in rows])[0, 1]), 3) if len(rows) > 2 else None,
            **({"brier_30plus_ceiling": round(float(np.mean([r["p30"] * (1 - r["p30"]) for r in rows])), 4),
                "corr_ceiling": round(float(np.corrcoef([r["pred_mean"] for r in rows],
                                                        [r["draw"] for r in rows])[0, 1]), 3),
                "balls_predicted": round(float(np.mean([r["pred_balls"] for r in rows])), 1),
                "balls_actual": round(float(np.mean([r["act_balls"] for r in rows])), 1),
                "corr_balls": round(float(np.corrcoef([r["pred_balls"] for r in rows],
                                                      [r["act_balls"] for r in rows])[0, 1]), 3)}
               if "draw" in rows[0] and len(rows) > 2 else {})}
    if res.get("fantasy"):
        f = res["fantasy"]
        best = np.mean([r["best"] for r in f])
        out["fantasy"] = {"n": len(f), "best_possible": round(float(best), 1),
                          "overlap_with_best_xi": round(float(np.mean([r["overlap"] for r in f])), 2),
                          "strategies": {k: {"points": round(float(np.mean([r[k] for r in f])), 1),
                                             "share_of_best": round(float(np.mean([r[k] for r in f]) / best), 3)}
                                         for k in ("random", "mean", "typical_sim", "common_scenario",
                                                   "favourite_wins", "upside_captain", "ptop_captain",
                                                   "oracle_captain", "toss_unknown", "bowlers_known", "team_news",
                                                   "team_news_ptop", "team_news_oracle_captain", "captains_5",
                                                   "cap_top_order", "cap_all_rounder", "cap_favoured_side", "cap_floor",
                                                   "cap_shrink_0.1", "cap_shrink_0.2", "cap_shrink_0.3",
                                                   "cap_stretch_1.2", "cap_stretch_1.4", "xi_stretch_1.2", "xi_stretch_1.4",
                                                   "random_5", "portfolio_3", "portfolio_5", "portfolio_10", "portfolio_20",
                                                   "portfolio_cap_5", "portfolio_cap_10", "portfolio_cap_20")
                                         if all(k in r for r in f)},
                          "ceiling_perfect_model": round(float(np.mean([r["ceil_team"] for r in f])
                                                               / np.mean([r["ceil_best"] for r in f])), 3)}
        if len(f) <= 30:
            out["fantasy"]["per_match"] = [
                {"match": r["label"], "best": round(r["best"], 1),
                 **{k: round(r[k] / r["best"], 3) for k in ("mean", "oracle_captain", "portfolio_cap_5",
                                                             "portfolio_cap_10", "portfolio_cap_20") if k in r}}
                for r in f]
        rows = [c for r in f for c in r.get("cap_rows", [])]
        if rows:
            def role(c):
                if c["bowl"] >= 12 and c["slot"] <= 7:
                    return "all-rounder (bats 1-7, bowls 2+ overs)"
                if c["bowl"] >= 12:
                    return "bowler"
                return "top order (1-3)" if c["slot"] <= 3 else "middle order (4-7)" if c["slot"] <= 7 else "tail"
            groups: dict[str, list] = {}
            for c in rows:
                for g in (f"rank {c['rank']} by expected points", role(c),
                          "side favoured to win" if c["win"] >= 0.5 else "side not favoured",
                          "steady (sd below 0.8 × mean)" if c["sd"] < 0.8 * c["pred"] else "volatile"):
                    groups.setdefault(g, []).append(c)
            out["fantasy"]["captain_candidates"] = {
                g: {"n": len(v), "pred": round(float(np.mean([c["pred"] for c in v])), 1),
                    "real": round(float(np.mean([c["real"] for c in v])), 1),
                    "top_of_xi": round(float(np.mean([c["best"] for c in v])), 3)}
                for g, v in sorted(groups.items())}
    if res["bowlers"]:
        b = res["bowlers"]
        out["bowler_wickets"] = {"n": len(b), "brier_2plus": round(float(np.mean([(r["p2"] - r["hit2"]) ** 2 for r in b])), 4),
                                 "brier_2plus_base_rate": round(float(np.var([r["hit2"] for r in b])), 4),
                                 "mean_predicted": round(float(np.mean([r["pred_mean"] for r in b])), 3),
                                 "mean_actual": round(float(np.mean([r["actual"] for r in b])), 3),
                                 "calibration_2plus": _calibration([(r["p2"], float(r["hit2"])) for r in b], 5)}
        if "draw_conceded" in b[0]:
            ec = [r for r in b if r["act_econ"] is not None and r["act_balls"] >= 12]     # 2+ overs bowled
            out["bowler_wickets"].update({
                "brier_2plus_ceiling": round(float(np.mean([r["p2"] * (1 - r["p2"]) for r in b])), 4),
                "conceded_predicted": round(float(np.mean([r["pred_conceded"] for r in b])), 1),
                "conceded_actual": round(float(np.mean([r["act_conceded"] for r in b])), 1),
                "conceded_in80": round(float(np.mean([r["conceded_in80"] for r in b])), 3),
                "conceded_corr": round(float(np.corrcoef([r["pred_conceded"] for r in b],
                                                         [r["act_conceded"] for r in b])[0, 1]), 3),
                "conceded_corr_ceiling": round(float(np.corrcoef([r["pred_conceded"] for r in b],
                                                                 [r["draw_conceded"] for r in b])[0, 1]), 3),
                "economy_corr": round(float(np.corrcoef([r["pred_econ"] for r in ec],
                                                        [r["act_econ"] for r in ec])[0, 1]), 3) if len(ec) > 2 else None})
        if "known" in b[0]:
            def part(rows):
                return {"n": len(rows), "brier_2plus": round(float(np.mean([(r["p2"] - r["hit2"]) ** 2 for r in rows])), 4),
                        "brier_2plus_base_rate": round(float(np.var([r["hit2"] for r in rows])), 4),
                        "p2_predicted": round(float(np.mean([r["p2"] for r in rows])), 3),
                        "p2_actual": round(float(np.mean([r["hit2"] for r in rows])), 3),
                        "balls_predicted": round(float(np.mean([r["pred_balls"] for r in rows])), 1),
                        "balls_actual": round(float(np.mean([r["act_balls"] for r in rows])), 1),
                        "p_bowls": round(float(np.mean([r["p_bowls"] for r in rows])), 3)}
            splits = {}
            for r in b:
                splits.setdefault(f"bowler: {'known' if r['known'] else 'unknown'}", []).append(r)
                splits.setdefault(f"actual overs: {r['share']}", []).append(r)
            out["bowler_wickets"]["by_split"] = {k: part(v) for k, v in sorted(splits.items())}
            out["bowler_wickets"]["corr_balls"] = round(float(np.corrcoef([r["pred_balls"] for r in b],
                                                                           [r["act_balls"] for r in b])[0, 1]), 3)
    return out


def write_report(rep: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.with_suffix(".json").write_text(json.dumps(rep, indent=2))
    L = [f"# Backtest — trained before {rep['cutoff']}, tested on {rep['matches']} later matches", ""]
    if rep.get("variant"):
        L += [f"Model variant: `{json.dumps(rep['variant'])}`", ""]
    if "result" in rep:
        r = rep["result"]
        L += ["## Match result", "",
              f"Brier **{r['brier']}** (coin flip 0.25) · log-loss **{r['log_loss']}** (coin flip {r['log_loss_coin_flip']}) · "
              f"favourite won **{100 * r['accuracy']:.1f}%** of {r['n']} matches", "",
              f"Spread: the best stretch of every win chance (log-odds ×{r.get('sharpen')}) would give Brier "
              f"{r.get('brier_sharpened')} (fitted on these same matches, so a ceiling; ×1.0 = already right). "
              f"Fixed stretches: " + ", ".join(f"×{k} → {v}" for k, v in (r.get("brier_fixed_stretch") or {}).items()), "",
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
    if rep.get("listed_12"):
        n12 = sum(rep["listed_12"].values())
        L += [f"Matches listing 12 players a side (substitute rules): {n12}, "
              + ("included with the first 11 listed as the XI" if rep.get("listed_12_included") else "skipped")
              + ". By competition: " + ", ".join(f"{k} {v}" for k, v in list(rep["listed_12"].items())[:8]), ""]
    if rep.get("chase_by"):
        L += ["| Chases by | Matches | Chaser wins, predicted | Actual | Brier |", "|---|---|---|---|---|"]
        L += [f"| {k} | {r['n']} | {r['win_predicted']} | {r['win_actual']} | {r['brier']} |" for k, r in rep["chase_by"].items()]
        L.append("")
    if rep.get("chase"):
        c = rep["chase"]
        L += [f"Chases (predicted / actual): won {c['win_predicted']} / {c['win_actual']} of {c['n']}; failed chases "
              f"fell short by {c['failed_short_by_predicted']} / {c['failed_short_by_actual']} runs on average "
              f"(weighted by each match's chance of failing). Runs in won chases {c.get('won_runs_predicted')} / "
              f"{c.get('won_runs_actual')}; in lost chases {c.get('lost_runs_predicted')} / {c.get('lost_runs_actual')}.", ""]
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
        if ins.get("chase"):
            c = ins["chase"]
            L.append(f"| chases won (share) | {c['n']} | {c['win_predicted']} / {c['win_actual']} |")
            L.append(f"| failed chases, short by (runs) | {c['n']} | {c['failed_short_by_predicted']} / {c['failed_short_by_actual']} |")
            L.append(f"| runs in won chases | {c['n']} | {c.get('won_runs_predicted')} / {c.get('won_runs_actual')} |")
            L.append(f"| runs in lost chases | {c['n']} | {c.get('lost_runs_predicted')} / {c.get('lost_runs_actual')} |")
        L += [f"| {g} | {r['n']} | {r['runs_predicted']} / {r['runs_actual']} |"
              for g, r in (ins.get("first_innings_by_group") or {}).items()]
        L.append("")
    if rep.get("player_runs"):
        L += ["## Player runs (players who batted, v simulations where they batted)", "", "| Group | Innings | Predicted mean | Actual mean | In 80% band | Brier 30+ (base rate) | Corr |",
              "|---|---|---|---|---|---|---|"]
        for g, r in rep["player_runs"].items():
            L.append(f"| {g} | {r['n']} | {r['mean_predicted']} | {r['mean_actual']} | {100 * r['in_80pct_band']:.1f}% | "
                     f"{r['brier_30plus']} ({r['brier_30plus_base_rate']}) | {r['corr_pred_actual']} |")
        if any("corr_ceiling" in r for r in rep["player_runs"].values()):
            L += ["", "Against a perfect model (one simulated outcome per player stands in for the real one: the best "
                      "any model could do, given cricket's luck):", "",
                  "| Group | Brier 30+: ours / perfect / base rate | Corr: ours / perfect | Balls faced: predicted / actual (corr) |",
                  "|---|---|---|---|"]
            L += [f"| {g} | {r['brier_30plus']} / {r['brier_30plus_ceiling']} / {r['brier_30plus_base_rate']} | "
                  f"{r['corr_pred_actual']} / {r['corr_ceiling']} | {r['balls_predicted']} / {r['balls_actual']} ({r['corr_balls']}) |"
                  for g, r in rep["player_runs"].items() if "corr_ceiling" in r]
        L.append("")
    if "bowler_wickets" in rep:
        b = rep["bowler_wickets"]
        L += ["## Bowler wickets", "", f"Brier for 2+ wickets **{b['brier_2plus']}** (base rate {b['brier_2plus_base_rate']}) · "
              f"mean predicted {b['mean_predicted']} v actual {b['mean_actual']}", ""]
        if "brier_2plus_ceiling" in b:
            L += [f"Perfect-model Brier for 2+ wickets: {b['brier_2plus_ceiling']} · runs conceded predicted "
                  f"{b['conceded_predicted']} v actual {b['conceded_actual']}, in 80% band {100 * b['conceded_in80']:.1f}%, "
                  f"corr {b['conceded_corr']} (perfect {b['conceded_corr_ceiling']}) · economy corr (2+ overs) {b['economy_corr']}", ""]
        L += ["| Predicted P(2+) | Bowlers | Predicted % | Actual % |", "|---|---|---|---|"]
        L += [f"| {c['bin']} | {c['n']} | {100 * c['predicted']:.1f} | {100 * c['observed']:.1f} |"
              for c in b.get("calibration_2plus", [])]
        if b.get("by_split"):
            L += ["", f"Overs: predicted v actual balls bowled correlate at {b.get('corr_balls')} "
                      "(predicted = simulations where the bowler bowled)", "",
                  "| Split | Bowlers | Brier 2+ (base rate) | P(2+) predicted / actual | Balls predicted / actual | Bowls in sims |",
                  "|---|---|---|---|---|---|"]
            L += [f"| {k} | {v['n']} | {v['brier_2plus']} ({v['brier_2plus_base_rate']}) | "
                  f"{v['p2_predicted']} / {v['p2_actual']} | {v['balls_predicted']} / {v['balls_actual']} | {v['p_bowls']} |"
                  for k, v in b["by_split"].items()]
        L.append("")
    if rep.get("fantasy"):
        fz = rep["fantasy"]
        L += [f"## Fantasy XI (picked from simulations, scored on the real match; {fz['n']} matches, "
              f"half-life {rep.get('half_life_years')} y)", "",
              f"Best possible XI averages **{fz['best_possible']}** points · picked XI shares "
              f"**{fz['overlap_with_best_xi']}** of 11 players with it · ceiling if the model were perfect "
              f"(single team v each simulation's best): **{100 * fz['ceiling_perfect_model']:.1f}%**", "",
              "| Strategy | Avg points | Share of best |", "|---|---|---|"]
        L += [f"| {k} | {v['points']} | {100 * v['share_of_best']:.1f}% |" for k, v in fz["strategies"].items()]
        L.append("")
        if fz.get("per_match"):
            L += ["Per match (share of the best possible XI)", "",
                  "| Match | Best XI points | Our XI | Hindsight captain | 5 teams | 10 teams | 20 teams |",
                  "|---|---|---|---|---|---|---|"]
            L += [f"| {r['match']} | {r['best']} | " + " | ".join(
                f"{100 * r[k]:.1f}%" if k in r else "–" for k in ("mean", "oracle_captain", "portfolio_cap_5",
                                                                  "portfolio_cap_10", "portfolio_cap_20")) + " |"
                  for r in fz["per_match"]]
            L.append("")
        if fz.get("captain_candidates"):
            L += ["Captain candidates (top 6 of the picked XI by expected points): predicted v real points, and how "
                  "often the player was the XI's top scorer", "",
                  "| Group | Players | Predicted | Real | Top of XI |", "|---|---|---|---|---|"]
            L += [f"| {g} | {v['n']} | {v['pred']} | {v['real']} | {100 * v['top_of_xi']:.1f}% |"
                  for g, v in fz["captain_candidates"].items()]
            L.append("")
    if rep.get("era_recent"):
        L += ["## Season scoring levels learned (log-multipliers; T20-type family)", "",
              " · ".join(f"{y}: 4s {v['four']:+.3f} 6s {v['six']:+.3f} W {v['wicket']:+.3f}"
                         for y, v in rep["era_recent"].get("short", {}).items()), ""]
    path.with_suffix(".md").write_text("\n".join(L) + "\n")
