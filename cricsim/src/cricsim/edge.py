"""Per-match answers for the hosted API and MCP server (edge/): the decision models that need fresh simulations,
computed here for each covered match so the Worker only reads them. They ship with the Worker as private files
(never on the public site), and no simulation counts go in them.

    python -m cricsim.edge --model data/models/latest --coverage data/coverage --index data/publish/index.json \\
        --out edge/assets/edge [--previous edge/assets/edge]

<out>/<match id>.json:
    par, chase (per chasing team), toss (from the published forecast, in the Worker), impact (per player),
    batting_order and bowling_plan (per team), fantasy (projections, team by mean and by upside, portfolios of
    2-10 teams), and for matches starting within LIVE_HOURS a grid of live states (innings x balls x wickets x runs)
    with win chances and the innings' final total, which the Worker interpolates.
A match whose inputs (coverage, model, this code) haven't changed keeps its previous file.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click
import numpy as np

from cricsim.engine import modelling as M
from cricsim.engine.io import spec_from_dict
from cricsim.engine.model import Model
from cricsim.engine.simulate import simulate
from cricsim.engine.spec import Scenario, StartState
from cricsim.engine.summary import _r
from cricsim.publish import code_key, load_coverage, model_key, sim_key

log = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30))
DAYS_AHEAD = 3            # matches starting within this many days get answers
LIVE_HOURS = 36           # ... and these also get the live-state grid
N = {"par": 4000, "chase": 400, "impact": 1000, "order": 800, "fantasy": 3000, "live": 200}
FANTASY_FORMATS = ("T20", "T10", "HUNDRED", "OD")


def strip_counts(x):
    """Drop simulation counts anywhere in an answer (they say how the numbers are made, not what they are)."""
    if isinstance(x, dict):
        return {k: strip_counts(v) for k, v in x.items() if not k.startswith("simulations") and k != "n"}
    if isinstance(x, list):
        return [strip_counts(v) for v in x]
    return x


def edge_code() -> str:
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:12]


def kickoff(cov: dict) -> datetime | None:
    try:
        d = datetime.fromisoformat(f"{cov['date']}T{cov.get('start_time') or '00:00'}")
    except (KeyError, TypeError, ValueError):
        return None
    return d.replace(tzinfo=IST)


def _short(sims, model):
    return M._short(sims, model)


def impacts(model: Model, spec, n: int) -> dict:
    """player_impact for all 22 players, simulating the base XI once (common random numbers, as in modelling.swap)."""
    base = _short(simulate(model, spec, n=n, seed=M.SEED), model)
    out = {}
    for k, t in enumerate(spec.teams):
        for pid in t.players:
            alt, _ = M._replace(spec, pid, "__replacement__")
            b = _short(simulate(model, alt, n=n, seed=M.SEED), model)
            d = M._delta(base, b)
            out[pid] = {"player": M.who(model, pid), "team": t.name, "win_with": base["win"][t.name],
                        "win_without": b["win"][t.name], "win_added": _r(-(b["win"][t.name] - base["win"][t.name]), 4),
                        "runs_added": _r(-d["median_score"][t.name], 0)}
    return out


def fantasy(model: Model, spec, roles: dict | None, n: int) -> dict:
    from cricsim.fantasy import decisive_mean, pick_xi, portfolio
    proj, (pids, pts, roles, team_of, win) = M.fantasy_projections(model, spec, roles, n)
    name = {p: M.who(model, p)["name"] for p in pids}
    mean = dict(zip(pids, decisive_mean(pts, win)))
    use_roles = roles if any(r == "WK" for r in roles.values()) else None
    teams = {}
    for rule in ("mean", "upside"):
        cap = dict(zip(pids, np.percentile(pts, 90, axis=0))) if rule == "upside" else None
        xi, c, vc = pick_xi(mean, team_of, use_roles, captain_score=cap)
        teams[rule] = {"xi": [{"id": p, "name": name[p], "team": spec.teams[team_of[p]].name, "role": roles.get(p),
                               "expected": _r(mean[p], 1)} for p in sorted(xi, key=lambda q: -mean[q])],
                       "captain": name[c], "vice_captain": name[vc],
                       "expected_points": _r(sum(mean[p] for p in xi) + mean[c] + 0.5 * mean[vc], 1), "captain_rule": rule}
    col = {p: i for i, p in enumerate(pids)}
    portfolios = {}
    for k in range(2, 11):
        best, rows = None, []
        for xi, c, vc in portfolio(pids, pts, team_of, k, use_roles, captains=5):
            s = pts[:, [col[p] for p in xi]].sum(1) + pts[:, col[c]] + 0.5 * pts[:, col[vc]]
            best = s if best is None else np.maximum(best, s)
            rows.append({"xi": [name[p] for p in xi], "captain": name[c], "vice_captain": name[vc],
                         "expected_points": _r(s.mean(), 1)})
        portfolios[str(k)] = {"teams": rows, "expected_best_of_portfolio": _r(best.mean(), 1) if best is not None else None}
    return {"projections": proj, "team": teams, "portfolio": portfolios}


def live_grid(model: Model, spec, par: dict, n: int) -> dict:
    """Win chances and the batting side's final total from a grid of live states, for each side batting first.
    Runs are gridded relative to that side's expected score at that point (0.75, 1, 1.25x); the chase uses the
    other side's par as the target, so the Worker maps any target onto runs still needed."""
    rules = spec.rules
    balls_total = rules["overs"] * rules["bpo"]
    steps = sorted({int(round(balls_total * f / rules["bpo"])) * rules["bpo"] for f in (0, .15, .3, .45, .6, .75, .9)})
    pars = {row["batting_first"]: row["par"] or 0 for row in par["teams"]}
    states = []
    for bf in (0, 1):
        for inn in (1, 2):
            bat = bf if inn == 1 else 1 - bf
            target = (pars[spec.teams[bf].name] + 1) if inn == 2 else None
            total = pars[spec.teams[bat].name] or 1
            for balls in steps:
                for wk in range(10):
                    for f in (0.75, 1.0, 1.25):
                        exp = total * (balls / balls_total) ** 0.9 * (1 - 0.04 * wk) if balls else 0
                        runs = int(round(exp * f)) if balls else 0
                        if inn == 2 and target and runs >= target:
                            continue
                        if balls == 0 and (wk or f != 1.0):
                            continue
                        spec.batting_first = bf
                        sc = Scenario(start=StartState(innings=inn, runs=runs, wickets=wk, balls=balls,
                                                       first_innings_total=(target - 1) if target else None))
                        sims = simulate(model, spec, n=n, scenario=sc, seed=M.SEED)
                        win = M._wins(sims)
                        final = M._team_runs(sims, bat)
                        lg = [lg for p in sims.parts for lg in p.innings if lg.batting == bat][0]
                        states.append({"bf": bf, "inn": inn, "bat": bat, "balls": balls, "wk": wk, "runs": runs,
                                       "target": target, "win": [_r((win == 0).mean(), 4), _r((win == 1).mean(), 4)],
                                       "q": [_r(float(np.percentile(final, p)), 0) for p in (5, 10, 25, 50, 75, 90, 95)],
                                       "mean": _r(float(final.mean()), 1), "wk_mean": _r(float(lg.wkts.mean()), 2),
                                       "all_out": _r(float((lg.wkts >= 10).mean()), 4)})
    spec.batting_first = None
    return {"balls": steps, "balls_total": balls_total, "bpo": rules["bpo"], "states": states}


def build_match(model: Model, cov: dict, live: bool) -> dict:
    spec, _ = spec_from_dict(cov)
    spec.batting_first = None
    names = [t.name for t in spec.teams]
    out: dict = {"id": cov["id"], "teams": names, "format": cov.get("format"),
                 "players": {p: M.who(model, p)["name"] for t in spec.teams for p in t.players}}
    out["par"] = M.par_score(model, spec, N["par"])
    pars = [row["par"] or 0 for row in out["par"]["teams"]]
    lo = max(10, int(math.floor(min(pars) * 0.6 / 10) * 10))
    hi = int(math.ceil(max(pars) * 1.4 / 10) * 10)
    targets = list(range(lo, hi + 1, 10))[:30]
    out["chase"] = {names[t]: M.chase_curve(model, spec, t, targets, N["chase"]) for t in (0, 1)}
    out["impact"] = impacts(model, spec, N["impact"])
    out["batting_order"] = {names[t]: M.batting_order(model, spec, t, N["order"]) for t in (0, 1)}
    out["bowling_plan"] = {}
    for t in (0, 1):
        try:
            out["bowling_plan"][names[t]] = M.bowling_plan(model, spec, t)
        except ValueError as e:
            log.warning("%s: no bowling plan for %s (%s)", cov["id"], names[t], e)
    if cov.get("format") in FANTASY_FORMATS:
        roles = {p: str(r).upper() for t in cov["teams"] for p, r in zip(t["players"], t.get("roles") or []) if r}
        out["fantasy"] = fantasy(model, spec, roles or None, N["fantasy"])
    if live:
        out["live"] = live_grid(model, spec, out["par"], N["live"])
    return strip_counts(out)


def build_all(model: Model, model_dir: Path, coverage: Path, index: Path | None, out: Path, previous: Path | None,
              now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    out.mkdir(parents=True, exist_ok=True)
    code = code_key() + edge_code()
    mid = model_key(model_dir)
    stats = {"built": 0, "kept": 0, "carried": 0, "skipped": 0, "failed": 0}
    covered = set()
    for cov in load_coverage(coverage):
        covered.add(cov["id"])
        k = kickoff(cov)
        if k is None or k > now + timedelta(days=DAYS_AHEAD):
            stats["skipped"] += 1
            continue
        live = k <= now + timedelta(hours=LIVE_HOURS)
        key = sim_key(cov, mid, code, N["par"], 0) + ("L" if live else "")
        prev = previous / f"{cov['id']}.json" if previous else None
        if prev and prev.exists():
            old = json.loads(prev.read_text())
            if old.get("key") == key:
                (out / prev.name).write_text(prev.read_text())
                stats["kept"] += 1
                continue
        try:
            doc = {"key": key, "generated_at": now.isoformat(timespec="seconds"), **build_match(model, cov, live)}
            (out / f"{cov['id']}.json").write_text(json.dumps(doc, separators=(",", ":")))
            stats["built"] += 1
            log.info("built %s%s", cov["id"], " (with live grid)" if live else "")
        except Exception:
            log.exception("failed %s", cov["id"])
            stats["failed"] += 1
    # matches already under way aren't in the coverage (their forecasts are frozen): keep their files while listed
    listed = {m["id"] for m in json.loads(index.read_text()).get("matches", [])} if index and index.exists() else set()
    if previous and previous.exists() and previous.resolve() != out.resolve():
        for f in previous.glob("*.json"):
            if f.stem in listed and f.stem not in covered and not (out / f.name).exists():
                (out / f.name).write_text(f.read_text())
                stats["carried"] += 1
    for f in out.glob("*.json"):                                  # drop matches no longer listed
        if listed and f.stem not in listed:
            f.unlink()
    return stats


@click.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--coverage", type=click.Path(exists=True, path_type=Path), default=Path("data/coverage"))
@click.option("--index", type=click.Path(path_type=Path), default=None, help="Published index.json (which matches are listed)")
@click.option("--out", type=click.Path(path_type=Path), required=True)
@click.option("--previous", type=click.Path(path_type=Path), default=None, help="Last run's files, reused when unchanged")
def main(model_dir: Path, coverage: Path, index: Path | None, out: Path, previous: Path | None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    stats = build_all(Model.load(model_dir), model_dir, coverage, index, out, previous)
    click.echo(json.dumps(stats))


if __name__ == "__main__":
    main()
