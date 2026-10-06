"""The browser Scenario Lab engine (app/lib/engine) must agree with the Python engine."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

from cricsim.engine.pack import engine_pack
from cricsim.engine.simulate import simulate
from cricsim.engine.spec import Scenario
from cricsim.engine.summary import summarize

from .test_engine import _spec, world  # noqa: F401  (module fixture)

APP = Path(__file__).resolve().parents[2] / "app"


@pytest.mark.skipif(shutil.which("node") is None or not (APP / "lib" / "engine" / "sim.ts").exists(),
                    reason="node / app not available")
@pytest.mark.parametrize("scenario", [{}, {"boundaryMult": 1.25, "dew": 0.6, "battingFirst": 0}])
def test_browser_engine_matches_python(world, tmp_path, scenario):  # noqa: F811
    m = world["model"]
    spec = _spec(world["world"])
    pack = tmp_path / "pack.json"
    pack.write_text(json.dumps(engine_pack(m, spec)))
    sc_file = tmp_path / "sc.json"
    sc_file.write_text(json.dumps(scenario))
    out = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", str(APP / "tests" / "parity_cli.ts"),
                          str(pack), str(sc_file)], capture_output=True, text=True, check=True, cwd=APP)
    js = json.loads(out.stdout)
    if scenario.get("battingFirst") is not None:
        spec.batting_first = scenario["battingFirst"]
    py_sc = Scenario(boundary_mult=scenario.get("boundaryMult", 1.0), dew=scenario.get("dew", 0.0))
    sims = simulate(m, spec, n=20000, seed=3, scenario=py_sc)
    first = np.concatenate([p.innings[0].runs for p in sims.parts])
    wk = np.concatenate([p.innings[0].wkts for p in sims.parts])
    legal = np.concatenate([p.innings[0].legal for p in sims.parts])
    s = summarize(sims, m)
    assert abs(js["first_runs"] - first.mean()) < 2.0, (js, first.mean())
    assert abs(js["first_wkts"] - wk.mean()) < 0.15
    assert abs(js["first_legal"] - legal.mean()) < 1.5
    assert abs(js["win0"] - s["result"]["win"][spec.teams[0].name]) < 0.025
    assert abs(js["pp_runs0"] - s["teams"][0]["batting"]["phases"][0]["runs"]["mean"]) < 1.5
