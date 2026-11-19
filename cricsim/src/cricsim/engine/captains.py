"""Captains lab: how the simulated captains run the game, one format family at a time.

The simulator's captain decides who bowls each over (usage shares by stage of the innings, how hard he leans on his
frontliners, an overs plan per innings, the bowler for the batter on strike) and who walks in next. Each setting
changes only the simulation, so one model is fitted (trained up to the day before the test window) and every
variant is run on the same matches. Variants are scored against the current settings on: who bowls and how much
(predicted v real balls bowled), bowlers' wickets, batters' runs and balls faced, first-innings totals, the match
result, and fantasy points (the live XI and every captain / vice-captain rule, so the C/VC pick can be retuned on
top of the best captain).

python -m cricsim.engine.captains --parquet data/parquet --family T20 --latest 300 --part bowling --out data/captains/T20
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, date, datetime
from pathlib import Path

import click
import duckdb

from cricsim.engine.backtest import holdout_matches, run_backtest
from cricsim.engine.fit import FitConfig, fit

log = logging.getLogger(__name__)

# name → simulator settings (missing keys keep the defaults in simulate.py). "Current" is always run first.
PARTS: dict[str, dict[str, dict]] = {
    "bowling": {
        "Lean on frontliners less (focus 1.5)": {"bowl_focus": 1.5},
        "Lean on frontliners more (focus 3)": {"bowl_focus": 3.0},
        "Overs plan per innings": {"overs_plan": True},
        "Overs plan, sharper (power 3)": {"overs_plan": True, "plan_power": 3.0},
        "Overs plan, fewer part-timers (eps 0.02)": {"overs_plan": True, "plan_eps": 0.02},
        "Current role counts more (recent 0.5)": {"recent_role": 0.5},
    },
    "tactics": {
        "Bowler for the batter on strike (0.5)": {"matchup": 0.5},
        "Bowler for the batter on strike (1)": {"matchup": 1.0},
        "Bowler for the batter on strike (2)": {"matchup": 2.0},
        "Overs plan + matchups (1)": {"overs_plan": True, "matchup": 1.0},
        "Batting order by stage (0.1)": {"dyn_order": 0.1},
        "Batting order by stage (0.2)": {"dyn_order": 0.2},
    },
}

CAPTAIN_RULES = ("ptop_captain", "upside_captain", "win_split", "win_split_cv_overall", "cap_top_order",
                 "cap_all_rounder", "cap_floor", "cap_ar_bonus_0.15", "cap_ar_bonus_0.3", "cap_vote_overall",
                 "cap_vote_in_xi", "oracle_captain")


def _wavg(groups: dict, key: str) -> float | None:
    rows = [(g["n"], g[key]) for g in (groups or {}).values() if g.get(key) is not None]
    n = sum(w for w, _ in rows)
    return round(sum(w * v for w, v in rows) / n, 4) if n else None


def score(rep: dict) -> dict:
    r, t = rep.get("result") or {}, rep.get("first_innings_total") or {}
    b, f = rep.get("bowler_wickets") or {}, rep.get("fantasy") or {}
    pr = rep.get("player_runs") or {}
    return {"matches": r.get("n"), "brier": r.get("brier"), "log_loss": r.get("log_loss"),
            "totals_in_80": t.get("in_80pct_band"), "totals_mae": t.get("median_abs_error"),
            "bowl_balls_corr": b.get("corr_balls"), "bowl_2w_brier": b.get("brier_2plus"),
            "bowl_conceded_corr": b.get("conceded_corr"),
            "bat_30_brier": _wavg(pr, "brier_30plus"), "bat_runs_corr": _wavg(pr, "corr_pred_actual"),
            "bat_balls_corr": _wavg(pr, "corr_balls"),
            "fantasy_n": f.get("n"), "fantasy_points": (f.get("strategies", {}).get("mean") or {}).get("points"),
            "fantasy_share": (f.get("strategies", {}).get("mean") or {}).get("share_of_best"),
            "captain_rules": {k: v for k, v in (f.get("captain_rules_v_live") or {}).items() if k in CAPTAIN_RULES}}


# metric, label, higher is better
COLS = (("brier", "Result Brier", False), ("totals_in_80", "Totals in 80%", True), ("totals_mae", "Totals error", False),
        ("bowl_balls_corr", "Overs corr", True), ("bowl_2w_brier", "2+ wkts Brier", False),
        ("bowl_conceded_corr", "Conceded corr", True), ("bat_30_brier", "30+ Brier", False),
        ("bat_balls_corr", "Balls faced corr", True), ("fantasy_points", "Fantasy pts", True))


def report(family: str, part: str, window: dict, scores: dict[str, dict]) -> list[str]:
    cur = scores["Current"]
    md = [f"# Captains lab · {family} · {part}", "",
          (f"Model trained before {window['cutoff']}; {window['matches']} matches from then, {window['sims']} simulations "
           "each. Every variant runs on the same matches; ▲ better / ▼ worse than the current settings."), "",
          "| Variant | " + " | ".join(c[1] for c in COLS) + " |", "|---" * (len(COLS) + 1) + "|"]
    for name, s in scores.items():
        cells = []
        for k, _, up in COLS:
            v, c = s.get(k), cur.get(k)
            mark = "" if name == "Current" or v is None or c is None or v == c else ("▲" if (v > c) == up else "▼")
            cells.append("—" if v is None else f"{v}{mark}")
        md.append(f"| {name} | " + " | ".join(cells) + " |")
    md += ["", "## Fantasy captain and vice-captain rules", "",
           "Points per match against the live pick (captain = most expected points), same XI, 95% range.", "",
           "| Variant | " + " | ".join(CAPTAIN_RULES) + " |", "|---" * (len(CAPTAIN_RULES) + 1) + "|"]
    for name, s in scores.items():
        cr = s.get("captain_rules") or {}
        md.append(f"| {name} | " + " | ".join(
            f"{cr[k]['diff']:+} ({cr[k]['lo']}, {cr[k]['hi']})" if k in cr else "—" for k in CAPTAIN_RULES) + " |")
    md += ["", ("Adopt a captain setting only if it helps who-bowls (overs corr, wickets) without hurting the result "
                "Brier or totals; then a captain rule only if its range sits above zero.")]
    return md


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--family", type=click.Choice(["T20", "OD"]), default="T20")
@click.option("--latest", default=300, help="Test on the most recent N matches of the family")
@click.option("--part", type=click.Choice(sorted(PARTS)), default="bowling")
@click.option("--only", default="", help="Comma-separated variant names to run (default all in the part)")
@click.option("--sims", default=500)
@click.option("--memory", default="3GB")
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/captains/report"))
def main(parquet, family, latest, part, only, sims, memory, out):
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    con = duckdb.connect()
    con.execute(f"SET memory_limit='{memory}'")
    recent = holdout_matches(con, parquet, date(1990, 1, 1), latest, latest=True, latest_format=family)
    cutoff = min(m["date"] for m in recent)
    log.info("fitting before %s (%d %s matches)", cutoff, len(recent), family)
    model = fit(parquet, FitConfig(cutoff=cutoff), memory=memory, con=con)
    want = {s.strip() for s in only.split(",") if s.strip()}
    variants = {"Current": {}, **{k: v for k, v in PARTS[part].items() if not want or k in want}}
    scores, raw = {}, {}
    for name, sim in variants.items():
        log.info("variant %s: %s", name, sim)
        model.meta["sim"] = dict(sim)           # run_backtest only sets it when non-empty
        rep = run_backtest(parquet, cutoff, n_sims=sims, model=model, memory=memory, latest=latest,
                           latest_format=family, family_only=True, sim_overrides=sim or None)
        scores[name], raw[name] = score(rep), {"sim": sim, **score(rep)}
        log.info("variant %s: %s", name, {k: scores[name][k] for k in ("brier", "bowl_balls_corr", "fantasy_points")})
    window = {"cutoff": str(cutoff), "matches": scores["Current"]["matches"], "sims": sims}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.with_suffix(".json").write_text(json.dumps({"family": family, "part": part, **window, "variants": raw,
                                                    "generated_at": datetime.now(UTC).isoformat(timespec="seconds")},
                                                   indent=1))
    md = report(family, part, window, scores)
    out.with_suffix(".md").write_text("\n".join(md))
    click.echo("\n".join(md))


if __name__ == "__main__":
    main()
