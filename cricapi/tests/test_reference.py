"""The website's /docs page reads app/data-static/api-reference.json; keep it in step with the API."""
import json
from pathlib import Path

from cricapi.reference import build

REF = Path(__file__).resolve().parents[2] / "app" / "data-static" / "api-reference.json"


def test_reference_is_current():
    assert json.loads(REF.read_text()) == json.loads(json.dumps(build())), \
        "regenerate: uv run python -m cricapi.reference > app/data-static/api-reference.json"


def test_reference_hides_admin():
    assert not any(e["path"].startswith("/admin") for e in build()["endpoints"])
