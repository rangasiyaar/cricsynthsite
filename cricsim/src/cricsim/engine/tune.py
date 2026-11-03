"""Tune the engine's hand-set settings (recency half-lives, prior strengths, competition grouping) with Optuna
against a backtest, then check the winner on later matches the search never saw.

Search: model fitted before `--tune-start`, judged on the matches in [tune-start, tune-end) by match-result Brier
(lighter: fewer simulations and matches). Validation: the best setting and the current defaults, each fitted before
`--tune-end` and judged on [tune-end, valid-end) with full simulations. Adopt only if validation agrees.

python -m cricsim.engine.tune --parquet data/parquet --tune-start 2026-05-01 --tune-end 2026-07-01 \
    --valid-end 2026-11-01 --trials 30 --out data/tune/T20

--compare '<best_params JSON>' skips the search: it validates those settings against the current ones and breaks the
win-probability scores down by group (men/women, internationals/leagues, each half of the window), to check a gain
is not carried by one group.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

import click

from cricsim.engine.backtest import run_backtest
from cricsim.engine.fit import SHRINK, FitConfig

log = logging.getLogger(__name__)


def _space(trial) -> tuple[dict, float]:
    """FitConfig overrides and the recency half-life for one trial."""
    shrink = {"bat": trial.suggest_float("shrink_bat", 50, 600, log=True),
              "bowl": trial.suggest_float("shrink_bowl", 100, 1200, log=True),
              "comp": trial.suggest_float("shrink_comp", 1000, 30000, log=True),
              "venue": trial.suggest_float("shrink_venue", 1000, 30000, log=True),
              "bat_exp": trial.suggest_float("shrink_bat_exp", 500, 10000, log=True),
              "bowl_exp": trial.suggest_float("shrink_bowl_exp", 500, 10000, log=True)}
    over = {"shrink": shrink,
            "venue_half_life": trial.suggest_float("venue_half_life", 1.0, 8.0),
            "comp_groups": trial.suggest_categorical("comp_groups", ["off", "club", "all"]),
            "new_ground": trial.suggest_categorical("new_ground", [False, True]),
            "era_gender": trial.suggest_categorical("era_gender", [False, True])}
    return over, trial.suggest_float("half_life", 1.0, 5.0)


def _groups(rows: list[dict], mid: str) -> dict[str, list[dict]]:
    g: dict[str, list[dict]] = {"All": rows}
    for r in rows:
        g.setdefault("Women" if r["gender"] == "female" else "Men", []).append(r)
        g.setdefault("Internationals" if r["team_type"] == "international" else "Leagues and domestic", []).append(r)
        g.setdefault(f"Before {mid}" if r["date"] < mid else f"From {mid}", []).append(r)
    return g


def _brier(rows: list[dict]) -> float | None:
    return round(sum((r["p"] - r["y"]) ** 2 for r in rows) / len(rows), 4) if rows else None


def compare_report(current: dict, tuned: dict, t1, t2) -> tuple[dict, list[str]]:
    """Brier by group under each setting; both runs score the same validation matches."""
    mid = str(t1 + (t2 - t1) / 2)
    gc, gt = _groups(current.get("win_rows", []), mid), _groups(tuned.get("win_rows", []), mid)
    out, md = {}, ["| Group | Matches | Brier now | Brier tuned | Change |", "|---|---|---|---|---|"]
    for k in gc:
        bc, bt = _brier(gc.get(k, [])), _brier(gt.get(k, []))
        out[k] = {"n": len(gc.get(k, [])), "current": bc, "tuned": bt}
        ch = "—" if bc is None or bt is None else f"{bt - bc:+.4f} ({'better' if bt < bc else 'worse' if bt > bc else 'same'})"
        md.append(f"| {k} | {len(gc.get(k, []))} | {bc} | {bt} | {ch} |")
    return out, md


def _score(rep: dict) -> dict:
    r, t = rep.get("result") or {}, rep.get("first_innings_total") or {}
    return {"matches": r.get("n"), "brier": r.get("brier"), "log_loss": r.get("log_loss"), "accuracy": r.get("accuracy"),
            "totals_in_80": t.get("in_80pct_band"), "totals_mae": t.get("median_abs_error")}


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--tune-start", type=click.DateTime(["%Y-%m-%d"]), required=True)
@click.option("--tune-end", type=click.DateTime(["%Y-%m-%d"]), required=True)
@click.option("--valid-end", type=click.DateTime(["%Y-%m-%d"]), required=True)
@click.option("--family", type=click.Choice(["T20", "OD"]), default="T20")
@click.option("--trials", default=30)
@click.option("--tune-matches", default=300)
@click.option("--tune-sims", default=300)
@click.option("--valid-matches", default=600)
@click.option("--memory", default="3GB")
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/tune/report"))
@click.option("--compare", default="", help="best_params JSON from a tuning run: skip the search, check by group")
def main(parquet, tune_start, tune_end, valid_end, family, trials, tune_matches, tune_sims, valid_matches, memory, out,
         compare):
    import optuna
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    t0, t1, t2 = tune_start.date(), tune_end.date(), valid_end.date()
    common = dict(memory=memory, family_only=True, latest_format=family)
    if compare:
        over, hl = _space(optuna.trial.FixedTrial(json.loads(compare)))
        log.info("validating given settings v current settings on %s to %s", t1, t2)
        rt = run_backtest(parquet, t1, limit=valid_matches, n_sims=1000, end=t2, half_life=hl, fit_overrides=over, **common)
        rc = run_backtest(parquet, t1, limit=valid_matches, n_sims=1000, end=t2, **common)
        groups, table = compare_report(rc, rt, t1, t2)
        res = {"family": family, "validation": {"from": str(t1), "to": str(t2), "tuned": _score(rt), "current": _score(rc)},
               "groups": groups, "params": json.loads(compare), "generated_at": datetime.utcnow().isoformat(timespec="seconds")}
        out.parent.mkdir(parents=True, exist_ok=True)
        out.with_suffix(".json").write_text(json.dumps(res, indent=1))
        md = [f"# Tuned v current by group · {family} ({t1} to {t2})", "", *table, "",
              "Lower Brier is better. Adopt only if the tuned settings are not clearly worse in any large group."]
        out.with_suffix(".md").write_text("\n".join(md))
        click.echo("\n".join(md))
        return

    def objective(trial):
        over, hl = _space(trial)
        rep = run_backtest(parquet, t0, limit=tune_matches, n_sims=tune_sims, end=t1, half_life=hl,
                           fit_overrides=over, **common)
        s = _score(rep)
        log.info("trial %d: brier %s · %s", trial.number, s["brier"], trial.params)
        return s["brier"] if s["brier"] is not None else 1.0

    study = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=0))
    cur = FitConfig()
    study.enqueue_trial({"shrink_bat": SHRINK["bat"], "shrink_bowl": SHRINK["bowl"], "shrink_comp": SHRINK["comp"],
                         "shrink_venue": SHRINK["venue"], "shrink_bat_exp": SHRINK["bat_exp"],
                         "shrink_bowl_exp": SHRINK["bowl_exp"], "venue_half_life": cur.venue_half_life or cur.half_life_years,
                         "comp_groups": cur.comp_groups, "new_ground": cur.new_ground, "era_gender": cur.era_gender,
                         "half_life": cur.half_life_years})       # trial 0 = current settings
    study.optimize(objective, n_trials=trials, catch=(Exception,))      # one bad setting must not end the search
    best = study.best_trial
    over, hl = _space(optuna.trial.FixedTrial(best.params))
    log.info("validating best (search brier %.4f) v current settings on %s to %s", best.value, t1, t2)
    tuned = _score(run_backtest(parquet, t1, limit=valid_matches, n_sims=1000, end=t2, half_life=hl,
                                fit_overrides=over, **common))
    current = _score(run_backtest(parquet, t1, limit=valid_matches, n_sims=1000, end=t2, **common))
    res = {"family": family, "search": {"from": str(t0), "to": str(t1), "trials": trials,
                                         "current_brier": study.trials[0].value, "best_brier": best.value,
                                         "best_params": best.params},
           "validation": {"from": str(t1), "to": str(t2), "tuned": tuned, "current": current},
           "generated_at": datetime.utcnow().isoformat(timespec="seconds")}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.with_suffix(".json").write_text(json.dumps(res, indent=1))
    f = lambda x, p=False: "—" if x is None else (f"{100 * x:.1f}%" if p else f"{x:.4f}")
    md = [f"# Tuning · {family}", "",
          f"Search ({t0} to {t1}, {trials} trials): current settings Brier {f(study.trials[0].value)} → "
          f"best {f(best.value)}", "", "Best settings: `" + json.dumps(best.params) + "`", "",
          f"## Validation on unseen matches ({t1} to {t2})", "",
          "| | Matches | Brier | Log loss | Favourite right | Totals in 80% band | Totals median error |",
          "|---|---|---|---|---|---|---|"]
    for lab, s in (("Current settings", current), ("Tuned settings", tuned)):
        md.append(f"| {lab} | {s['matches']} | {f(s['brier'])} | {f(s['log_loss'])} | {f(s['accuracy'], True)} | "
                  f"{f(s['totals_in_80'], True)} | {s['totals_mae']} |")
    md += ["", "Adopt the tuned settings only if they win here, on matches the search never saw."]
    out.with_suffix(".md").write_text("\n".join(md))
    click.echo("\n".join(md))


if __name__ == "__main__":
    main()
