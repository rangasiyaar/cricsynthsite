"""Analytics kit: the slice of the model the free MCP server needs, as static JSON for Firebase Hosting.

    <out>/analytics/context.json          outcome classes, average-player rows and situation vectors per format
    <out>/analytics/players.json          search index (name, gender, hand, bowling type, experience)
    <out>/analytics/players/<id>.json     one player's rating rows, workload and nearest players by style
    <out>/analytics/rankings/<fmt>-<gender>-<side>-<phase>.json   every eligible player, unsorted
    <out>/analytics/venues.json, venues/<id>.json            venue profiles (T20 / OD, men / women)
    <out>/analytics/competitions.json, competitions/<key>.json
    <out>/analytics/teams.json            team catalog with latest XIs
    <out>/analytics/trends/<fmt>-<gender>.json

With these the MCP server answers every model-only analytics question (profiles, match-ups, team profiles) by
the same arithmetic as cricsim.engine.insight, in pure Python, while pool-wide work (similar players,
rankings, venue and competition profiles, trends) is done here once a night. Nothing is served dynamically.

    python -m cricsim.kit --model data/models/latest --out data/publish
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import click
import numpy as np

from cricsim.engine import insight as I
from cricsim.engine import states as S
from cricsim.engine.model import FORMAT_LIST, GENDERS, Model

FAMILY_FORMATS = ("T20", "OD")                  # one representative format per family for pool-wide tables
CREASE = (("first_ball", 0), ("new_1_5", 3), ("settling_6_20", 12), ("set_21_35", 28), ("set_36_plus", 40))
CHASE = (("first_innings", 0), ("rrr_under_6", 1), ("rrr_6_8", 2), ("rrr_8_10", 3), ("rrr_10_12", 4),
         ("rrr_12_15", 5), ("rrr_15_plus", 6))
SIMILAR_LIMIT = 10


def _f(a, nd=4):
    return np.round(np.asarray(a, dtype=np.float64), nd).tolist()


def safe_id(pid: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", pid)


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":")))


def context(model: Model) -> dict:
    fams = []
    for fam, fmt in enumerate(FAMILY_FORMATS):
        c = I.ctx(model, fmt)
        fams.append({"avg_bat": _f(c.avg_bat), "avg_bowl": _f(c.avg_bowl), "avg_bat_kind": _f(c.avg_bat_kind),
                     "avg_bowl_hand": _f(c.avg_bowl_hand), "kind_share": _f(c.kind_share, 6),
                     "hand_share": _f(c.hand_share, 6), "hand_kind": _f(c.hand_kind), "wide": float(c.wide),
                     "bye": float(c.bye)})
    sits = {}
    for fmt in FORMAT_LIST:
        c = I.ctx(model, fmt)
        for g in GENDERS:
            s = {f"phase:{ph}": _f(c.situation(g, ph)) for ph in I.PHASES}
            s.update({f"crease:{lab}": _f(c.situation(g, "middle", balls_faced=bf)) for lab, bf in CREASE})
            s.update({f"chase:{lab}": _f(c.situation(g, "middle", inn0=1 if b else 0, chase=b)) for lab, b in CHASE})
            sits[f"{fmt}:{g}"] = s
    return {"version": 1, "outcomes": list(S.OUTCOMES), "bat_runs": S.BAT_RUNS.tolist(), "legal": S.LEGAL.tolist(),
            "bowling_kinds": list(S.BOWLING_KINDS), "hands": list(S.HANDS), "phases": list(I.PHASES),
            "spin_kinds": I.SPIN_KINDS, "pace_kinds": I.PACE_KINDS, "wicket_runs": I.WICKET_RUNS,
            "formats": list(FORMAT_LIST), "families": fams, "situations": sits,
            "crease": [lab for lab, _ in CREASE], "chase": [lab for lab, _ in CHASE],
            "model": {"cutoff": model.meta.get("cutoff"), "players": len(model.players) - 1}}


def _similar_tables(model: Model) -> dict[tuple[int, str, str], dict[int, list]]:
    """For every (family, gender, side): each pool player's nearest players (insight.similar, batched)."""
    g = model.meta.get("catalog", {}).get("player_gender", "")
    out = {}
    for fam, fmt in enumerate(FAMILY_FORMATS):
        c = I.ctx(model, fmt)
        for gender in GENDERS:
            for side in ("batting", "bowling"):
                w = c.w_bat if side == "batting" else c.w_bowl
                pool = np.array([i for i in np.flatnonzero(w >= 300) if not g or g[i] in (gender[0], "u")])
                if len(pool) < 2:
                    continue
                X = I._features(c, pool, gender, side)
                X = (X - X.mean(0)) / (X.std(0) + 1e-9)
                table = {}
                for j0 in range(0, len(pool), 64):           # 64 rows at a time keeps memory under ~150 MB
                    d = np.sqrt(((X[j0:j0 + 64, None, :] - X[None, :, :]) ** 2).sum(-1))
                    for r, row in enumerate(d):
                        j = j0 + r
                        order = [k for k in np.argsort(row, kind="stable") if k != j][:SIMILAR_LIMIT]
                        table[int(pool[j])] = [[model.players[pool[k]], round(float(row[k]), 2)] for k in order]
                out[(fam, gender, side)] = table
    return out


def player_rows(model: Model, min_balls: float = 30) -> list[int]:
    exp = model.balls_faced.sum(1) + model.balls_bowled.sum(1)
    return [i for i in range(1, len(model.players)) if exp[i] >= min_balls]


def player_doc(model: Model, i: int, similar: dict) -> dict:
    f, P = model.factors, len(model.players)
    bat_fmt = f["bat_fmt"].reshape(P, 2, S.K)[i]
    bowl_fmt = f["bowl_fmt"].reshape(P, 2, S.K)[i]
    g = model.meta.get("catalog", {}).get("player_gender", "")
    gender = {"m": "male", "f": "female"}.get(g[i] if i < len(g) else "", None)
    sims = {}
    for (fam, gen, side), table in similar.items():
        if i in table and (gender is None or gen == gender):
            sims.setdefault(FAMILY_FORMATS[fam], {})[side] = table[i]
    return {
        "id": model.players[i], "name": model.names[i], "gender": gender,
        "hand": S.HANDS[model.hand[i]], "bowling_kind": S.BOWLING_KINDS[model.kind[i]],
        "bat": [_f(f["bat"][i].astype(np.float64) + bat_fmt[fam]) for fam in (0, 1)],
        "bowl": [_f(f["bowl"][i].astype(np.float64) + bowl_fmt[fam]) for fam in (0, 1)],
        "bat_kind": _f(f["bat_kind"].reshape(P, -1, S.K)[i]), "bowl_hand": _f(f["bowl_hand"].reshape(P, -1, S.K)[i]),
        "balls_faced": _f(model.balls_faced[i], 1), "balls_bowled": _f(model.balls_bowled[i], 1),
        "usage": _f(model.usage[i], 3) if model.usage is not None else None,
        "bat_pos": _f(model.bat_pos[i], 2) if model.bat_pos is not None else None,
        "appearances": _f(model.appearances[i], 1) if model.appearances is not None else None,
        "last_played": int(model.last_played[i]) if model.last_played is not None else 0,
        "similar": sims,
    }


def export(model: Model, out: Path, min_balls: float = 30) -> dict:
    root = out / "analytics"
    _write(root / "context.json", context(model))
    sim = _similar_tables(model)
    rows = player_rows(model, min_balls)
    index = []
    for i in rows:
        doc = player_doc(model, i, sim)
        _write(root / "players" / f"{safe_id(doc['id'])}.json", doc)
        index.append([doc["id"], doc["name"], doc["gender"], doc["hand"], doc["bowling_kind"],
                      round(float(model.balls_faced[i].sum() + model.balls_bowled[i].sum()))])
    index.sort(key=lambda r: -r[5])
    _write(root / "players.json", {"fields": ["id", "name", "gender", "hand", "bowling_kind", "balls"], "players": index})
    n_rank = 0
    for fmt in FAMILY_FORMATS:
        for g in GENDERS:
            for side in ("batting", "bowling"):
                for ph in I.PHASES:
                    r = I.rankings(model, side, fmt, g, ph, limit=10**6)
                    n_rank += len(r["players"])
                    _write(root / "rankings" / f"{fmt}-{g}-{side}-{ph}.json", r)
            _write(root / "trends" / f"{fmt}-{g}.json", I.scoring_trend(model, fmt, g))
    venues = I.venues(model, limit=10**6)
    _write(root / "venues.json", {"venues": venues})
    for v in venues:
        _write(root / "venues" / f"{safe_id(v['id'])}.json",
               {f"{fmt}:{g}": I.venue_profile(model, v["id"], fmt, g) for fmt in FAMILY_FORMATS for g in GENDERS})
    comps = I.competitions(model, limit=10**6)
    _write(root / "competitions.json", {"competitions": comps})
    for c in comps:
        _write(root / "competitions" / f"{safe_id(c['key'])}.json", I.comp_profile(model, c["key"]))
    _write(root / "teams.json", {"teams": model.meta.get("catalog", {}).get("teams", {})})
    return {"players": len(rows), "venues": len(venues), "competitions": len(comps), "ranking_rows": n_rank}


@click.command()
@click.option("--model", "model_dir", type=click.Path(path_type=Path), required=True)
@click.option("--out", type=click.Path(path_type=Path), required=True)
@click.option("--min-balls", type=float, default=30)
def main(model_dir: Path, out: Path, min_balls: float) -> None:
    stats = export(Model.load(model_dir), out, min_balls)
    size = sum(p.stat().st_size for p in (out / "analytics").rglob("*.json"))
    click.echo(f"analytics kit: {stats}, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
