"""Publish covered matches: simulate → match-centre documents the app and API serve.

    python -m cricsim.publish --model data/models/latest --coverage data/coverage --out data/publish

Coverage (written by the admin): one JSON per match in <coverage>/matches/<id>.json
    {"id", "title", "date", "start_time", "format", "gender", "competition", "comp_key",
     "venue", "venue_id", "teams": [{"name", "short", "players": [11 Cricsheet ids], "bowlers"?}, …],
     "batting_first"?, "published": true}

Output:
    <out>/index.json                 match cards for the home page
    <out>/matches/<id>.json          full match centre (summary + insights + fantasy picks)
    <out>/matches/<id>.pack.json     engine pack for the browser Scenario Lab
Later these go to Firestore / Hosting; the shapes stay the same.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import click

from cricsim import stack
from cricsim.engine.io import spec_from_dict
from cricsim.engine.model import Model
from cricsim.engine.pack import engine_pack
from cricsim.engine.simulate import simulate
from cricsim.engine.summary import summarize
from cricsim.fantasy import fantasy_picks
from cricsim.insights import insights

log = logging.getLogger(__name__)


def short_name(name: str) -> str:
    words = name.split()
    return ("".join(w[0] for w in words)[:4] if len(words) > 1 else name[:3]).upper()


def load_coverage(coverage: Path) -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted((coverage / "matches").glob("*.json"))]


SIM_FIELDS = ("format", "gender", "venue_id", "comp_key", "team_type", "batting_first", "target", "start", "scenario")
TEAM_FIELDS = ("players", "bowlers", "bowling_xi", "roles")
MATCH_FIELDS = ("id", "title", "date", "start_time", "format", "gender", "competition", "comp_key", "venue", "venue_id",
                "status")


def code_key() -> str:
    """The simulation and publishing code: a change to any of it means simulating again."""
    h = hashlib.sha256()
    for f in sorted([*Path(__file__).parent.rglob("*.py"), *Path(__file__).parent.glob("*_weights.json")]):
        h.update(f.read_bytes())
    return h.hexdigest()[:16]


def model_key(model_dir: Path) -> str:
    h = hashlib.sha256()
    for f in sorted(model_dir.glob("model.*")):
        h.update(f.read_bytes())
    return h.hexdigest()[:16]


def sim_key(cov: dict, model_id: str, code: str, n: int, seed: int) -> str:
    """Everything the simulations depend on. Notes, titles and status are not in it, so changing those (or
    confirming an XI that was already the one published) keeps the published simulations."""
    payload = {**{k: cov.get(k) for k in SIM_FIELDS},
               "teams": [{k: t.get(k) for k in TEAM_FIELDS} for t in cov["teams"]],
               "model": model_id, "code": code, "n": n, "seed": seed}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:20]


def _card(doc: dict, match: dict) -> dict:
    summary = doc["summary"]
    t = summary["teams"]
    return {**{k: match.get(k) for k in ("id", "title", "date", "start_time", "format", "competition", "venue")},
            "teams": [{"name": x["name"], "short": x["short"]} for x in match["teams"]],
            "win": summary["result"]["win"],
            "projected": [x["batting"]["score"]["q"].get("50") for x in t],
            "headline": doc["insights"][0]["text"] if doc.get("insights") else None,
            "published": doc["published"], "generated_at": doc["generated_at"]}


def publish_match(model: Model, cov: dict, out: Path, n: int = 20_000, seed: int = 0, key: str | None = None,
                  previous: tuple[dict, dict] | None = None) -> dict:
    """Simulate one match and write its documents. `previous` (the live doc and pack) is kept as it is when it was
    simulated from the same inputs (`key`): only the match details are refreshed."""
    (out / "matches").mkdir(parents=True, exist_ok=True)
    if previous and key and previous[0].get("sim_key") == key:
        doc, pack = previous
        doc["match"] = {**doc["match"], **{k: cov.get(k) for k in MATCH_FIELDS if k in cov}}
        doc["published"] = bool(cov.get("published", True))
        (out / "matches" / f"{cov['id']}.json").write_text(json.dumps(doc, separators=(",", ":")))
        (out / "matches" / f"{cov['id']}.pack.json").write_text(json.dumps(pack, separators=(",", ":")))
        log.info("kept %s (same inputs as the live forecast)", cov["id"])
        return _card(doc, doc["match"])
    spec, scenario = spec_from_dict(cov)
    sims = simulate(model, spec, n=n, scenario=scenario, seed=seed)
    summary = summarize(sims, model)
    if sims.scenario.start is None:           # pre-match: bowlers' wickets blended with their recent real wickets
        stack.adjust_bowlers(summary, cov.get("bowl_form"), cov.get("format"), sims.rules["bpo"])
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    match = {k: cov.get(k) for k in MATCH_FIELDS}
    match["teams"] = [{"name": t["name"], "short": t.get("short") or short_name(t["name"]), "players": t["players"]}
                      for t in cov["teams"]]
    doc = {"match": match, "summary": summary, "insights": insights(summary, model), "generated_at": now,
           "model": model.meta.get("cutoff") or "latest", "published": bool(cov.get("published", True)),
           **({"sim_key": key} if key else {})}
    fantasy = _fantasy(model, sims, cov, summary)
    if fantasy:
        doc["fantasy"] = fantasy
    (out / "matches").mkdir(parents=True, exist_ok=True)
    (out / "matches" / f"{cov['id']}.json").write_text(json.dumps(doc, separators=(",", ":")))
    pack = engine_pack(model, spec)
    if fantasy:      # MatchSynth Lab rebuilds the picks from the user's scenario: it needs roles and fielding shares
        for pid, row in pack["players"].items():
            row["role"] = fantasy["players"].get(pid, {}).get("role")
            if model.fielding is not None:
                row["fielding"] = [round(float(x), 4) for x in model.fielding[model.pid(pid)]]
    (out / "matches" / f"{cov['id']}.pack.json").write_text(json.dumps(pack, separators=(",", ":")))
    return _card(doc, match)


FANTASY_FORMATS = ("T20", "T10", "HUNDRED", "OD")     # T20 points table, or the one-day one for OD


def _fantasy(model: Model, sims, cov: dict, summary: dict) -> dict | None:
    """Fantasy picks from the same simulations (pre-match forecasts only)."""
    if cov.get("format") not in FANTASY_FORMATS or sims.scenario.start is not None:
        return None
    roles = {p: str(r).upper() for t in cov["teams"] for p, r in zip(t["players"], t.get("roles") or []) if r}
    f = fantasy_picks(model, sims, roles or None, form=cov.get("form"))
    names = {p["id"]: p["name"] for t in summary["teams"] for p in t["players"]}
    for pid, row in f["players"].items():
        row["name"] = names.get(pid, pid.removeprefix("new:"))
    return f


def publish_all(model: Model, coverage: Path, out: Path, n: int = 20_000, fetch=None, model_id: str = "") -> list[dict]:
    """Publish every covered match. With `fetch` (path → live document or None), a match whose inputs are the
    same as its live forecast keeps that forecast instead of being simulated again."""
    cards = []
    code = code_key()
    for cov in load_coverage(coverage):
        try:
            key = sim_key(cov, model_id, code, n, 0) if model_id else None
            previous = None
            if fetch and key:
                doc, pack = fetch(f"matches/{cov['id']}.json"), fetch(f"matches/{cov['id']}.pack.json")
                previous = (doc, pack) if doc and pack else None
            cards.append(publish_match(model, cov, out, n=n, key=key, previous=previous))
            log.info("published %s", cov["id"])
        except Exception:                                      # one bad match must not block the rest
            log.exception("failed to publish %s", cov.get("id"))
    cards.sort(key=lambda c: (c.get("date") or "", c.get("start_time") or ""))
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.json").write_text(json.dumps({"matches": cards,
                                                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}))
    return cards


@click.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--coverage", type=click.Path(exists=True, path_type=Path), default=Path("data/coverage"))
@click.option("--out", type=click.Path(path_type=Path), default=Path("data/publish"))
@click.option("--n", default=20_000)
@click.option("--reuse/--no-reuse", default=True,
              help="Keep a live forecast whose inputs (XIs, toss, ground, model, code) haven't changed")
def main(model_dir: Path, coverage: Path, out: Path, n: int, reuse: bool) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    from cricsim.results import _fetch
    cards = publish_all(Model.load(model_dir), coverage, out, n, fetch=_fetch if reuse else None,
                        model_id=model_key(model_dir))
    click.echo(f"published {len(cards)} matches → {out}")


if __name__ == "__main__":
    main()
