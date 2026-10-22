"""python -m cricsim.engine fit | simulate | backtest"""
from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path

import click


@click.group()
def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


@main.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/models/latest"))
@click.option("--cutoff", type=click.DateTime(["%Y-%m-%d"]), default=None, help="Train only on matches before this date")
@click.option("--half-life", "half_life", type=float, default=None, help="Recency half-life in years (default 3)")
@click.option("--memory", default="4GB")
def fit(parquet: Path, out: Path, cutoff, half_life: float | None, memory: str) -> None:
    """Fit the ball-outcome model and player ratings."""
    from cricsim.engine.fit import FitConfig, fit as run_fit
    cfg = FitConfig(cutoff=cutoff.date() if cutoff else None, **({"half_life_years": half_life} if half_life else {}))
    m = run_fit(parquet, cfg, memory=memory)
    m.save(out)
    click.echo(json.dumps({"players": len(m.players), "venues": len(m.venues), "comps": len(m.comps),
                           "fit": m.meta["fit"]}, indent=2))


@main.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--spec", "spec_file", type=click.Path(exists=True, path_type=Path), required=True,
              help="JSON: {format, gender, venue_id, comp_key, teams: [{name, players: [...]}, ...]}")
@click.option("--n", default=10_000)
@click.option("--out", type=click.Path(path_type=Path), default=None)
def simulate(model_dir: Path, spec_file: Path, n: int, out: Path | None) -> None:
    """Simulate a match and print (or save) the match-centre summary."""
    from cricsim.engine.io import spec_from_dict
    from cricsim.engine.model import Model
    from cricsim.engine.simulate import simulate as run
    from cricsim.engine.summary import summarize
    model = Model.load(model_dir)
    spec, scenario = spec_from_dict(json.loads(spec_file.read_text()))
    s = summarize(run(model, spec, n=n, scenario=scenario), model)
    text = json.dumps(s, indent=1)
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text)
    else:
        click.echo(text)


@main.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--cutoff", type=click.DateTime(["%Y-%m-%d"]), required=True)
@click.option("--matches", default=600)
@click.option("--insample", default=0, help="Also re-run the model on this many matches from its last six months")
@click.option("--half-life", "half_life", type=float, default=None, help="Recency half-life in years (default 3)")
@click.option("--fantasy-bowlers", is_flag=True, help="Also score fantasy XIs picked with the real bowling plan")
@click.option("--comp-groups", type=click.Choice(["off", "club", "all"]), default=None,
              help="Variant: competitions lean on similar competitions")
@click.option("--shrink", "shrink", default="", help="Variant: prior strengths, e.g. bat=150,bowl=150")
@click.option("--slot-usage/--no-slot-usage", default=None, help="Variant: newcomers bowl like their team-sheet slot")
@click.option("--bowl-focus", type=float, default=None, help="Variant: how strongly captains favour frontline bowlers")
@click.option("--experience/--no-experience", default=None, help="Variant: factor for players' career balls so far")
@click.option("--home/--no-home", default=None, help="Variant: home advantage")
@click.option("--order", type=click.Choice(["history", "sheet"]), default="history",
              help="Batting order: usual positions (history) or the team sheet, as live forecasts use it")
@click.option("--overs-plan/--no-overs-plan", default=None, help="Variant: draw each innings' overs per bowler up front")
@click.option("--phase-skill/--no-phase-skill", default=None, help="Variant: player × powerplay / middle / death")
@click.option("--new-ground/--no-new-ground", default=None, help="Variant: unseen grounds get the new-ground level")
@click.option("--venue-half-life", type=float, default=None, help="Variant: recency half-life for ground factors (years)")
@click.option("--era-wickets", type=click.Choice(["trend", "latest", "latest-od"]), default=None,
              help="Variant: project dismissals with the season trend or hold them at the latest season's level")
@click.option("--era-gender/--no-era-gender", default=None, help="Variant: own season trend for men's and women's cricket")
@click.option("--team-day/--no-team-day", default=None, help="Variant: per-innings conditions draw on top of the shared one")
@click.option("--chase-wickets/--no-chase-wickets", default=None, help="Variant: chase pressure × wickets down factor")
@click.option("--collapse/--no-collapse", default=None, help="Variant: wickets in the last 12 deliveries factor")
@click.option("--bat-switch/--no-bat-switch", default=None, help="Variant: batter coming from the other format family")
@click.option("--era-team-type/--no-era-team-type", default=None, help="Variant: own season trend for internationals and domestic")
@click.option("--era-ahead", type=float, default=None, help="Variant: years ahead the scoring trend is aimed (default 0.5)")
@click.option("--dyn-order", type=float, default=None, help="Variant: next batter by usual entry point (spread, e.g. 0.1)")
@click.option("--rule-split/--no-rule-split", default=None, help="Variant: own competition level for 12-player-rule seasons")
@click.option("--impact12", is_flag=True, help="Variant: 12-player sides bat their best 11 and field their best 11")
@click.option("--twelve", is_flag=True, help="Include matches listing 12 players a side (first 11 as the XI)")
@click.option("--form", type=float, default=None, help="Variant: weight of recent form (last 5 matches)")
@click.option("--plan-power", type=float, default=None, help="Variant: overs plan concentration")
@click.option("--plan-eps", type=float, default=None, help="Variant: overs plan, extra chance per usual over")
@click.option("--listed-bonus", type=float, default=None, help="Variant: weight added for a listed bowler")
@click.option("--roles", is_flag=True, help="Mark who may bowl (here: who did), as fixture roles do live")
@click.option("--recent-role", type=float, default=None, help="Variant: weight of the last 5 matches in role (0..1)")
@click.option("--sims", default=1000)
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/backtest/report"))
@click.option("--memory", default="4GB")
def backtest(parquet: Path, cutoff, matches: int, insample: int, half_life: float | None, fantasy_bowlers: bool,
             comp_groups: str | None, shrink: str, slot_usage: bool | None, bowl_focus: float | None,
             experience: bool | None, home: bool | None, recent_role: float | None, order: str, roles: bool, listed_bonus: float | None, overs_plan: bool | None, plan_eps: float | None, plan_power: float | None,
             phase_skill: bool | None, form: float | None, sims: int, new_ground: bool | None,
             venue_half_life: float | None, era_wickets: str | None, era_gender: bool | None,
             team_day: bool | None, chase_wickets: bool | None, collapse: bool | None, bat_switch: bool | None,
             era_team_type: bool | None, era_ahead: float | None, twelve: bool,
             dyn_order: float | None, rule_split: bool | None, impact12: bool,
             out: Path, memory: str) -> None:
    """Fit before the cutoff, simulate later matches, score the forecasts."""
    from cricsim.engine.backtest import run_backtest, write_report
    over: dict = {"comp_groups": comp_groups} if comp_groups else {}
    if experience is not None:
        over["experience"] = experience
    if home is not None:
        over["home"] = home
    if phase_skill is not None:
        over["phase_skill"] = phase_skill
    for k, v in (("rule_split", rule_split), ("collapse", collapse), ("bat_switch", bat_switch), ("era_team_type", era_team_type)):
        if v is not None:
            over[k] = v
    if chase_wickets is not None:
        over["chase_wickets"] = chase_wickets
    if era_gender is not None:
        over["era_gender"] = era_gender
    if new_ground is not None:
        over["new_ground"] = new_ground
    if venue_half_life:
        over["venue_half_life"] = venue_half_life
    if shrink:
        over["shrink"] = {k.strip(): float(v) for k, v in (kv.split("=") for kv in shrink.split(","))}
    rep = run_backtest(parquet, cutoff.date(), limit=matches, n_sims=sims, memory=memory, insample=insample,
                       half_life=half_life, fantasy_bowlers=fantasy_bowlers, fit_overrides=over,
                       sim_overrides={k: v for k, v in (("slot_usage", slot_usage), ("bowl_focus", bowl_focus),
                                                         ("recent_role", recent_role), ("listed_bonus", listed_bonus),
                                                         ("overs_plan", overs_plan), ("plan_eps", plan_eps),
                                                         ("plan_power", plan_power), ("form", form),
                                                         ("era_wickets", era_wickets), ("team_day", team_day),
                                                         ("era_ahead", era_ahead), ("dyn_order", dyn_order),
                                                         ("impact12", impact12 or None))
                                      if v is not None},
                       order=order, roles=roles, twelve=twelve)
    write_report(rep, out)
    click.echo(out.with_suffix(".md").read_text())


if __name__ == "__main__":
    main()
