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
from pathlib import Path
from typing import Annotated, Literal

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from pydantic import Field

from cricmcp import graphics, modelling, sim
from cricmcp.data import DataError, Store
from cricmcp.insight import PHASES, Kit

SITE = "https://cricsynthesis.web.app"
MAX_SIMS = 10_000

INSTRUCTIONS = """CricSynthesis: cricket analytics and forecasts from a ball-by-ball model of every recorded delivery.
Three kinds of tools:
- Analytics (any player, venue, competition or team): player ratings, phase / bowling-type / situation splits, roles,
  similar players, rankings, batter-v-bowler match-ups, venue and competition profiles, scoring trends, team profiles.
  Players can be named in plain words; search_players helps when a name is ambiguous.
- Simulation and modelling (upcoming covered matches, see list_matches): forecasts, what-ifs, live win probability,
  par score, chase curve, toss call, batting order, bowling plan, player impact, fantasy projections, team and portfolio.
- Graphics: shareable SVG cards for matches, players, match-ups, venues and trends.
Numbers are model expectations or shares of simulations, not certainties; quote ranges where given. Ratings are
relative to an average player in the same format (1.00 = average). Data is rebuilt nightly."""

mcp = MCPServer("CricSynthesis", instructions=INSTRUCTIONS, website_url=SITE, version="0.2.0")
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



# ── analytics (any player, venue, competition, team) ───────────────────────────────────────────────────────────────

Format = Literal["T20", "OD"]
FormatAll = Literal["T20", "T10", "HUNDRED", "OD"]
Gender = Literal["male", "female"]
Phase = Literal["powerplay", "middle", "death"]
PlayerQ = Annotated[str, Field(description="Player name (or part of it) or player id")]
_kit: Kit | None = None


def kit() -> Kit:
    global _kit
    if _kit is None:
        _kit = Kit(store.kit_file("context.json"), store.player)
    return _kit


def _p(query: str) -> dict:
    return store.resolve_player(query)


def _gender(p: dict, gender: str | None) -> str:
    return gender or p.get("gender") or "male"


def _players_or_stubs(ids: list[str]) -> dict[str, dict]:
    out = {}
    for pid in ids:
        try:
            out[pid] = store.player(pid)
        except DataError:
            out[pid] = Kit.stub(pid)
    return out


@mcp.tool(annotations=READ)
def search_players(query: Annotated[str, Field(description="Part of a name, e.g. 'Kohli' or 'Smith'")],
                   limit: Annotated[int, Field(ge=1, le=50)] = 10) -> dict:
    """Find players by name: ids, gender, batting hand, bowling type and how much data the model has on them."""
    return {"players": [{**r, "balls": int(r["balls"])} for r in store.find_players(query, limit)]}


@mcp.tool(annotations=READ)
def player_rating(player: PlayerQ, format: Format = "T20") -> dict:
    """A player's model rating: wicket, four and six multipliers batting and bowling against an average player
    (1.0 = average), with the balls behind them in short formats and one-day cricket."""
    return kit().rating(_p(player), format)


@mcp.tool(annotations=READ)
def player_phases(player: PlayerQ, format: FormatAll = "T20", gender: Gender | None = None) -> dict:
    """Batting and bowling by powerplay, middle and death overs: strike rate, balls per dismissal, dot and boundary
    rates, economy, balls per wicket, each also as a ratio to an average player."""
    p = _p(player)
    return kit().phase_profile(p, format, _gender(p, gender))


@mcp.tool(annotations=READ)
def player_vs_bowling(player: PlayerQ, format: FormatAll = "T20", phase: Phase = "middle",
                      gender: Gender | None = None) -> dict:
    """A batter against each bowling type (right/left-arm pace, off-spin, leg-spin, left-arm orthodox and wrist spin):
    strike rate and balls per dismissal, with the strongest and weakest match-up."""
    p = _p(player)
    return kit().vs_bowling(p, format, _gender(p, gender), phase)


@mcp.tool(annotations=READ)
def bowler_vs_batting_hand(player: PlayerQ, format: FormatAll = "T20", phase: Phase = "middle",
                           gender: Gender | None = None) -> dict:
    """A bowler against right- and left-handed batters: economy, balls per wicket, dot and boundary rates."""
    p = _p(player)
    return kit().vs_batting_hand(p, format, _gender(p, gender), phase)


@mcp.tool(annotations=READ)
def player_situations(player: PlayerQ, format: FormatAll = "T20", gender: Gender | None = None) -> dict:
    """How a batter's scoring and survival change from the first ball to being set, and when chasing at different
    required run rates."""
    p = _p(player)
    return kit().situations(p, format, _gender(p, gender))


@mcp.tool(annotations=READ)
def player_formats(player: PlayerQ, gender: Gender | None = None) -> dict:
    """The same player in T20 and one-day cricket, batting and bowling, with the data behind each."""
    p = _p(player)
    return kit().format_split(p, _gender(p, gender))


@mcp.tool(annotations=READ)
def player_role(player: PlayerQ, format: Format = "T20") -> dict:
    """Usual batting position and role, overs per match and when they're bowled (powerplay / middle / death),
    matches and when last played."""
    return kit().role(_p(player), format)


@mcp.tool(annotations=READ)
def similar_players(player: PlayerQ, format: Format = "T20",
                    side: Literal["batting", "bowling"] = "batting") -> dict:
    """The ten players with the most similar style (outcome rates by phase and bowling type or batting hand)."""
    p = _p(player)
    rows = (p.get("similar") or {}).get(format, {}).get(side)
    if not rows:
        return {"player": Kit.who(p), "format": format, "side": side, "similar": [],
                "note": f"Not enough {side} data in {format} (300 balls) to compare styles."}
    return {"player": Kit.who(p), "format": format, "side": side,
            "similar": [{"id": pid, "name": _name(pid), "similarity": round(1 / (1 + d), 3)} for pid, d in rows]}


def _name(pid: str) -> str:
    try:
        return store.player(pid)["name"]
    except DataError:
        return pid


@mcp.tool(annotations=READ)
def compare_players(players: Annotated[list[str], Field(min_length=2, max_length=8, description="Names or ids")],
                    format: FormatAll = "T20", gender: Gender | None = None) -> dict:
    """Two to eight players side by side, batting and bowling by phase, with the average player for reference."""
    ps = [_p(q) for q in players]
    return kit().compare(ps, format, _gender(ps[0], gender))


RankSort = Literal["impact", "strike_rate", "balls_per_dismissal", "boundary_pct", "six_pct", "dot_pct", "economy",
                   "balls_per_wicket", "extras_per_over"]


@mcp.tool(annotations=READ)
def rankings(side: Literal["batting", "bowling"] = "batting", format: Format = "T20", gender: Gender = "male",
             phase: Phase = "middle", sort: RankSort = "impact", limit: Annotated[int, Field(ge=1, le=100)] = 25,
             min_balls: Annotated[int, Field(ge=500)] = 500) -> dict:
    """Model leaderboard of active players (played in the last two years, 500+ balls). Impact = runs added (batting)
    or saved (bowling) per 120 balls against an average player, each wicket priced at a typical run value."""
    r = store.kit_file(f"rankings/{format}-{gender}-{side}-{phase}.json")
    rows = [x for x in r["players"] if (x.get("balls") or 0) >= min_balls]
    ascending = {"batting": {"dot_pct"}, "bowling": {"economy", "balls_per_wicket", "boundary_pct", "extras_per_over"}}[side]
    if sort == "impact":
        key = lambda x: -(x["impact_per_120"] or 0)  # noqa: E731
    elif sort in ascending:
        key = lambda x: x.get(sort) if x.get(sort) is not None else 1e9  # noqa: E731
    else:
        key = lambda x: -(x.get(sort) or 0)  # noqa: E731
    rows = sorted(rows, key=key)[:limit]
    return {**{k: r[k] for k in ("format", "gender", "side", "phase", "average") if k in r}, "sort": sort,
            "players": [{**{k: v for k, v in x.items() if k != "rank"}, "rank": i + 1} for i, x in enumerate(rows)]}


@mcp.tool(annotations=READ)
def matchup(batter: PlayerQ, bowler: PlayerQ, format: FormatAll = "T20", phase: Phase = "middle",
            gender: Gender | None = None) -> dict:
    """Batter v bowler, ball by ball: chance of each outcome, strike rate, balls per dismissal, dot and boundary rates,
    and the edge against an average pairing."""
    b, w = _p(batter), _p(bowler)
    return kit().matchup(b, w, format, _gender(b, gender), phase)


@mcp.tool(annotations=READ)
def matchup_grid(batters: Annotated[list[str], Field(min_length=1, max_length=11)],
                 bowlers: Annotated[list[str], Field(min_length=1, max_length=11)],
                 format: FormatAll = "T20", phase: Phase = "middle", gender: Gender | None = None) -> dict:
    """Every batter against every bowler: strike rate, balls per dismissal and wicket / scoring edges."""
    bs, ws = [_p(q) for q in batters], [_p(q) for q in bowlers]
    return kit().matchup_grid(bs, ws, format, _gender(bs[0], gender), phase)


@mcp.tool(annotations=READ)
def best_bowler_against(batter: PlayerQ, candidates: Annotated[list[str], Field(min_length=1, max_length=15)],
                        format: FormatAll = "T20", phase: Phase = "middle", gender: Gender | None = None) -> dict:
    """Which of these bowlers to use against a batter: ranked by net runs per over with wickets priced in."""
    b = _p(batter)
    return kit().counter(b, [_p(q) for q in candidates], format, _gender(b, gender), phase)


@mcp.tool(annotations=READ)
def venues(search: str | None = None, limit: Annotated[int, Field(ge=1, le=100)] = 20) -> dict:
    """Grounds the model knows, with city and matches; search by name or city."""
    rows = store.kit_file("venues.json")["venues"]
    if search:
        q = search.lower()
        rows = [v for v in rows if q in v["id"].lower() or q in (v.get("name") or "").lower()
                or q in (v.get("city") or "").lower()]
    return {"venues": rows[:limit]}


def _venue(query: str) -> dict:
    rows = venues(query, 1)["venues"]
    if not rows:
        raise DataError(f"No venue matches '{query}'.")
    return rows[0]


@mcp.tool(annotations=READ)
def venue_profile(venue: Annotated[str, Field(description="Venue name, city or id")], format: Format = "T20",
                  gender: Gender = "male") -> dict:
    """How a ground plays: runs per over, balls per wicket and boundary rate by phase against a neutral ground, and
    its character (high / low scoring, bowler / batting friendly)."""
    v = _venue(venue)
    prof = store.kit_file(f"venues/{_safe(v['id'])}.json").get(f"{format}:{gender}")
    if not prof:
        raise DataError(f"No {format} {gender} profile for {v.get('name') or v['id']}.")
    return prof


def _safe(x: str) -> str:
    from cricmcp.data import safe_id
    return safe_id(x)


@mcp.tool(annotations=READ)
def competitions(search: str | None = None, limit: Annotated[int, Field(ge=1, le=100)] = 20) -> dict:
    """Leagues and series the model knows: format, gender, matches and the latest season."""
    rows = store.kit_file("competitions.json")["competitions"]
    if search:
        q = search.lower()
        rows = [c for c in rows if q in c["key"].lower() or q in (c.get("name") or "").lower()]
    return {"competitions": rows[:limit]}


@mcp.tool(annotations=READ)
def competition_profile(competition: Annotated[str, Field(description="Competition name or key, e.g. 'IPL'")]) -> dict:
    """How a competition plays compared with neutral conditions: scoring and wicket indices by phase."""
    rows = competitions(competition, 1)["competitions"]
    if not rows:
        raise DataError(f"No competition matches '{competition}'.")
    return store.kit_file(f"competitions/{_safe(rows[0]['key'])}.json")


@mcp.tool(annotations=READ)
def scoring_trend(format: Format = "T20", gender: Gender = "male") -> dict:
    """Runs per over, balls per wicket and boundary rate by phase, season by season, plus the model's current level."""
    return store.kit_file(f"trends/{format}-{gender}.json")


@mcp.tool(annotations=READ)
def teams(search: str | None = None, gender: Gender | None = None, limit: Annotated[int, Field(ge=1, le=100)] = 20) -> dict:
    """Teams the model knows (international and franchise), with formats and last match."""
    cat = store.kit_file("teams.json")["teams"]
    rows = []
    for tid, t in cat.items():
        if search and search.lower() not in tid.lower() and search.lower() not in (t.get("name") or "").lower():
            continue
        if gender and t.get("gender") != gender:
            continue
        rows.append({"id": tid, "name": t.get("name"), "gender": t.get("gender"), "formats": sorted(t["formats"]),
                     "last_match": max((v.get("last") or "" for v in t["formats"].values()), default="")})
    rows.sort(key=lambda r: r["last_match"], reverse=True)
    return {"teams": rows[:limit]}


@mcp.tool(annotations=READ)
def team_profile(team: Annotated[str | None, Field(description="Team name or id; its latest XI is used")] = None,
                 players: Annotated[list[str] | None, Field(description="Or any 11 players in batting order")] = None,
                 format: Format = "T20", gender: Gender | None = None) -> dict:
    """A side's batting (each position v average, survival against spin and pace, left-handers in the top seven) and
    bowling (options by type, economy and strike by phase). Give a team or any XI."""
    k = kit()
    info = None
    if players:
        if len(players) != 11:
            raise DataError("Give exactly 11 players.")
        xi = [_p(q) for q in players]
    else:
        if not team:
            raise DataError("Give a team or 11 players.")
        cat = store.kit_file("teams.json")["teams"]
        q = team.lower()
        tid = next((t for t in cat if t.lower() == q), None) or next(
            (t for t, v in cat.items() if q in t.lower() or q in (v.get("name") or "").lower()), None)
        if not tid:
            raise DataError(f"No team matches '{team}'.")
        info = cat[tid]
        f = info["formats"].get(format) or next(iter(info["formats"].values()))
        ids = f.get("last_xi") or []
        if len(ids) != 11:
            raise DataError(f"No full XI on record for {info.get('name')}.")
        xi = list(_players_or_stubs(ids).values())
        gender = gender or info.get("gender")
    out = k.team_profile(xi, format, gender or xi[0].get("gender") or "male")
    if info:
        out = {"team": info.get("name"), **out}
    return out


@mcp.tool(annotations=READ)
def pattern_detail(pattern: Annotated[str, Field(description="Pattern id or words from its title")]) -> dict:
    """One Pattern Lab test in full: the question, folklore, verdict, why, and the effect in the discovery and
    validation periods with intervals."""
    rows = store.patterns()["patterns"]
    q = pattern.lower()
    r = next((r for r in rows if r["id"] == q), None) or next(
        (r for r in rows if all(w in f"{r['title']} {r['question']}".lower() for w in q.split())), None)
    if not r:
        raise DataError(f"No pattern matches '{pattern}'.")
    return r


# ── more decision models for covered matches ───────────────────────────────────────────────────────────────────────

TeamQ = Annotated[str, Field(description="Team name in this match")]


def _match_pack(match: str | None) -> tuple[dict, dict, dict]:
    card, doc = _doc(match)
    return card, doc, store.pack(card["id"])


@mcp.tool(annotations=READ)
def innings_projection(
    batting_team: Annotated[str, Field(description="Team batting now")],
    runs: Annotated[int, Field(ge=0)], wickets: Annotated[int, Field(ge=0, le=9)],
    overs: Annotated[float, Field(ge=0, description="Overs bowled as overs.balls, e.g. 12.3")],
    target: Annotated[int | None, Field(description="Target in the second innings; empty = first innings")] = None,
    thresholds: Annotated[list[int] | None, Field(description="Totals to give the chance of reaching")] = None,
    match: MatchQ = None, simulations: Annotated[int, Field(ge=200, le=MAX_SIMS)] = 2000,
) -> dict:
    """Where an innings ends from its current score: final total and wickets with ranges, chance of reaching given
    totals, chance of being bowled out and expected runs in each remaining over."""
    card, _, pack = _match_pack(match)
    t = _team_index(pack, batting_team)
    bpo = pack["rules"]["bpo"]
    balls = _balls(overs, bpo)
    start = {"innings": 2 if target else 1, "runs": runs, "wickets": wickets, "balls": balls}
    sc = {"start": start, "battingFirst": t if not target else 1 - t}
    if target:
        start["firstInningsTotal"] = target - 1
        sc["target"] = target
    sims = sim.simulate_matches(pack, simulations, sc, modelling.SEED)
    inn = [sim.team_innings(m, t)[0] for m in sims]
    final = [x.runs for x in inn]
    lo = int(sim._quant(final, .05) // 10 * 10)
    th = thresholds or list(range(lo, lo + 90, 10))
    done = balls // bpo
    n = len(inn)
    return {"match": card["id"], "team": pack["teams"][t]["name"], "from": {"runs": runs, "wickets": wickets, "overs": overs},
            "final_total": sim.dist(final), "final_wickets": sim.dist([x.wkts for x in inn]),
            "chance_at_least": {str(x): _pct(sum(f >= x for f in final) / n) for x in th},
            "chance_all_out": _pct(sum(x.wkts >= 10 for x in inn) / n),
            "expected_runs_by_over": [{"over": o + 1, "runs": round(sum(x.over_runs[o] for x in inn) / n, 2)}
                                      for o in range(done, pack["rules"]["overs"])],
            "simulations": n}


@mcp.tool(annotations=READ)
def par_score(match: MatchQ = None, simulations: Annotated[int, Field(ge=500, le=MAX_SIMS)] = 3000) -> dict:
    """Par first-innings score for each side batting first, its chance of winning, and the totals that make it
    50%, 60% and 70% to win."""
    card, _, pack = _match_pack(match)
    return {"match": card["id"], **modelling.par_score(pack, simulations)}


@mcp.tool(annotations=READ)
def chase_curve(chasing_team: TeamQ, match: MatchQ = None,
                target_from: Annotated[int, Field(ge=1)] = 120, target_to: Annotated[int, Field(ge=1)] = 220,
                step: Annotated[int, Field(ge=1, le=50)] = 10,
                simulations_per_target: Annotated[int, Field(ge=200, le=3000)] = 600) -> dict:
    """Chance of a successful chase for each target, the coin-flip target and balls to spare when the chase succeeds."""
    card, _, pack = _match_pack(match)
    t = _team_index(pack, chasing_team)
    targets = list(range(target_from, target_to + 1, step))[:25]
    return {"match": card["id"], **modelling.chase_curve(pack, t, targets, simulations_per_target)}


@mcp.tool(annotations=READ)
def toss_decision(match: MatchQ = None, simulations: Annotated[int, Field(ge=1000, le=MAX_SIMS)] = 4000) -> dict:
    """Bat or bowl: each side's win chance batting first and chasing, the better choice and by how much."""
    card, _, pack = _match_pack(match)
    return {"match": card["id"], **modelling.toss(pack, simulations)}


@mcp.tool(annotations=READ)
def batting_order(team: TeamQ, match: MatchQ = None,
                  simulations_per_order: Annotated[int, Field(ge=300, le=5000)] = 1500) -> dict:
    """Batting-order optimiser: the given order, every adjacent swap in the top eight and each batter promoted to
    No. 3, ranked by win chance and score."""
    card, _, pack = _match_pack(match)
    return {"match": card["id"], **modelling.batting_order(pack, _team_index(pack, team), simulations_per_order)}


@mcp.tool(annotations=READ)
def bowling_plan(bowling_team: TeamQ, match: MatchQ = None,
                 bowlers: Annotated[list[str] | None, Field(description="Who may bowl (default: the usual bowlers)")] = None) -> dict:
    """Over-by-over bowling plan: each over to the bowler with the best expected value against the batters likely to
    be in, within quotas and without consecutive overs."""
    card, doc, pack = _match_pack(match)
    t = _team_index(pack, bowling_team)
    ids = [p for team in pack["teams"] for p in team["players"]]
    ps = _players_or_stubs(ids)
    for pid, p in ps.items():
        p.setdefault("name", pack["players"].get(pid, {}).get("name", pid))
        if not p.get("known", True):
            p["name"] = pack["players"].get(pid, {}).get("name", pid)
    pool = _resolve_ids(pack, bowlers) if bowlers else None
    try:
        out = modelling.bowling_plan(kit(), pack, ps, t, doc["match"].get("gender") or pack.get("gender") or "male", pool)
    except ValueError as e:
        raise DataError(str(e)) from e
    return {"match": card["id"], **out}


@mcp.tool(annotations=READ)
def player_impact(player: PlayerQ, match: MatchQ = None,
                  simulations: Annotated[int, Field(ge=500, le=MAX_SIMS)] = 2000) -> dict:
    """How much a player moves the result: their team's win chance if they have a poor day (form 0.75), a normal
    day and a good day (form 1.33), with the team's median score in each."""
    card, _, pack = _match_pack(match)
    pid = _resolve_ids(pack, [player])[0]
    team = next(t for t, tm in enumerate(pack["teams"]) if pid in tm["players"])
    name = pack["teams"][team]["name"]
    out = {}
    for label, f in (("poor_day", 0.75), ("normal", 1.0), ("good_day", 1.33)):
        s = modelling.short(pack, sim.simulate_matches(pack, simulations, {"playerForm": {pid: f}}, modelling.SEED))
        out[label] = {"win": _pct(s["win"][name]), "median_score": s["score"][name]["median"]}
    swing = float(out["good_day"]["win"].rstrip("%")) - float(out["poor_day"]["win"].rstrip("%"))
    return {"match": card["id"], "player": pack["players"].get(pid, {}).get("name", pid), "team": name, **out,
            "win_swing_points": round(swing, 1), "simulations_each": simulations}


def _roles(doc: dict, pack: dict, roles: dict | None) -> dict:
    overs = {p["id"]: (p.get("bowling") or {}).get("overs") or 0.0 for t in doc["summary"]["teams"] for p in t["players"]}
    named = dict(zip(_resolve_ids(pack, list((roles or {}).keys())), (roles or {}).values())) if roles else {}
    return modelling.infer_roles(pack, overs, named)


Role = Literal["WK", "BAT", "AR", "BOWL"]


@mcp.tool(annotations=READ)
def fantasy_projections(match: MatchQ = None, roles: dict[str, Role] | None = None,
                        simulations: Annotated[int, Field(ge=500, le=MAX_SIMS)] = 3000) -> dict:
    """Fantasy points (Dream11-style T20 table) for all 22 players from simulation: mean, median, 10th and 90th
    percentiles and the chance of being the top scorer. Catches, run-outs and maidens aren't counted."""
    card, doc, pack = _match_pack(match)
    out = modelling.fantasy_projections(pack, _roles(doc, pack, roles), simulations)
    for r in out["players"]:
        r.pop("id", None)
    return {"match": card["id"], **out}


@mcp.tool(annotations=READ)
def fantasy_team(match: MatchQ = None, captain_rule: Literal["mean", "upside"] = "mean",
                 roles: dict[str, Role] | None = None,
                 simulations: Annotated[int, Field(ge=500, le=MAX_SIMS)] = 3000) -> dict:
    """Best fantasy XI by expected points (at least one from each side), with captain and vice-captain by expected
    points ('mean') or by 90th-percentile upside ('upside'). Check the announced XIs before locking a team."""
    card, doc, pack = _match_pack(match)
    return {"match": card["id"], **modelling.fantasy_team(pack, _roles(doc, pack, roles), simulations, captain_rule)}


@mcp.tool(annotations=READ)
def fantasy_portfolio(match: MatchQ = None, teams_count: Annotated[int, Field(ge=2, le=10)] = 5,
                      simulations: Annotated[int, Field(ge=1000, le=MAX_SIMS)] = 3000) -> dict:
    """Several fantasy teams that together cover the likely matches (for multi-entry contests): each added team is
    the one that most raises the expected score of the portfolio's best team."""
    card, _, pack = _match_pack(match)
    return {"match": card["id"], **modelling.fantasy_portfolio(pack, teams_count, simulations)}


# ── graphics ───────────────────────────────────────────────────────────────────────────────────────────────────────

Theme = Literal["dark", "light"]


def _save(name: str, svg: str) -> dict:
    folder = Path(os.environ.get("CRICSYNTHESIS_OUT") or Path.home() / "CricSynthesis" / "cards")
    try:
        folder.mkdir(parents=True, exist_ok=True)
        f = folder / f"{re.sub(r'[^A-Za-z0-9_.-]+', '-', name).strip('-')}.svg"
        f.write_text(svg)
        where = str(f)
    except OSError:
        where = None
    return {"saved_to": where, "format": "image/svg+xml", "size": "1200x675", "svg": svg}


@mcp.tool(annotations=READ)
def match_graphic(card: Literal["win", "scores", "worm", "phases", "duels", "wickets", "player"] = "win",
                  match: MatchQ = None, team: Annotated[str | None, Field(description="For 'wickets'")] = None,
                  player: Annotated[str | None, Field(description="For 'player'")] = None, theme: Theme = "dark") -> dict:
    """A 1200x675 SVG card for a covered match: win probability, score distributions, run worm, phases, key duels,
    wicket timing for a team, or one player's outlook. Saved to ~/CricSynthesis/cards and returned as SVG text."""
    card_, doc = _doc(match)
    if card == "wickets":
        t = 0 if not team else _team_index(store.pack(card_["id"]), team)
        svg = graphics.wickets_card(doc, t, theme, True)
    elif card == "player":
        if not player:
            raise DataError("Name the player for a player card.")
        _, p = _find_player(doc, player)
        svg = graphics.player_card(doc, p["id"], theme, True)
    else:
        svg = graphics.CARDS[card](doc, theme, True)
    return _save(f"{card_['id']}-{card}", svg)


@mcp.tool(annotations=READ)
def analytics_graphic(card: Literal["player", "matchup", "venue", "trend"], player: str | None = None,
                      bowler: str | None = None, venue: str | None = None, format: Format = "T20",
                      gender: Gender = "male", theme: Theme = "dark") -> dict:
    """A 1200x675 SVG card from the model: a player's phase profile, a batter-v-bowler match-up (player = batter),
    a venue profile or the scoring trend. Saved to ~/CricSynthesis/cards and returned as SVG text."""
    if card == "player":
        prof = player_phases(player or "", format)
        return _save(f"player-{prof['player']['name']}", graphics.player_profile_card(prof, theme, True))
    if card == "matchup":
        if not (player and bowler):
            raise DataError("Give player (the batter) and bowler.")
        mu = matchup(player, bowler, format)
        return _save(f"matchup-{mu['batter']['name']}-v-{mu['bowler']['name']}", graphics.matchup_card(mu, theme, True))
    if card == "venue":
        v = venue_profile(venue or "", format, gender)
        return _save(f"venue-{v['venue']['id']}", graphics.venue_card(v, theme, True))
    return _save(f"trend-{format}-{gender}", graphics.trend_card(scoring_trend(format, gender), theme, True))


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
                                     headers={"X-API-Key": key, "Content-Type": "application/json", "User-Agent": "cricsynthesis-mcp/0.2"})
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
