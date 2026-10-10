"""The MCP's pure-Python analytics must match cricsim.engine.insight on the same model (via the published kit)."""
import json
import math
import sys
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("cricsim")

from cricsim import kit                                    # noqa: E402
from cricsim.engine import insight as I                    # noqa: E402
from cricsim.engine.model import Model                     # noqa: E402
from cricmcp.insight import Kit                            # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cricsim" / "tests"))


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    import pyarrow as pa
    import pyarrow.parquet as pq
    from cricdata.build import build
    from cricsim.engine.fit import FitConfig, fit
    from synthetic_world import pick_xi, write_world
    tmp = tmp_path_factory.mktemp("kit")
    w, zp, ap = write_world(tmp)
    out = tmp / "parquet"
    build(zp, out)
    (out / "attributes").mkdir()
    pq.write_table(pa.Table.from_pylist(json.loads(ap.read_text())), out / "attributes" / "attributes.parquet")
    fit(out, FitConfig()).save(tmp / "model")
    model = Model.load(tmp / "model")
    kit.export(model, tmp / "pub")
    root = tmp / "pub" / "analytics"
    load = lambda pid: json.loads((root / "players" / f"{kit.safe_id(pid)}.json").read_text())  # noqa: E731
    k = Kit(json.loads((root / "context.json").read_text()), load)
    xi = [p.pid for p in pick_xi(w["teams"]["Premier 0"])]
    opp = [p.pid for p in pick_xi(w["teams"]["Premier 1"])]
    return {"model": model, "kit": k, "load": load, "root": root, "xi": xi, "opp": opp}


def close(a, b, path="$"):
    """Equal up to the rounding of published factors (4 decimals) showing in the last printed digit."""
    if isinstance(a, dict):
        assert set(a) == set(b), path
        for key in a:
            close(a[key], b[key], f"{path}.{key}")
    elif isinstance(a, list):
        assert len(a) == len(b), path
        for i, (x, y) in enumerate(zip(a, b)):
            close(x, y, f"{path}[{i}]")
    elif isinstance(a, float) or isinstance(b, float):
        assert a is not None and b is not None, path
        assert math.isclose(a, b, rel_tol=3e-3, abs_tol=0.11), f"{path}: {a} v {b}"
    else:
        assert a == b, f"{path}: {a!r} v {b!r}"


def jsonable(x):
    return json.loads(json.dumps(x, default=float))


def strip_gender(d):
    """insight.who carries gender; compare everything else."""
    if isinstance(d, dict):
        return {k: strip_gender(v) for k, v in d.items() if k != "gender"}
    if isinstance(d, list):
        return [strip_gender(v) for v in d]
    return d


@pytest.mark.parametrize("fmt", ["T20", "OD"])
def test_player_readouts(world, fmt):
    m, k, load = world["model"], world["kit"], world["load"]
    for pid in world["xi"][:4] + world["xi"][-3:]:
        p = load(pid)
        for name, a, b in [
            ("phase", I.phase_profile(m, pid, fmt), k.phase_profile(p, fmt)),
            ("vs_bowling", I.vs_bowling(m, pid, fmt), k.vs_bowling(p, fmt)),
            ("vs_hand", I.vs_batting_hand(m, pid, fmt), k.vs_batting_hand(p, fmt)),
            ("situations", I.situations(m, pid, fmt), k.situations(p, fmt)),
            ("role", I.role(m, pid, fmt), k.role(p, fmt)),
        ]:
            close(strip_gender(jsonable(a)), strip_gender(b), name)
    close(strip_gender(jsonable(I.format_split(m, world["xi"][0]))), strip_gender(k.format_split(load(world["xi"][0]))))


def test_compare_matchups_team(world):
    m, k, load = world["model"], world["kit"], world["load"]
    xi, opp = world["xi"], world["opp"]
    close(strip_gender(jsonable(I.compare(m, xi[:3]))), strip_gender(k.compare([load(p) for p in xi[:3]])))
    close(strip_gender(jsonable(I.matchup_grid(m, xi[:3], opp[-3:]))),
          strip_gender(k.matchup_grid([load(p) for p in xi[:3]], [load(p) for p in opp[-3:]])))
    close(strip_gender(jsonable(I.counter(m, xi[0], opp[-5:]))),
          strip_gender(k.counter(load(xi[0]), [load(p) for p in opp[-5:]])))
    close(strip_gender(jsonable(I.team_profile(m, xi))), strip_gender(k.team_profile([load(p) for p in xi])))


def test_similar_is_precomputed(world):
    m, load = world["model"], world["load"]
    pid = next(p for p in world["xi"] if load(p)["similar"].get("T20", {}).get("batting"))
    want = I.similar(m, pid, "T20", side="batting")["similar"]
    got = load(pid)["similar"]["T20"]["batting"]
    assert [r["id"] for r in want] == [g[0] for g in got]
