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
