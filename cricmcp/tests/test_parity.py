"""The Python engine must reproduce the browser engine exactly: same pack, same seed, same matches."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from cricmcp import sim

ROOT = Path(__file__).resolve().parents[2]
PACK = Path(__file__).resolve().parent / "fixtures" / "matches" / "m1.pack.json"
SCRIPT = """
import { readFileSync } from "node:fs";
import { simulateMatches } from "%s";
const pack = JSON.parse(readFileSync(%s, "utf8"));
const sc = JSON.parse(%s);
const sims = simulateMatches(pack, 40, sc, 11);
console.log(JSON.stringify(sims.map((m) => [m.battingFirst, m.winner, ...m.innings.map((i) => [i.runs, i.wkts, i.legal, ...i.batRuns])])));
"""
SCENARIOS = [{}, {"boundaryMult": 1.2, "dew": 0.6, "spinWicketMult": 1.3, "battingFirst": 1},
             {"start": {"innings": 2, "runs": 90, "wickets": 3, "balls": 66, "firstInningsTotal": 170}, "target": 171,
              "battingFirst": 0}]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("sc", SCENARIOS)
def test_matches_browser_engine(sc, tmp_path):
    js = tmp_path / "run.ts"
    js.write_text(SCRIPT % (ROOT / "app" / "lib" / "engine" / "sim.ts", json.dumps(str(PACK)), json.dumps(json.dumps(sc))))
    out = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(js)], capture_output=True, text=True,
                         check=True).stdout
    pack = json.loads(PACK.read_text())
    py = [[m.batting_first, m.winner, *([i.runs, i.wkts, i.legal, *i.bat_runs] for i in m.innings)]
          for m in sim.simulate_matches(pack, 40, sc, 11)]
    assert py == json.loads(out)


def test_rng_matches_mulberry32():
    r = sim.rng(1)
    assert [round(r(), 10) for _ in range(3)] == [0.6270739406, 0.0027357212, 0.52744704]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
@pytest.mark.parametrize("sc", SCENARIOS[:2] + [{"excludeBowlers": ["__none__"]}])
def test_overs_plan_matches_browser_engine(sc, tmp_path):
    """Packs that carry an overs plan (bowlOvers) take the plan path in both engines, draw for draw."""
    pack = json.loads(PACK.read_text())
    for b in pack["batting"]:
        tot = [sum(row) for row in b["bowlWeights"]]
        top = sorted(range(11), key=lambda j: -tot[j])
        b["bowlOvers"] = [0.0] * 11
        for k, j in enumerate(top[:6]):
            b["bowlOvers"][j] = [3.8, 3.6, 3.4, 3.2, 2.5, 1.0][k]
    path = tmp_path / "pack.json"
    path.write_text(json.dumps(pack))
    js = tmp_path / "run.ts"
    js.write_text(SCRIPT % (ROOT / "app" / "lib" / "engine" / "sim.ts", json.dumps(str(path)), json.dumps(json.dumps(sc))))
    out = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(js)], capture_output=True, text=True,
                         check=True).stdout
    py = [[m.batting_first, m.winner, *([i.runs, i.wkts, i.legal, *i.bat_runs] for i in m.innings)]
          for m in sim.simulate_matches(pack, 40, sc, 11)]
    assert py == json.loads(out)


def test_plan_overs_follows_usual_overs():
    r = sim.rng(5)
    exp = [3.9, 3.8, 3.6, 3.5, 3.0, 1.5, 0.5, 0, 0, 0, 0]
    plans = [sim.plan_overs(r, exp, [0] * 11, 20, 4) for _ in range(400)]
    assert all(sum(t) == 20 and max(t) <= 4 for t in plans)
    mean = [sum(t[j] for t in plans) / len(plans) for j in range(11)]
    assert mean[0] > 3.5 and mean[6] < 1.5 and mean[10] < 0.2


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_phase_terms_match_browser_engine(tmp_path):
    """Packs with player × stage-of-innings terms (batPhase / bowlPhase / overPhase) give the same matches."""
    import random
    g = random.Random(3)
    pack = json.loads(PACK.read_text())
    K = len(pack["outcomes"])
    for b in pack["batting"]:
        b["batPhase"] = [[[round(g.gauss(0, 0.3), 4) for _ in range(K)] for _ in range(3)] for _ in range(11)]
        b["bowlPhase"] = [[[round(g.gauss(0, 0.3), 4) for _ in range(K)] for _ in range(3)] for _ in range(11)]
    overs = pack["rules"]["overs"]
    pack["overPhase"] = [0 if o / overs < 0.3 else 1 if o / overs < 0.8 else 2 for o in range(overs)]
    path = tmp_path / "pack.json"
    path.write_text(json.dumps(pack))
    js = tmp_path / "run.ts"
    js.write_text(SCRIPT % (ROOT / "app" / "lib" / "engine" / "sim.ts", json.dumps(str(path)), json.dumps(json.dumps({}))))
    out = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(js)], capture_output=True, text=True,
                         check=True).stdout
    py = [[m.batting_first, m.winner, *([i.runs, i.wkts, i.legal, *i.bat_runs] for i in m.innings)]
          for m in sim.simulate_matches(pack, 40, {}, 11)]
    assert py == json.loads(out)
