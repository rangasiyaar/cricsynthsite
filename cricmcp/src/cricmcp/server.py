"""CricSynthesis MCP server.

Runs on the user's machine (stdio). Forecasts, player outlooks, match-ups and Pattern Lab results come from what the
website publishes; what-ifs, live win probability and fantasy picks are simulated locally with the same engine the
website's Scenario Lab runs in the browser. Nothing is hosted, so it costs nothing to run.

With CRICSYNTHESIS_API_KEY set, an `api_request` tool also reaches the full CricSynthesis API.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Annotated, Literal

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from pydantic import Field

from cricmcp import sim
from cricmcp.data import DataError, Store

SITE = "https://cricsynthesis.web.app"
MAX_SIMS = 10_000

INSTRUCTIONS = """CricSynthesis forecasts cricket matches by simulating them ball by ball (20,000 times per match).
Start with list_matches or match_forecast. Matches can be named by id or by team names ("India v West Indies").
Percentages are probabilities from simulation, not certainties; quote ranges where given. For what-ifs during or
before a match use simulate_scenario or live_win_probability. Forecasts are rebuilt nightly."""

mcp = MCPServer("CricSynthesis", instructions=INSTRUCTIONS, website_url=SITE, version="0.1.0")
store = Store()
READ = ToolAnnotations(readOnlyHint=True, openWorldHint=True)

MatchQ = Annotated[str | None, Field(description="Match id, or words from the team names / title, e.g. 'India v West Indies'. "
                                                 "Leave empty for the next match.")]


def _pct(p: float | None) -> str | None:
    return None if p is None else f"{100 * p:.0f}%"


def _range(d: dict, lo="10", hi="90") -> str | None:
    q = d.get("q") or {}
    return f"{q[lo]:.0f}-{q[hi]:.0f}" if lo in q and hi in q else None


def _doc(match: str | None) -> tuple[dict, dict]:
    card = store.find_match(match)
    return card, store.match(card["id"])


def _link(mid: str) -> str:
    return f"{SITE}/match/?id={mid}"


def _player_index(doc: dict) -> dict[str, tuple[int, dict]]:
    return {p["id"]: (t, p) for t, team in enumerate(doc["summary"]["teams"]) for p in team["players"]}


def _find_player(doc: dict, query: str) -> tuple[int, dict]:
    q = query.strip().lower()
    rows = list(_player_index(doc).values())
    for exact in (True, False):
        hits = [(t, p) for t, p in rows if (p["name"].lower() == q or p["id"].lower() == q) if exact] if exact else \
               [(t, p) for t, p in rows if all(w in p["name"].lower() for w in q.split())]
        if hits:
            return hits[0]
    raise DataError(f"No player '{query}' in this match. Players: " + ", ".join(p["name"] for _, p in rows))


def _resolve_ids(pack: dict, names: list[str] | None) -> list[str]:
    out = []
    for n in names or []:
        q = n.strip().lower()
        pid = next((pid for pid, p in pack["players"].items() if pid.lower() == q or p["name"].lower() == q), None) or \
            next((pid for pid, p in pack["players"].items() if all(w in p["name"].lower() for w in q.split())), None)
        if pid is None:
            raise DataError(f"No player '{n}' in this match.")
        out.append(pid)
    return out


def _team_index(pack: dict, name: str | None) -> int | None:
    if not name:
        return None
    q = name.strip().lower()
    for t, team in enumerate(pack["teams"]):
        if q in team["name"].lower():
            return t
    raise DataError(f"No team '{name}' in this match: {pack['teams'][0]['name']} or {pack['teams'][1]['name']}.")


# ── forecasts ──────────────────────────────────────────────────────────────────────────────────────────────────────

@mcp.tool(annotations=READ)
def list_matches() -> dict:
    """Upcoming matches with published forecasts: teams, date and time (IST), venue, win chances, projected scores."""
    cards = sorted(store.index(), key=lambda m: (m.get("date") or "9999", m.get("start_time") or ""))
    return {"matches": [{
        "id": m["id"], "title": m.get("title") or " v ".join(t["name"] for t in m["teams"]), "format": m["format"],
        "competition": m.get("competition"), "venue": m.get("venue"), "date": m.get("date"),
        "start_time_ist": m.get("start_time"), "win": {k: _pct(v) for k, v in m["win"].items()},
        "projected_first_innings": dict(zip((t["name"] for t in m["teams"]), m.get("projected") or [])),
        "link": _link(m["id"])} for m in cards]}


@mcp.tool(annotations=READ)
def match_forecast(match: MatchQ = None) -> dict:
    """Pre-match forecast: win chances (overall and by who bats first), projected scores with 80% ranges, phase-by-phase
    runs and wickets, likely top performers, winning margins and the main talking points."""
    card, doc = _doc(match)
    s, m = doc["summary"], doc["match"]
    res = s["result"]
    teams = []
    for t in s["teams"]:
        b = t["batting"]
        bat = sorted((p for p in t["players"] if p.get("batting")), key=lambda p: -p["batting"]["runs"]["mean"])[:3]
        bowl = sorted((p for p in t["players"] if p.get("bowling")), key=lambda p: -p["bowling"]["wickets"]["mean"])[:3]
        teams.append({
            "name": t["name"],
            "projected_score": round(b["score"]["mean"]), "score_80pct_range": _range(b["score"]),
            "wickets_lost_avg": round(b["wickets"]["mean"], 1),
            "phases": [{"phase": ph["phase"], "overs": f"{ph['overs'][0]}-{ph['overs'][1]}",
                        "runs": round(ph["runs"]["mean"]), "wickets": round(ph["wickets"]["mean"], 1),
                        "no_wicket": _pct(ph["p_no_wicket"])} for ph in b["phases"]],
            "top_run_scorers": [{"name": p["name"], "runs_avg": round(p["batting"]["runs"]["mean"]),
                                 "top_scorer": _pct(p["batting"]["p_top_scorer"]),
                                 "fifty": _pct(p["batting"]["p_at_least"].get("50"))} for p in bat],
            "top_wicket_takers": [{"name": p["name"], "wickets_avg": round(p["bowling"]["wickets"]["mean"], 1),
                                   "two_plus": _pct(p["bowling"]["p_wickets"].get("2")),
                                   "economy": p["bowling"]["economy"]} for p in bowl],
        })
    return {
        "match": {"id": m["id"], "title": m.get("title"), "format": m["format"], "competition": m.get("competition"),
                  "venue": m.get("venue"), "date": m.get("date"), "start_time_ist": m.get("start_time")},
        "win": {k: _pct(v) for k, v in res["win"].items()}, "tie": _pct(res.get("tie")),
        "win_margin_of_error": {k: f"±{100 * v:.1f} pts" for k, v in (res.get("win_ci95") or {}).items()},
        "win_by_who_bats_first": [{"batting_first": x["batting_first"], "win": {k: _pct(v) for k, v in x["win"].items()}}
                                  for x in res.get("by_toss", [])],
        "margin_if_batting_side_wins_runs": {"median": res["margin_runs"]["q"].get("50"), "range_80pct": _range(res["margin_runs"])},
        "margin_if_chasing_side_wins_wickets": {"median": res["margin_wickets"]["q"].get("50")},
        "teams": teams, "talking_points": [i["text"] for i in doc.get("insights", [])],
        "simulations": s["meta"]["simulations"], "generated_at": doc.get("generated_at"), "link": _link(m["id"]),
    }


@mcp.tool(annotations=READ)
def player_outlook(player: Annotated[str, Field(description="Player name (or part of it)")], match: MatchQ = None) -> dict:
    """One player's simulated outlook in a match: batting slot, runs (median and range), chances of 30/50/100, duck,
    top-scoring, how they get out and to whom; bowling overs, wickets, economy and chance of being best bowler."""
    card, doc = _doc(match)
    t, p = _find_player(doc, player)
    out: dict = {"player": p["name"], "team": doc["summary"]["teams"][t]["name"], "match": card["id"]}
    if b := p.get("batting"):
        out["batting"] = {
            "slot": b["slot"], "chance_bats": _pct(b["p_bats"]), "runs_avg": round(b["runs"]["mean"], 1),
            "runs_median": b["runs"]["q"].get("50"), "runs_80pct_range": _range(b["runs"]),
            "balls_median": b["balls"]["q"].get("50"), "strike_rate": b["strike_rate"],
            "chance_at_least": {k: _pct(v) for k, v in b["p_at_least"].items()}, "duck": _pct(b["p_duck"]),
            "top_scorer": _pct(b["p_top_scorer"]),
            "how_out": {k: _pct(v) for k, v in sorted(b["how_out"].items(), key=lambda kv: -kv[1]) if v >= 0.02},
            "most_likely_dismissed_by": [{"bowler": d["name"], "chance": _pct(d["p"])} for d in b["dismissed_by"][:3]],
        }
    if w := p.get("bowling"):
        out["bowling"] = {
            "chance_bowls": _pct(w["p_bowls"]), "overs_avg": w["overs"], "wickets_avg": round(w["wickets"]["mean"], 2),
            "chance_wickets": {k: _pct(v) for k, v in w["p_wickets"].items()}, "economy": w["economy"],
            "runs_conceded_80pct_range": _range(w["runs"]), "best_bowler": _pct(w["p_best_bowler"]),
        }
    prof = p.get("profile") or {}
    out["profile"] = {k: prof[k] for k in ("hand", "bowling_kind", "in_this_format") if prof.get(k) is not None}
    if not p.get("known"):
        out["note"] = "Little or no recorded data for this player; the outlook leans on typical values for the role."
    return out


@mcp.tool(annotations=READ)
def key_matchups(match: MatchQ = None, limit: Annotated[int, Field(ge=1, le=30)] = 10) -> dict:
    """Batter-v-bowler duels most likely to decide the match: the chance each bowler dismisses each batter."""
    card, doc = _doc(match)
    idx = _player_index(doc)
    name = lambda pid: idx[pid][1]["name"] if pid in idx else pid  # noqa: E731
    rows = sorted(doc["summary"]["matchups"], key=lambda r: -r["p"])[:limit]
    return {"match": card["id"], "matchups": [{"batter": name(r["batter"]), "bowler": name(r["bowler"]),
                                               "chance_bowler_dismisses_batter": _pct(r["p"])} for r in rows]}


@mcp.tool(annotations=READ)
def innings_shape(match: MatchQ = None) -> dict:
    """How each innings is expected to unfold over by over: median score and 50%/80% bands at the end of each over,
    runs and wicket chance per over, and when each wicket typically falls."""
    card, doc = _doc(match)
    out = []
    for t in doc["summary"]["teams"]:
        b = t["batting"]
        out.append({
            "team": t["name"],
            "by_over": [{"over": o["over"], "runs": round(o["runs"], 1), "wicket_chance": _pct(o["p_wicket"])}
                        for o in b["per_over"]],
            "cumulative_score_bands": [{k: f.get(k) for k in ("over", "q10", "q25", "q50", "q75", "q90")} for f in b.get("fan", [])],
            "fall_of_wickets": [{"wicket": f["wicket"], "chance_falls": _pct(f["p"]),
                                 "median_over": (f.get("over") or {}).get("q", {}).get("50"),
                                 "median_score": (f.get("score") or {}).get("q", {}).get("50")}
                                for f in b["fall_of_wickets"] if f["p"] >= 0.05],
        })
    return {"match": card["id"], "teams": out}


@mcp.tool(annotations=READ)
def about_the_model(match: MatchQ = None) -> dict:
    """How the forecast is made and how much to trust it: training volume, players and venues covered, fit quality,
    data cut-off, simulations run and match-to-match variation in conditions."""
    card, doc = _doc(match)
    meta = doc["summary"]["meta"]
    return {"method": "A ball-by-ball outcome model (dot, 1-6, wicket, extras) fitted on recorded deliveries, with "
                      "player, venue and situation effects. Each match is simulated in full many times; every number "
                      "is a share of those simulations.",
            "format": meta["format"], "simulations": meta["simulations"], "engine": meta.get("engine", {}),
            "model_version": doc.get("model"), "generated_at": doc.get("generated_at")}


# ── simulations run on this machine ────────────────────────────────────────────────────────────────────────────────

def _run(mid: str, sc: dict, n: int, seed: int) -> tuple[dict, list]:
    pack = store.pack(mid)
    sims = sim.simulate_matches(pack, max(100, min(n, MAX_SIMS)), sc, seed)
    return pack, sims


@mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True))
def simulate_scenario(
    match: MatchQ = None,
    batting_first: Annotated[str | None, Field(description="Team that bats first (the toss result). Empty = unknown.")] = None,
    boundary_mult: Annotated[float, Field(ge=0.5, le=2, description="Boundary rate multiplier; 1.15 = a small ground or flat pitch")] = 1.0,
    wicket_mult: Annotated[float, Field(ge=0.5, le=2, description="Wicket rate multiplier for all bowlers")] = 1.0,
    spin_wicket_mult: Annotated[float, Field(ge=0.5, le=2, description="Extra wicket multiplier for spinners (turning pitch > 1)")] = 1.0,
    pace_wicket_mult: Annotated[float, Field(ge=0.5, le=2, description="Extra wicket multiplier for pace (green pitch > 1)")] = 1.0,
    dew: Annotated[float, Field(ge=0, le=1, description="Dew in the second innings, 0 none to 1 heavy")] = 0.0,
    player_form: Annotated[dict[str, float] | None, Field(description="Player name -> form multiplier, e.g. {'Abhishek Sharma': 1.2}")] = None,
    exclude_bowlers: Annotated[list[str] | None, Field(description="Bowlers who won't bowl (injury, tactics)")] = None,
    simulations: Annotated[int, Field(ge=100, le=MAX_SIMS)] = 2000,
    seed: int = 1,
) -> dict:
    """What-if: re-simulate a match on this machine with changed conditions - toss, pitch, dew, ground size, player form
    or a bowler missing - and compare with the published baseline."""
    card, doc = _doc(match)
    pack = store.pack(card["id"])
    form = dict(zip(_resolve_ids(pack, list((player_form or {}).keys())), (player_form or {}).values()))
    sc = {"battingFirst": _team_index(pack, batting_first), "boundaryMult": boundary_mult, "wicketMult": wicket_mult,
          "spinWicketMult": spin_wicket_mult, "paceWicketMult": pace_wicket_mult, "dew": dew, "playerForm": form,
          "excludeBowlers": _resolve_ids(pack, exclude_bowlers)}
    _, sims = _run(card["id"], sc, simulations, seed)
    out = sim.summarize(pack, sims)
    out["baseline_win"] = {k: _pct(v) for k, v in doc["summary"]["result"]["win"].items()}
    out["win"] = {k: _pct(v) for k, v in out["win"].items()}
    out["match"] = card["id"]
    return out


def _balls(overs: float, bpo: int) -> int:
    whole = int(overs)
    part = round((overs - whole) * 10)
    if part >= bpo:
        raise DataError(f"Overs must be written as overs.balls with fewer than {bpo} balls after the point.")
    return whole * bpo + part


@mcp.tool(annotations=READ)
def live_win_probability(
    batting_team: Annotated[str, Field(description="Team batting now")],
    runs: Annotated[int, Field(ge=0)], wickets: Annotated[int, Field(ge=0, le=9)],
    overs: Annotated[float, Field(ge=0, description="Overs bowled as overs.balls, e.g. 12.3")],
    target: Annotated[int | None, Field(description="Target in the second innings (first-innings total + 1). Empty = first innings.")] = None,
    match: MatchQ = None,
    striker: str | None = None, non_striker: str | None = None,
    out: Annotated[list[str] | None, Field(description="Batters already out, so the right batters come in next")] = None,
    simulations: Annotated[int, Field(ge=100, le=MAX_SIMS)] = 2000,
    seed: int = 1,
) -> dict:
    """Win probability from any point in a match: simulates the rest of the game from the current score with the
    batters and bowlers who are left, and gives each side's chance and the projected final total."""
    card, _ = _doc(match)
    pack = store.pack(card["id"])
    t = _team_index(pack, batting_team)
    innings = 2 if target else 1
    ids = lambda xs: _resolve_ids(pack, xs)  # noqa: E731
    start = {"innings": innings, "runs": runs, "wickets": wickets, "balls": _balls(overs, pack["rules"]["bpo"]),
             "out": ids(out), "striker": (ids([striker]) or [None])[0] if striker else None,
             "nonStriker": (ids([non_striker]) or [None])[0] if non_striker else None}
    if innings == 2:
        start["firstInningsTotal"] = target - 1
    sc = {"start": start, "battingFirst": t if innings == 1 else 1 - t}
    if target:
        sc["target"] = target
    _, sims = _run(card["id"], sc, simulations, seed)
    s = sim.summarize(pack, sims)
    bat = s["teams"][t]
    res = {"match": card["id"], "state": f"{pack['teams'][t]['name']} {runs}/{wickets} after {overs} overs"
                                        + (f", chasing {target}" if target else ""),
           "win": {k: _pct(v) for k, v in s["win"].items()}, "tie": _pct(s["tie"]),
           "projected_total": round(bat["score"]["mean"]), "total_80pct_range": f"{bat['score']['q10']:.0f}-{bat['score']['q90']:.0f}",
           "simulations": s["simulations"]}
    if target:
        res["runs_needed"] = target - runs
        res["balls_left"] = pack["rules"]["overs"] * pack["rules"]["bpo"] - start["balls"]
    return res


@mcp.tool(annotations=READ)
def fantasy_team(
    match: MatchQ = None,
    simulations: Annotated[int, Field(ge=200, le=MAX_SIMS)] = 2000, seed: int = 1,
) -> dict:
    """Fantasy (Dream11-style T20 points) projections from simulation: expected points and range for all 22 players,
    a suggested XI with 1-10 per side, and captain / vice-captain. Catches, run-outs and maidens aren't counted."""
    card, _ = _doc(match)
    pack, sims = _run(card["id"], {}, simulations, seed)
    pts = sim.fantasy_points(pack, sims)
    team_of = {p: t for t, team in enumerate(pack["teams"]) for p in team["players"]}
    rows = []
    for p, v in pts.items():
        s = sorted(v)
        rows.append({"id": p, "player": pack["players"].get(p, {}).get("name", p), "team": pack["teams"][team_of[p]]["name"],
                     "expected": round(sum(v) / len(v), 1), "median": s[len(s) // 2], "p90": s[int(.9 * (len(s) - 1))],
                     "ceiling_share": round(sum(x >= 60 for x in v) / len(v), 3)})
    rows.sort(key=lambda r: -r["expected"])
    xi = rows[:11]
    for t in (0, 1):
        if not any(team_of[r["id"]] == t for r in xi):
            xi[-1] = next(r for r in rows if team_of[r["id"]] == t)
    for t in (0, 1):
        while sum(team_of[r["id"]] == t for r in xi) > 10:
            drop = min((r for r in xi if team_of[r["id"]] == t), key=lambda r: r["expected"])
            xi.remove(drop)
            xi.append(next(r for r in rows if r not in xi and team_of[r["id"]] != t))
    by_ceiling = sorted(xi, key=lambda r: -(r["expected"] + r["p90"]) / 2)
    strip = lambda r: {k: v for k, v in r.items() if k != "id"}  # noqa: E731
    return {"match": card["id"], "simulations": len(sims), "captain": by_ceiling[0]["player"],
            "vice_captain": by_ceiling[1]["player"], "suggested_xi": [strip(r) for r in xi],
            "all_players": [strip(r) for r in rows],
            "note": "Points table: runs, boundaries, milestones, duck, strike rate, wickets, bowled/LBW, hauls, economy, "
                    "+4 for playing. Check the announced XIs before locking a team."}


# ── Pattern Lab ────────────────────────────────────────────────────────────────────────────────────────────────────

@mcp.tool(annotations=READ)
def pattern_lab(
    search: Annotated[str | None, Field(description="Words to look for, e.g. 'new batter', 'six', 'chase'")] = None,
    verdict: Literal["real", "myth", "reversed", "any"] = "any",
) -> dict:
    """Cricket folklore tested on ball-by-ball data: does a wicket follow a six, are new batters vulnerable, do chases
    collapse? Each pattern has a verdict and the measured effect (rate ratio, 1 = no effect) with a 95% interval."""
    rep = store.patterns()
    rows = rep["patterns"]
    if search:
        ws = search.lower().split()
        rows = [r for r in rows if all(w in f"{r['title']} {r['question']} {r['category']}".lower() for w in ws)]
    if verdict != "any":
        rows = [r for r in rows if r["verdict"] == verdict]
    def eff(r):
        f = r.get("full") or {}
        return {"rate_ratio": f.get("rr"), "ci95": [f.get("lo"), f.get("hi")], "balls": f.get("exposed_balls")}
    return {"balls_analysed": rep["summary"]["balls"], "count": len(rows),
            "patterns": [{"title": r["title"], "question": r["question"], "category": r["category"],
                          "outcome": r["outcome"], "folklore_says": r["folklore"], "verdict": r["verdict"],
                          "why": r.get("why"), "effect": eff(r)} for r in rows[:40]],
            "link": f"{SITE}/patterns/"}


# ── full API (needs a key) ─────────────────────────────────────────────────────────────────────────────────────────

def _register_api(key: str) -> None:
    base = os.environ.get("CRICSYNTHESIS_API_URL", "https://api.cricsynthesis.in").rstrip("/")

    @mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=True))
    def api_request(path: Annotated[str, Field(description="Endpoint path, e.g. /v1/players/compare")],
                    method: Literal["GET", "POST"] = "GET", params: dict | None = None, body: dict | None = None) -> dict:
        """Call any of the 56 CricSynthesis API endpoints (analytics, simulation and modelling, graphics) with your key.
        GET /v1 lists the catalog."""
        if not re.match(r"^/v1(/|$)", path):
            raise DataError("Paths start with /v1.")
        url = base + path + (("?" + urllib.parse.urlencode(params, doseq=True)) if params else "")
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method,
                                     headers={"X-API-Key": key, "Content-Type": "application/json", "User-Agent": "cricsynthesis-mcp/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                ct = r.headers.get("Content-Type", "")
                raw = r.read()
        except urllib.error.HTTPError as e:
            raise DataError(f"API {e.code}: {e.read()[:500].decode(errors='replace')}") from e
        return json.loads(raw) if "json" in ct else {"content_type": ct, "body": raw[:20000].decode(errors="replace")}


if key := os.environ.get("CRICSYNTHESIS_API_KEY"):
    _register_api(key)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
