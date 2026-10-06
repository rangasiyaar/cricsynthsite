import json
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "cricsim" / "tests"))

from synthetic_world import pick_xi, write_world  # noqa: E402

from cricdata.build import build  # noqa: E402
from cricsim.engine.fit import FitConfig, fit  # noqa: E402
from cricsim.publish import publish_all  # noqa: E402


@pytest.fixture(scope="session")
def env(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("api")
    world, zp, ap = write_world(tmp)
    parquet = tmp / "parquet"
    build(zp, parquet)
    (parquet / "attributes").mkdir()
    pq.write_table(pa.Table.from_pylist(json.loads(ap.read_text())), parquet / "attributes" / "attributes.parquet")
    model = fit(parquet, FitConfig(passes=2))
    model.save(tmp / "model")
    cov = tmp / "coverage" / "matches"
    cov.mkdir(parents=True)
    teams = [{"name": n, "players": [p.pid for p in pick_xi(world["teams"][n])]} for n in ("Premier 0", "Premier 1")]
    (cov / "m1.json").write_text(json.dumps({"id": "m1", "title": "Premier 0 v Premier 1", "date": "2026-10-20",
                                             "format": "T20", "gender": "male", "venue_id": "premier-oval",
                                             "comp_key": "premier-league", "teams": teams}))
    publish_all(model, tmp / "coverage", tmp / "publish", n=1000)
    (tmp / "patterns").mkdir()
    (tmp / "patterns" / "report.json").write_text(json.dumps({"summary": {"balls": 1}, "patterns": []}))
    return {"tmp": tmp, "world": world, "teams": teams}
