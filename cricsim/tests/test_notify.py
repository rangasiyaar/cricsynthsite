"""Match alerts: new forecasts and named XIs are announced; refits, started matches and first runs are not."""
from datetime import datetime, timezone

from cricsim.notify import MAX_ALERTS, fcm_message, plan

NOW = datetime(2026, 10, 23, 6, 0, tzinfo=timezone.utc)       # 11:30 IST


def card(i, date="2026-10-24", gen="g1", time="14:00"):
    return {"id": i, "date": date, "start_time": time, "published": True, "generated_at": gen,
            "teams": [{"name": "India Women", "short": "INDW"}, {"name": "Zimbabwe Women", "short": "ZIMW"}],
            "win": {"India Women": 0.78, "Zimbabwe Women": 0.22}}


def doc(xi):
    return {"match": {"teams": [{"players": xi}, {"players": ["z1", "z2"]}]}}


def test_new_match_is_announced_with_its_favourite_and_start():
    alerts = plan({"matches": [card("a")]}, {"matches": []}, lambda i: None, lambda i: None, NOW)
    assert [a["topic"] for a in alerts] == ["forecasts"]
    assert alerts[0]["title"] == "New forecast: INDW v ZIMW"
    assert alerts[0]["body"] == "India Women 78% to win · 24 Oct, 2:00 PM IST"
    assert alerts[0]["path"] == "/m/match/?id=a"


def test_refit_without_new_xis_is_silent_and_named_xis_are_announced():
    old = {"matches": [card("a", gen="g1"), card("b", gen="g1")]}
    new = {"matches": [card("a", gen="g2"), card("b", gen="g2")]}
    olds = {"a": doc(["p1", "p2"]), "b": doc(["p1", "p2"])}
    news = {"a": doc(["p1", "p2"]), "b": doc(["p1", "p3"])}
    alerts = plan(new, old, news.get, olds.get, NOW)
    assert [(a["topic"], a["match"]) for a in alerts] == [("xis", "b")]


def test_started_matches_unchanged_ones_and_first_publish_are_skipped():
    started = card("s", date="2026-10-23", time="10:00")            # 10:00 IST, before NOW
    assert plan({"matches": [started]}, {"matches": []}, lambda i: None, lambda i: None, NOW) == []
    assert plan({"matches": [card("a")]}, {"matches": [card("a")]}, lambda i: None, lambda i: None, NOW) == []
    assert plan({"matches": [card("a")]}, None, lambda i: None, lambda i: None, NOW) == []


def test_alerts_are_capped_and_messages_carry_the_app_path():
    alerts = plan({"matches": [card(str(i)) for i in range(20)]}, {"matches": []}, lambda i: None, lambda i: None, NOW)
    assert len(alerts) == MAX_ALERTS
    m = fcm_message(alerts[0])["message"]
    assert m["topic"] == "forecasts" and m["data"]["path"].startswith("/m/match/?id=")
