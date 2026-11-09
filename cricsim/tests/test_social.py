import json
from datetime import datetime, timedelta
from pathlib import Path

from cricsim.notify import IST

from cricsim.social import caption, carousel_data, due, league

DATA = Path(__file__).resolve().parents[2] / "app" / "public" / "data"


def card(home, away, comp="Some Cup · 1st Match", start="2026-11-10T19:30", **kw):
    d, t = start.split("T")
    return {"id": f"{home}-{away}".lower().replace(" ", "-"), "competition": comp, "date": d, "start_time": t,
            "teams": [{"name": home, "short": home[:3].upper()}, {"name": away, "short": away[:3].upper()}],
            "published": True, **kw}


def test_league():
    assert league(card("Sydney Sixers Women", "Sydney Thunder Women", "Women's Big Bash League · 15th Match")) == "wbbl"
    assert league(card("Pokhara Avengers", "Karnali Yaks", "Nepal Premier League · 19th Match")) == "npl"
    assert league(card("India", "New Zealand", "India tour of New Zealand · 2nd T20I")) == "intl"
    assert league(card("India Women", "Ireland Women")) == "intl"
    assert league(card("Zimbabwe", "Afghanistan")) == "intl"
    # not national sides, not Test nations, or a league we don't post
    assert league(card("West Indies A", "England Lions")) is None
    assert league(card("India Under-19s", "Pakistan Under-19s", "ACC Men's U19 Asia Cup · Group A")) is None
    assert league(card("Namibia Women", "Rwanda Women")) is None
    assert league(card("India", "India Women")) is None
    assert league(card("Titans", "Dolphins", "CSA Pro T20 Cup · Super 8")) is None
    assert league(card("Nepal Under-19s", "UAE Under-19s", "ACC Men's U19 Asia Cup")) is None


def test_due_two_hours_before():
    c = card("India", "Australia", start="2026-11-10T19:30")        # 14:00 UTC
    start = datetime(2026, 11, 10, 19, 30, tzinfo=IST)
    idx = {"matches": [c]}
    at = start - timedelta(hours=2)
    assert due(idx, {}, at - timedelta(minutes=10)) == []           # too early
    assert [x[1] for x in due(idx, {}, at - timedelta(minutes=4))] == [at]   # prepare a few minutes early
    assert due(idx, {}, at + timedelta(minutes=10))                  # loop running late: still post
    assert due(idx, {}, at + timedelta(minutes=40)) == []           # too late: skip
    assert due(idx, {c["id"]: {"at": "x"}}, at) == []               # posted already
    assert due({"matches": [{**c, "status": "started"}]}, {}, at) == []
    assert due({"matches": [card("Titans", "Dolphins", start="2026-11-10T19:30")]}, {}, at) == []


def test_carousel_data_and_caption():
    mid = "mlrw-v-adsw-t20-melbourne-2026-11-07"
    doc = json.loads((DATA / "matches" / f"{mid}.json").read_text())
    venue = json.loads((DATA / "venue" / f"{mid}.json").read_text())
    d = carousel_data(doc, venue)
    assert [t["short"] for t in d["teams"]] == ["MLRW", "ADSW"]
    assert len(d["teams"][0]["runs"]) == d["overs"] == 20
    assert all(not n.startswith("kn:") for duel in d["duels"] for n in duel[:2])   # unnamed players skipped
    assert d["fantasy"]["c"] and len(d["fantasy"]["must"]) == 3
    text = caption(d, "wbbl")
    assert "MLRW 46% · ADSW 54%" in text and "#WBBL" in text and len(text) < 2200
    for word in ("bet", "odds", "tips", "sure win"):
        assert word not in text.lower()
