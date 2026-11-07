"""The hosted Worker (edge/, TypeScript) must answer exactly as the MCP server does: same analytics from the same kit,
and byte-identical SVG cards."""
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

from cricmcp import graphics, server
from cricmcp.data import DataError

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(__file__).resolve().parent / "fixtures"

P = server._p
K = server.kit


def _g(p, gender):
    return gender or p.get("gender") or "male"


# (name, args, python answer)
CALLS = [
    ("search_players", ["P0", 5], lambda: server.search_players("P0", 5)),
    ("search_players", ["p1-1", 10], lambda: server.search_players("p1-1", 10)),
    ("player_rating", ["P0-1", "T20"], lambda: server.player_rating("P0-1", "T20")),
    ("player_rating", ["P1-9", "OD"], lambda: server.player_rating("P1-9", "OD")),
    ("player_phases", ["P0-1", "T20", None], lambda: server.player_phases("P0-1", "T20")),
    ("player_phases", ["P1-9", "OD", "male"], lambda: server.player_phases("P1-9", "OD", "male")),
    ("player_vs_bowling", ["P0-2", "T20", "death", None], lambda: server.player_vs_bowling("P0-2", "T20", "death")),
    ("bowler_vs_batting_hand", ["P1-9", "T20", "powerplay", None], lambda: server.bowler_vs_batting_hand("P1-9", "T20", "powerplay")),
    ("player_situations", ["P0-1", "T20", None], lambda: server.player_situations("P0-1", "T20")),
    ("player_formats", ["P0-3", None], lambda: server.player_formats("P0-3")),
    ("player_role", ["P1-9", "T20"], lambda: server.player_role("P1-9", "T20")),
    ("player_role", ["P0-1", "OD"], lambda: server.player_role("P0-1", "OD")),
    ("similar_players", ["P0-1", "T20", "batting"], lambda: server.similar_players("P0-1", "T20", "batting")),
    ("similar_players", ["P1-9", "T20", "bowling"], lambda: server.similar_players("P1-9", "T20", "bowling")),
    ("compare_players", [["P0-1", "P1-1", "P1-9"], "T20", None], lambda: server.compare_players(["P0-1", "P1-1", "P1-9"], "T20")),
    ("rankings", ["batting", "T20", "male", "middle", "impact", 10], lambda: server.rankings("batting", "T20", "male", "middle", "impact", 10)),
    ("rankings", ["bowling", "T20", "male", "death", "economy", 10], lambda: server.rankings("bowling", "T20", "male", "death", "economy", 10)),
    ("rankings", ["batting", "OD", "male", "powerplay", "dot_pct", 7], lambda: server.rankings("batting", "OD", "male", "powerplay", "dot_pct", 7)),
    ("matchup", ["P0-1", "P1-9", "T20", "middle", None], lambda: server.matchup("P0-1", "P1-9", "T20", "middle")),
    ("matchup", ["P0-4", "P1-10", "OD", "death", None], lambda: server.matchup("P0-4", "P1-10", "OD", "death")),
    ("matchup_grid", [["P0-1", "P0-2"], ["P1-9", "P1-10"], "T20", "powerplay", None],
     lambda: server.matchup_grid(["P0-1", "P0-2"], ["P1-9", "P1-10"], "T20", "powerplay")),
    ("best_bowler_against", ["P0-1", ["P1-8", "P1-9", "P1-10"], "T20", "middle", None],
     lambda: server.best_bowler_against("P0-1", ["P1-8", "P1-9", "P1-10"], "T20", "middle")),
    ("venues", [None, 20], lambda: server.venues(None, 20)),
    ("venues", ["shield", 5], lambda: server.venues("shield", 5)),
    ("venue_profile", ["Premier", "T20", "male"], lambda: server.venue_profile("Premier", "T20", "male")),
    ("competitions", [None, 20], lambda: server.competitions(None, 20)),
    ("competition_profile", ["premier"], lambda: server.competition_profile("premier")),
    ("scoring_trend", ["T20", "male"], lambda: server.scoring_trend("T20", "male")),
    ("teams", [None, None, 20], lambda: server.teams(None, None, 20)),
    ("teams", ["shield", "male", 3], lambda: server.teams("shield", "male", 3)),
    ("team_profile", ["premier-1", None, "T20", None], lambda: server.team_profile("premier-1", None, "T20")),
    ("team_profile", [None, [f"P0-{i}" for i in range(11)], "T20", None],
     lambda: server.team_profile(None, [f"P0-{i}" for i in range(11)], "T20")),
    ("venue_profile", ["Nowhere At All", "T20", "male"], lambda: server.venue_profile("Nowhere At All")),
]


def _hosted(out):
    """The hosted server leaves out simulation counts and engine details."""
    return {k: v for k, v in out.items() if k not in ("simulations", "engine")}


# MCP tools through the hosted endpoint's own dispatcher (argument names as an AI assistant sends them)
TOOLS = [
    ("list_matches", {}, lambda: server.list_matches()),
    ("match_forecast", {"match": "Premier"}, lambda: _hosted(server.match_forecast("Premier"))),
    ("player_outlook", {"player": "P0-1"}, lambda: server.player_outlook("P0-1")),
    ("key_matchups", {"limit": 5}, lambda: server.key_matchups(None, 5)),
    ("innings_shape", {}, lambda: server.innings_shape()),
    ("about_the_model", {}, lambda: _hosted(server.about_the_model())),
    ("player_vs_bowling", {"player": "P0-2", "phase": "death"}, lambda: server.player_vs_bowling("P0-2", phase="death")),
    ("rankings", {"side": "bowling", "sort": "economy", "limit": 5}, lambda: server.rankings("bowling", sort="economy", limit=5)),
    ("team_profile", {"team": "shield"}, lambda: server.team_profile("shield")),
    ("best_bowler_against", {"batter": "P0-1", "candidates": ["P1-9", "P1-10"]},
     lambda: server.best_bowler_against("P0-1", ["P1-9", "P1-10"])),
    ("competition_profile", {"competition": "shield"}, lambda: server.competition_profile("shield")),
    ("player_outlook", {"player": "Nobody"}, lambda: server.player_outlook("Nobody")),
]


def _doc():
    return json.loads((DATA / "matches" / "m1.json").read_text())


def _team_pid(k):
    return _doc()["summary"]["teams"][k]["players"][0]["id"]


CARDS = [
    ("card", ["m1", "win", None, "dark", False], lambda: graphics.win_card(_doc(), "dark", False)),
    ("card", ["m1", "scores", None, "light", True], lambda: graphics.scores_card(_doc(), "light", True)),
    ("card", ["m1", "worm", None, "dark", False], lambda: graphics.worm_card(_doc(), "dark", False)),
    ("card", ["m1", "phases", None, "dark", True], lambda: graphics.phases_card(_doc(), "dark", True)),
    ("card", ["m1", "duels", None, "light", False], lambda: graphics.duels_card(_doc(), "light", False)),
    ("card", ["m1", "wickets", 0, "dark", False], lambda: graphics.wickets_card(_doc(), 0, "dark", False)),
    ("card", ["m1", "wickets", 1, "light", True], lambda: graphics.wickets_card(_doc(), 1, "light", True)),
    ("card", ["m1", "player", "@0", "dark", False], lambda: graphics.player_card(_doc(), _team_pid(0), "dark", False)),
    ("profile_card", ["P0-1", "T20", "dark", False],
     lambda: graphics.player_profile_card(K().phase_profile(P("P0-1"), "T20", _g(P("P0-1"), None)), "dark", False)),
    ("matchup_card", ["P0-1", "P1-9", "T20", "death", "light", True],
     lambda: graphics.matchup_card(server.matchup("P0-1", "P1-9", "T20", "death"), "light", True)),
    ("venue_card", ["Premier", "T20", "male", "dark", False],
     lambda: graphics.venue_card(server.venue_profile("Premier", "T20", "male"), "dark", False)),
    ("trend_card", ["T20", "male", "light", False], lambda: graphics.trend_card(server.scoring_trend("T20", "male"), "light", False)),
]


def _python(fn):
    try:
        return {"ok": json.loads(json.dumps(fn()))}
    except DataError as e:
        return {"error": str(e)}


def _close(a, b, path="$"):
    """Equal, allowing the last shown digit of a rounded number to differ (exp() may differ in its last bit)."""
    if isinstance(a, dict) and isinstance(b, dict):
        assert list(a) == list(b), f"{path}: keys {list(a)} != {list(b)}"
        for k in a:
            _close(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list) and isinstance(b, list):
        assert len(a) == len(b), f"{path}: length {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            _close(x, y, f"{path}[{i}]")
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        digits = max(len(repr(float(v)).split(".")[1]) if "." in repr(float(v)) else 0 for v in (a, b))
        assert math.isclose(a, b, rel_tol=1e-12, abs_tol=1.0001 * 10 ** -digits), f"{path}: {a} != {b}"
    else:
        assert a == b, f"{path}: {a!r} != {b!r}"


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_worker_matches_mcp(tmp_path):
    calls = CALLS + CARDS + [("mcp", [name, args], py) for name, args, py in TOOLS]
    pid0 = _team_pid(0)
    spec = [{"fn": fn, "args": [pid0 if a == "@0" else a for a in args]} for fn, args, _ in calls]
    f = tmp_path / "calls.json"
    f.write_text(json.dumps(spec))
    out = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(ROOT / "edge/tests/dump.ts"), str(f),
                          str(DATA)], capture_output=True, text=True, timeout=120)
    assert out.returncode == 0, out.stderr
    got = json.loads(out.stdout)
    for (fn, args, py), ts in zip(calls, got):
        want = _python(py)
        if "error" in want:
            assert "error" in ts, f"{fn}{args}: Python failed ({want['error']}), the Worker answered"
            continue
        assert "ok" in ts, f"{fn}{args}: {ts.get('error')}"
        if isinstance(want["ok"], str):
            assert ts["ok"] == want["ok"], f"{fn}{args}: SVG differs"
        else:
            _close(ts["ok"], want["ok"], f"{fn}{args}")
