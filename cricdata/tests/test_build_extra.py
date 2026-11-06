"""Extra zips (recent matches Cricsheet hasn't added yet): their unregistered players get names in the players table."""
import json
import zipfile

import pyarrow.parquet as pq

from cricdata.build import build_players, extra_people


def test_extra_players_get_names(tmp_path):
    z = tmp_path / "extra.zip"
    with zipfile.ZipFile(z, "w") as zf:
        zf.writestr("kn1.json", json.dumps({"info": {"registry": {"people": {"A Known": "abc12345", "B New": "kn:99"}}}}))
    assert extra_people([z]) == {"kn:99": "B New"}
    people = tmp_path / "people.csv"
    people.write_text("identifier,name,unique_name,key_cricinfo,key_cricbuzz,key_bcci\nabc12345,A Known,A Known,,,\n")
    build_players(people, None, tmp_path / "out", extra_people([z]))
    rows = {r["player_id"]: r["name"] for r in pq.read_table(next((tmp_path / "out" / "players").glob("*.parquet"))).to_pylist()}
    assert rows == {"abc12345": "A Known", "kn:99": "B New"}
