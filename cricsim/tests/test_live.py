"""Live loop: finding a fixture's match page, when to write, the Firestore encoding, one dry pass end to end."""
import json
from datetime import datetime, timezone

from cricsim import khelnow as kn
from cricsim import live

from .khelnow_pages import IND, IND_ID, NZ, NZ_ID, URL, innings, names, page, sitemap

FX = {"id": "nz-v-ind", "date": "2026-10-30", "start_time": "12:30", "format": "T20", "published": True,
      "teams": [{"name": "New Zealand", "short": "NZ", "players": [n for n, *_ in NZ[:11]]},
                {"name": "India", "short": "IND", "players": [n for n, *_ in IND[:11]]}]}


def _doc():
    ids = [[f"n{k}" for k in range(11)], [f"i{k}" for k in range(11)]]
    return {"summary": {"teams": [{"players": [{"id": p, "name": n} for p, (n, *_) in zip(ids[0], NZ)]},
                                  {"players": [{"id": p, "name": n} for p, (n, *_) in zip(ids[1], IND)]}]},
            "match": {"teams": [{"name": "New Zealand", "players": ids[0]}, {"name": "India", "players": ids[1]}]}}


def test_find_page():
    other = "https://khelnow.com/live-cricket-score/australia-vs-england-ashes-30th-october-2026-at-1-00-am-40101"
    later = "https://khelnow.com/live-cricket-score/new-zealand-vs-india-india-tour-of-new-zealand-2nd-november-2026-at-7-00-am-40102"
    entries = kn.sitemap(sitemap(other, URL, later))
    assert live.find_page(FX, entries) == URL
    assert live.find_page({**FX, "live": {"kn": 40102}}, entries) == later
    assert live.find_page({**FX, "live": {"url": "x"}}, []) == "x"
    npl = {"date": "2026-10-28", "start_time": "16:45", "teams": [{"name": "Pokhara Avengers"}, {"name": "Sudurpaschim Royals"}]}
    u = "https://khelnow.com/live-cricket-score/sudurpaschim-royals-vs-pokhara-avengers-nepal-premier-league-28th-october-2026-at-11-15-am-41300"
    assert live.find_page(npl, kn.sitemap(sitemap(u))) == u


def test_change_key_and_window():
    a = {"state": "In Progress", "innings": 1, "wickets": 2, "balls": 37}
    assert live.change_key(a, 6) == live.change_key({**a, "balls": 41}, 6)         # same over: no write
    assert live.change_key(a, 6) != live.change_key({**a, "balls": 42}, 6)         # over ended
    assert live.change_key(a, 6) != live.change_key({**a, "wickets": 3}, 6)        # wicket
    assert live.window(FX, datetime(2026, 10, 30, 6, 50, tzinfo=timezone.utc)) == "on"     # toss time
    assert live.window(FX, datetime(2026, 10, 30, 6, 30, tzinfo=timezone.utc)) == "soon"
    assert live.window(FX, datetime(2026, 10, 30, 18, 0, tzinfo=timezone.utc)) == "off"
    assert live.window({**FX, "format": "MULTIDAY"}, datetime(2026, 10, 30, 8, 0, tzinfo=timezone.utc)) == "off"


def test_firestore_values():
    v = live.value({"runs": 46, "out": ["s3"], "rr": 6.2, "on": True, "x": None})
    f = v["mapValue"]["fields"]
    assert f["runs"] == {"integerValue": "46"} and f["rr"] == {"doubleValue": 6.2} and f["on"] == {"booleanValue": True}
    assert f["out"] == {"arrayValue": {"values": [{"stringValue": "s3"}]}} and f["x"] == {"nullValue": None}


def test_run_once_dry(tmp_path, capsys, monkeypatch):
    (tmp_path / "nz-v-ind.json").write_text(json.dumps(FX))
    card, comm = innings(1, NZ_ID, IND_ID, [(0, 0, 4, ""), (0, 0, 1, ""), (0, 0, 0, "W:bowled")])
    pages = {kn.SITEMAP: sitemap(URL), URL: page(status=3, inns=[(names(card, NZ, IND, NZ_ID, IND_ID), comm)], live_inning=1)}

    class Now(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 10, 30, 7, 30, tzinfo=timezone.utc)
    monkeypatch.setattr(live, "datetime", Now)
    live.run(tmp_path, dry=True, once=True, max_minutes=1, fetch=lambda path: _doc(), page=pages.__getitem__)
    out = capsys.readouterr().out
    line = next(ln for ln in out.splitlines() if ln.startswith("nz-v-ind: {"))
    doc = json.loads(line.split(": ", 1)[1])
    assert doc["published"] is True and (doc["runs"], doc["wickets"], doc["balls"]) == (5, 1, 3) and doc["out"] == ["n1"]
    assert "khelnow" not in line
