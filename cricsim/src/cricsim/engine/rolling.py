"""Rolling backtest: how the live site really forecasts. The test period is cut into windows; for each window the
model is fitted only on matches before it and judged on the matches inside it (a fresh model, at most `every` days
old, as the nightly refit keeps it live). The same windows are also scored with one model frozen at the start of the
period, which shows what a stale model costs as it ages.

python -m cricsim.engine.rolling --parquet data/parquet --start 2026-05-01 --end 2026-11-01 --every 30 \
    --family T20 --out data/rolling/T20
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import click
import numpy as np

from cricsim.engine.backtest import run_backtest
from cricsim.engine.fit import FitConfig, fit

log = logging.getLogger(__name__)


def _summary(rep: dict) -> dict:
    """The headline numbers of one backtest report."""
    r, t, f = rep.get("result") or {}, rep.get("first_innings_total") or {}, rep.get("fantasy") or {}
    return {"matches": r.get("n", 0), "brier": r.get("brier"), "accuracy": r.get("accuracy"),
            "log_loss": r.get("log_loss"),
            "totals_n": t.get("n", 0), "totals_in_80": t.get("in_80pct_band"), "totals_mae": t.get("median_abs_error"),
            "totals_pit": t.get("pit_deciles"),
            "fantasy_n": f.get("n", 0),
            "fantasy_share": ((f.get("strategies") or {}).get("mean") or {}).get("share_of_best")}


def _pool(rows: list[dict]) -> dict:
    """Windows pooled, each weighted by its number of matches."""
    def wavg(key, nkey):
        v = [(r[key], r[nkey]) for r in rows if r.get(key) is not None and r.get(nkey)]
        n = sum(w for _, w in v)
        return round(sum(a * w for a, w in v) / n, 4) if n else None
    pit = [(np.array(r["totals_pit"]), r["totals_n"]) for r in rows if r.get("totals_pit")]
    n = sum(w for _, w in pit)
    return {"matches": sum(r["matches"] for r in rows), "brier": wavg("brier", "matches"),
            "accuracy": wavg("accuracy", "matches"), "log_loss": wavg("log_loss", "matches"),
            "totals_in_80": wavg("totals_in_80", "totals_n"), "totals_mae": wavg("totals_mae", "totals_n"),
            "totals_pit": [round(float(x), 3) for x in sum(p * w for p, w in pit) / n] if n else None,
            "fantasy_share": wavg("fantasy_share", "fantasy_n")}


def _md(res: dict) -> str:
    L = [f"# Rolling backtest · {res['family']} · {res['start']} to {res['end']}, refit every {res['every']} days", "",
         "Fresh: a model fitted just before each window (as live). Frozen: one model fitted before "
         f"{res['start']}, used for every window.", "",
         "| Window | Matches | Brier fresh / frozen | Favourite right fresh / frozen | Totals in 80% band fresh / frozen "
         "| Fantasy share of best fresh / frozen |", "|---|---|---|---|---|---|"]
    fmt = lambda x, pct=False: "—" if x is None else (f"{100 * x:.1f}%" if pct else f"{x:.3f}")
    for w in res["windows"]:
        a, b = w["fresh"], w["frozen"]
        L.append(f"| {w['from']} | {a['matches']} | {fmt(a['brier'])} / {fmt(b['brier'])} | "
                 f"{fmt(a['accuracy'], True)} / {fmt(b['accuracy'], True)} | {fmt(a['totals_in_80'], True)} / "
                 f"{fmt(b['totals_in_80'], True)} | {fmt(a['fantasy_share'], True)} / {fmt(b['fantasy_share'], True)} |")
    a, b = res["pooled"]["fresh"], res["pooled"]["frozen"]
    L += [f"| **All** | **{a['matches']}** | **{fmt(a['brier'])} / {fmt(b['brier'])}** | "
          f"**{fmt(a['accuracy'], True)} / {fmt(b['accuracy'], True)}** | **{fmt(a['totals_in_80'], True)} / "
          f"{fmt(b['totals_in_80'], True)}** | **{fmt(a['fantasy_share'], True)} / {fmt(b['fantasy_share'], True)}** |", "",
          "Brier: lower is better (0.25 = coin flip). Totals in 80% band: a fair forecast lands 80%.", ""]
    if a.get("totals_pit"):
        L += ["First-innings total, where the real total fell in the fresh forecast (deciles; fair = 10% each): "
              + " ".join(f"{100 * x:.0f}" for x in a["totals_pit"]), ""]
    return "\n".join(L)


@click.command()
@click.option("--parquet", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--start", type=click.DateTime(["%Y-%m-%d"]), required=True)
@click.option("--end", type=click.DateTime(["%Y-%m-%d"]), required=True)
@click.option("--every", default=30, help="Days per window (the model is refitted at the start of each)")
@click.option("--family", type=click.Choice(["T20", "OD"]), default="T20")
@click.option("--matches", default=250, help="Most matches per window")
@click.option("--sims", default=1000)
@click.option("--memory", default="3GB")
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/rolling/report"))
def main(parquet, start, end, every, family, matches, sims, memory, out) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    start, end = start.date(), end.date()
    frozen = fit(parquet, FitConfig(cutoff=start), memory=memory)
    windows, day = [], start
    while day < end:
        stop = min(day + timedelta(days=every), end)
        log.info("window %s to %s", day, stop)
        kw = dict(limit=matches, n_sims=sims, memory=memory, end=stop, family_only=True, latest_format=family)
        fresh = _summary(run_backtest(parquet, day, **kw))
        old = _summary(run_backtest(parquet, day, model=frozen, **kw))
        windows.append({"from": str(day), "to": str(stop), "fresh": fresh, "frozen": old})
        log.info("fresh %s · frozen %s", fresh, old)
        day = stop
    res = {"family": family, "start": str(start), "end": str(end), "every": every, "windows": windows,
           "pooled": {"fresh": _pool([w["fresh"] for w in windows]), "frozen": _pool([w["frozen"] for w in windows])},
           "generated_at": datetime.utcnow().isoformat(timespec="seconds")}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.with_suffix(".json").write_text(json.dumps(res, indent=1))
    out.with_suffix(".md").write_text(_md(res))
    click.echo(_md(res))


if __name__ == "__main__":
    main()
