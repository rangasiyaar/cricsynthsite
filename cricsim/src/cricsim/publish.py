"""Publish covered matches: simulate → match-centre documents the app and API serve.

    python -m cricsim.publish --model data/models/latest --coverage data/coverage --out data/publish

Coverage (written by the admin): one JSON per match in <coverage>/matches/<id>.json
    {"id", "title", "date", "start_time", "format", "gender", "competition", "comp_key",
     "venue", "venue_id", "teams": [{"name", "short", "players": [11 Cricsheet ids], "bowlers"?}, …],
     "batting_first"?, "published": true}

Output:
    <out>/index.json                 match cards for the home page
    <out>/matches/<id>.json          full match centre (summary + insights)
    <out>/matches/<id>.pack.json     engine pack for the browser Scenario Lab
Later these go to Firestore / Hosting; the shapes stay the same.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import click

from cricsim.engine.io import spec_from_dict
from cricsim.engine.model import Model
from cricsim.engine.pack import engine_pack
from cricsim.engine.simulate import simulate
from cricsim.engine.summary import summarize
from cricsim.insights import insights

log = logging.getLogger(__name__)


def short_name(name: str) -> str:
    words = name.split()
    return ("".join(w[0] for w in words)[:4] if len(words) > 1 else name[:3]).upper()


def load_coverage(coverage: Path) -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted((coverage / "matches").glob("*.json"))]


def publish_match(model: Model, cov: dict, out: Path, n: int = 20_000, seed: int = 0) -> dict:
    spec, scenario = spec_from_dict(cov)
    summary = summarize(simulate(model, spec, n=n, scenario=scenario, seed=seed), model)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    match = {k: cov.get(k) for k in ("id", "title", "date", "start_time", "format", "gender", "competition",
                                     "comp_key", "venue", "venue_id", "status")}
    match["teams"] = [{"name": t["name"], "short": t.get("short") or short_name(t["name"]), "players": t["players"]}
                      for t in cov["teams"]]
    doc = {"match": match, "summary": summary, "insights": insights(summary, model), "generated_at": now,
           "model": model.meta.get("cutoff") or "latest", "published": bool(cov.get("published", True))}
    (out / "matches").mkdir(parents=True, exist_ok=True)
    (out / "matches" / f"{cov['id']}.json").write_text(json.dumps(doc, separators=(",", ":")))
    (out / "matches" / f"{cov['id']}.pack.json").write_text(json.dumps(engine_pack(model, spec), separators=(",", ":")))
    t = summary["teams"]
    return {**{k: match[k] for k in ("id", "title", "date", "start_time", "format", "competition", "venue")},
            "teams": [{"name": x["name"], "short": x["short"]} for x in match["teams"]],
            "win": summary["result"]["win"],
            "projected": [x["batting"]["score"]["q"].get("50") for x in t],
            "headline": doc["insights"][0]["text"] if doc["insights"] else None,
            "published": doc["published"], "generated_at": now}


def publish_all(model: Model, coverage: Path, out: Path, n: int = 20_000) -> list[dict]:
    cards = []
    for cov in load_coverage(coverage):
        try:
            cards.append(publish_match(model, cov, out, n=n))
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
def main(model_dir: Path, coverage: Path, out: Path, n: int) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    cards = publish_all(Model.load(model_dir), coverage, out, n)
    click.echo(f"published {len(cards)} matches → {out}")


if __name__ == "__main__":
    main()
