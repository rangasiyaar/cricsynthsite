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
@click.option("--memory", default="4GB")
def fit(parquet: Path, out: Path, cutoff, memory: str) -> None:
    """Fit the ball-outcome model and player ratings."""
    from cricsim.engine.fit import FitConfig, fit as run_fit
    m = run_fit(parquet, FitConfig(cutoff=cutoff.date() if cutoff else None), memory=memory)
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
@click.option("--sims", default=1000)
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/backtest/report"))
@click.option("--memory", default="4GB")
def backtest(parquet: Path, cutoff, matches: int, sims: int, out: Path, memory: str) -> None:
    """Fit before the cutoff, simulate later matches, score the forecasts."""
    from cricsim.engine.backtest import run_backtest, write_report
    rep = run_backtest(parquet, cutoff.date(), limit=matches, n_sims=sims, memory=memory)
    write_report(rep, out)
    click.echo(out.with_suffix(".md").read_text())


if __name__ == "__main__":
    main()
