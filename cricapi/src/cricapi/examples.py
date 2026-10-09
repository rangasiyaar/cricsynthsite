"""Sample request and response for every public endpoint, for the website's /docs and /playground pages.

    uv run python -m cricapi.examples --model data/models/latest --publish data/publish \
        --coverage data/coverage --patterns data/patterns/report.json --out app/data-static/api-examples.json

Runs the real API in-process (no network) with a temporary Pro key. Lists in responses are shortened.
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import click

BATTERS = ["V Kohli", "RG Sharma", "SA Yadav", "JC Buttler", "Shubman Gill", "TM Head", "Abhishek Sharma"]
BOWLERS = ["JJ Bumrah", "Rashid Khan", "Kuldeep Yadav", "Arshdeep Singh", "CV Varun", "A Zampa", "MA Starc"]
VENUES = ["Wankhede", "Eden Gardens", "Chinnaswamy", "Melbourne Cricket Ground", "Lord's"]
TEAMS = [("India", "Australia"), ("India", "England")]


def _short(x, depth=0):
    if isinstance(x, list):
        out = [_short(v, depth + 1) for v in x[:4]]
        if len(x) > 4:
            out.append(f"… {len(x) - 4} more")
        return out
    if isinstance(x, dict):
        return {k: _short(v, depth + 1) for k, v in x.items()}
    return x


def context(model, client, headers) -> dict:
    from cricsim.engine import insight as I
    name_to = {}
    for i, nm in enumerate(model.names):
        name_to.setdefault(nm, model.players[i])
    bat = [name_to[n] for n in BATTERS if n in name_to]
    bowl = [name_to[n] for n in BOWLERS if n in name_to]
    if len(bat) < 3:
        bat += [r["id"] for r in I.rankings(model, "batting", min_balls=50, limit=6)["players"] if r["id"] not in bat]
    if len(bowl) < 3:
        bowl += [r["id"] for r in I.rankings(model, "bowling", min_balls=50, limit=6)["players"] if r["id"] not in bowl]
    venues = I.venues(model, None, 500)
    venue = next((v for q in VENUES for v in venues if q.lower() in (v.get("name") or "").lower()), venues[0])
    comps = I.competitions(model, None, 5)
    cards = client.get("/v1/matches", headers=headers).json().get("matches", [])
    match_id = cards[0]["id"] if cards else None
    teams = None
    cat = model.meta.get("catalog", {}).get("teams", {})
    for a, b in TEAMS:
        ids = [next((tid for tid, t in cat.items() if t.get("name") == n and t.get("gender") == "male"
                     and "T20" in t["formats"] and len(t["formats"]["T20"].get("last_xi", [])) == 11), None) for n in (a, b)]
        if all(ids):
            teams = [{"team_id": i} for i in ids]
            break
    if teams is None:
        good = [tid for tid, t in cat.items() if len(next(iter(t["formats"].values())).get("last_xi", [])) == 11]
        teams = [{"team_id": good[0]}, {"team_id": good[1]}]
    t0 = cat[teams[0]["team_id"]]
    xi = (t0["formats"].get("T20") or next(iter(t0["formats"].values())))["last_xi"]
    pats = client.get("/v1/patterns", headers=headers)
    pattern = (pats.json().get("patterns") or [{}])[0].get("id") if pats.status_code == 200 else None
    return {"bat": bat[:3], "bowl": bowl[:3], "venue": venue, "comp": comps[0]["key"] if comps else None,
            "teams": teams, "xi": xi, "team_q": t0.get("name", "")[:5], "match_id": match_id, "pattern": pattern,
            "query": model.names[model.pid(bat[0])].split()[-1][:6]}


def requests_for(c: dict) -> dict[str, dict]:
    b1, b2, b3 = (c["bat"] + c["bat"] * 3)[:3]
    w1, w2, w3 = (c["bowl"] + c["bowl"] * 3)[:3]
    match = {"teams": c["teams"], "venue_id": c["venue"]["id"], "n": 2000}
    m = c["match_id"]
    return {
        "GET /v1/players": {"query": {"q": c["query"]}},
        "GET /v1/players/{pid}": {"path": {"pid": b1}},
        "GET /v1/players/compare": {"query": {"ids": f"{b1},{b2}"}},
        "GET /v1/players/{pid}/phases": {"path": {"pid": b1}},
        "GET /v1/players/{pid}/vs-bowling": {"path": {"pid": b1}},
        "GET /v1/players/{pid}/vs-batting-hand": {"path": {"pid": w1}},
        "GET /v1/players/{pid}/situations": {"path": {"pid": b1}},
        "GET /v1/players/{pid}/formats": {"path": {"pid": b1}},
        "GET /v1/players/{pid}/role": {"path": {"pid": w1}},
        "GET /v1/players/{pid}/similar": {"path": {"pid": b1}, "query": {"limit": 5}},
        "GET /v1/rankings/batting": {"query": {"limit": 10}},
        "GET /v1/rankings/bowling": {"query": {"limit": 10, "phase": "death"}},
        "GET /v1/matchups": {"query": {"batter": b1, "bowler": w1}},
        "GET /v1/matchups/grid": {"query": {"batters": f"{b1},{b2},{b3}", "bowlers": f"{w1},{w2}"}},
        "GET /v1/matchups/counter": {"query": {"batter": b1, "candidates": f"{w1},{w2},{w3}"}},
        "GET /v1/venues": {"query": {"q": (c["venue"].get("name") or c["venue"]["id"]).split()[0]}},
        "GET /v1/venues/{vid}": {"path": {"vid": c["venue"]["id"]}},
        "GET /v1/competitions": {"query": {"limit": 5}},
        "GET /v1/competitions/{key}": {"path": {"key": c["comp"]}},
        "GET /v1/trends/scoring": {},
        "GET /v1/teams": {"query": {"q": c["team_q"], "limit": 5}},
        "GET /v1/teams/{tid}": {"path": {"tid": c["teams"][0]["team_id"]}},
        "POST /v1/teams/profile": {"body": {"players": c["xi"]}},
        "GET /v1/patterns": {},
        "GET /v1/patterns/{pattern_id}": {"path": {"pattern_id": c["pattern"]}},
        "POST /v1/simulate": None,
        "GET /v1/matches": {},
        "GET /v1/matches/{match_id}": {"path": {"match_id": m}},
        "GET /v1/matches/{match_id}/pack": {"path": {"match_id": m}},
        "GET /v1/matches/{match_id}/win-probability": {"path": {"match_id": m},
                                                       "query": {"innings": 1, "runs": 54, "wickets": 1, "overs": 6}},
        "GET /v1/matches/{match_id}/fantasy": {"path": {"match_id": m}, "query": {"n": 2000}},
        "POST /v1/players/{pid}/projection": {"path": {"pid": b1}, "body": {"n": 2000}},
        "POST /v1/win-probability": {"body": {**match, "state": {"innings": 2, "batting": 1, "runs": 92, "wickets": 3,
                                                                 "overs": 11.2, "target": 181}}},
        "POST /v1/innings/projection": {"body": {**match, "state": {"innings": 1, "batting": 0, "runs": 61,
                                                                    "wickets": 2, "overs": 8}}},
        "POST /v1/par-score": {"body": match},
        "POST /v1/chase-curve": {"body": {**match, "target_from": 140, "target_to": 220, "step": 20}},
        "POST /v1/toss": {"body": match},
        "POST /v1/scenarios/compare": {"body": {**match, "scenario": {"dew": 0.8, "boundary_mult": 1.1}}},
        "POST /v1/players/{pid}/impact": {"path": {"pid": c["xi"][0]}, "body": match},
        "POST /v1/lineups/swap": {"body": {**match, "out_player": c["xi"][0], "in_player": b1 if b1 not in c["xi"] else b2}},
        "POST /v1/lineups/batting-order": {"body": {**match, "n": 800}},
        "POST /v1/lineups/bowling-plan": {"body": match},
        "POST /v1/fantasy/projections": {"body": match},
        "POST /v1/fantasy/team": {"body": match},
        "POST /v1/fantasy/portfolio": {"body": {**match, "teams_count": 3}},
        "GET /v1/graphics/matches/{match_id}/win.svg": {"path": {"match_id": m}},
        "GET /v1/graphics/matches/{match_id}/scores.svg": {"path": {"match_id": m}},
        "GET /v1/graphics/matches/{match_id}/worm.svg": {"path": {"match_id": m}},
        "GET /v1/graphics/matches/{match_id}/phases.svg": {"path": {"match_id": m}},
        "GET /v1/graphics/matches/{match_id}/duels.svg": {"path": {"match_id": m}},
        "GET /v1/graphics/matches/{match_id}/wickets/{team}.svg": {"path": {"match_id": m, "team": 0}},
        "GET /v1/graphics/matches/{match_id}/players/{pid}.svg": {"path": {"match_id": m, "pid": "__first__"}},
        "GET /v1/graphics/players/{pid}/profile.svg": {"path": {"pid": b1}},
        "GET /v1/graphics/matchups.svg": {"query": {"batter": b1, "bowler": w1}},
        "GET /v1/graphics/venues/{vid}.svg": {"path": {"vid": c["venue"]["id"]}},
        "GET /v1/graphics/trends/scoring.svg": {},
    }


def build(model_dir: Path, publish: Path, coverage: Path, patterns: Path) -> dict:
    from fastapi.testclient import TestClient

    from cricapi.main import Settings, create_app
    from cricapi.reference import build as reference
    tmp = Path(tempfile.mkdtemp())
    app = create_app(Settings(model_dir=model_dir, publish_dir=publish, coverage_dir=coverage, patterns_file=patterns,
                              keys_file=tmp / "keys.json", admin_key="examples"))
    client = TestClient(app)
    key = client.post("/admin/keys", params={"owner": "examples", "plan": "business"},
                      headers={"X-Admin-Key": "examples"}).json()["key"]
    headers = {"X-API-Key": key}
    model = app.state.cs.model
    ctx = context(model, client, headers)
    reqs = requests_for(ctx)
    if ctx["match_id"]:
        doc = client.get(f"/v1/matches/{ctx['match_id']}", headers=headers).json()
        first = doc["summary"]["teams"][0]["players"][0]["id"]
    else:
        first = None
    simulate_teams = []
    for t in ctx["teams"]:
        info = model.meta["catalog"]["teams"][t["team_id"]]
        f = info["formats"].get("T20") or next(iter(info["formats"].values()))
        simulate_teams.append({"name": info["name"], "players": f["last_xi"]})
    reqs["POST /v1/simulate"] = {"body": {"teams": simulate_teams, "venue_id": ctx["venue"]["id"], "n": 2000}}
    out, failed = {}, []
    for ep in reference()["endpoints"]:
        key_ = f"{ep['method']} {ep['path']}"
        r = reqs.get(key_)
        if r is None:
            continue
        path = ep["path"]
        params = dict(r.get("path", {}))
        if any(v is None for v in params.values()):
            continue
        for k, v in params.items():
            path = path.replace("{" + k + "}", str(first if v == "__first__" else v))
        q = r.get("query", {})
        resp = client.request(ep["method"], path, params=q, json=r.get("body"), headers=headers)
        if resp.status_code != 200:
            failed.append(f"{key_} → {resp.status_code}")
            continue
        body = resp.text if ep["returns"] == "svg" else _short(resp.json())
        out[ep["id"]] = {"path": path, "query": q, "body": r.get("body"), "status": 200, "response": body}
    return {"generated_from": model.meta.get("cutoff") or "latest model", "examples": out, "failed": failed}


@click.command()
@click.option("--model", "model_dir", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--publish", type=click.Path(path_type=Path), default=Path("data/publish"))
@click.option("--coverage", type=click.Path(path_type=Path), default=Path("data/coverage"))
@click.option("--patterns", type=click.Path(path_type=Path), default=Path("data/patterns/report.json"))
@click.option("--out", type=click.Path(path_type=Path), required=True)
def main(model_dir: Path, publish: Path, coverage: Path, patterns: Path, out: Path) -> None:
    d = build(model_dir, publish, coverage, patterns)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(d, separators=(",", ":")))
    click.echo(f"{len(d['examples'])} examples → {out}" + (f"; skipped: {d['failed']}" if d["failed"] else ""))


if __name__ == "__main__":
    main()
