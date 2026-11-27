"""Match alerts: new forecasts and named XIs are announced; refits, started matches and first runs are not."""
from datetime import datetime, timezone

from cricsim.notify import MAX_ALERTS, fcm_message, plan

NOW = datetime(2026, 10, 23, 6, 0, tzinfo=timezone.utc)       # 11:30 IST


def card(i, date="2026-10-24", gen="g1", time="14:00", xis=True):
    return {"id": i, "date": date, "start_time": time, "published": True, "generated_at": gen, "xis": xis,
            "teams": [{"name": "India Women", "short": "INDW"}, {"name": "Zimbabwe Women", "short": "ZIMW"}],
            "win": {"India Women": 0.78, "Zimbabwe Women": 0.22}}


def doc(xi):
    return {"match": {"teams": [{"players": xi}, {"players": ["z1", "z2"]}]}}


def test_new_match_is_announced_with_its_favourite_and_start():
    alerts = plan({"matches": [card("a")]}, {"matches": []}, lambda i: None, lambda i: None, NOW)
    assert [a["topic"] for a in alerts] == ["forecasts"]
    assert alerts[0]["title"] == "New match added: INDW v ZIMW"
    assert alerts[0]["body"] == "India Women v Zimbabwe Women, 24 Oct, 2:00 PM. See who's favourite and the likely scores."
    assert alerts[0]["path"] == "/m/match/?id=a"


def test_refit_without_new_xis_is_silent_and_named_xis_are_announced():
    old = {"matches": [card("a", gen="g1"), card("b", gen="g1")]}
    new = {"matches": [card("a", gen="g2"), card("b", gen="g2")]}
    olds = {"a": doc(["p1", "p2"]), "b": doc(["p1", "p2"])}
    news = {"a": doc(["p1", "p2"]), "b": doc(["p1", "p3"])}
    alerts = plan(new, old, news.get, olds.get, NOW)
    assert [(a["topic"], a["match"]) for a in alerts] == [("xis", "b")]


def test_probable_xis_changing_is_not_announced():
    # a side's previous match finishes, its probable XI for the next match changes: the teams aren't named yet
    old = {"matches": [card("a", gen="g1", xis=False)]}
    new = {"matches": [card("a", gen="g2", xis=False)]}
    assert plan(new, old, {"a": doc(["p1", "p3"])}.get, {"a": doc(["p1", "p2"])}.get, NOW) == []
    # once confirmed, it is
    new = {"matches": [card("a", gen="g3", xis=True)]}
    assert [a["topic"] for a in plan(new, old, {"a": doc(["p1", "p4"])}.get, {"a": doc(["p1", "p3"])}.get, NOW)] == ["xis"]
    # confirmed with exactly the players we expected: still announced, once
    assert [a["topic"] for a in plan(new, old, {"a": doc(["p1", "p3"])}.get, {"a": doc(["p1", "p3"])}.get, NOW)] == ["xis"]
    assert plan(new, {"matches": [card("a", gen="g2", xis=True)]}, {"a": doc(["p1", "p3"])}.get, {"a": doc(["p1", "p3"])}.get, NOW) == []


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


def test_named_xis_carry_the_captain():
    old = {"matches": [card("b", gen="g1")]}
    new = {"matches": [card("b", gen="g2")]}
    d = {**doc(["p1", "p3"]), "fantasy": {"single": {"captain": "p3"}, "players": {"p3": {"name": "Smriti Mandhana"}}}}
    alerts = plan(new, old, {"b": d}.get, {"b": doc(["p1", "p2"])}.get, NOW)
    assert alerts[0]["title"] == "Playing XIs are out: INDW v ZIMW"
    assert alerts[0]["body"] == "See both line-ups and our updated forecast. Our captain pick: Smriti Mandhana."


def test_new_result_is_announced_with_what_we_had():
    res = {"id": "r", "result": "Zimbabwe Women won by 4 wickets", "winner": "Zimbabwe Women",
           "teams": [{"name": "India Women", "short": "INDW"}, {"name": "Zimbabwe Women", "short": "ZIMW"}]}
    alerts = plan({"matches": []}, {"matches": []}, lambda i: None, lambda i: None, NOW,
                  new_results={"matches": [res]}, old_results={"matches": []},
                  result_doc=lambda i: {"forecast": {"win": {"India Women": 0.78, "Zimbabwe Women": 0.22}}})
    assert [(a["topic"], a["title"], a["body"]) for a in alerts] == [
        ("results", "Result: INDW v ZIMW", "Zimbabwe Women won by 4 wickets · we had them 22%")]
    again = plan({"matches": []}, {"matches": []}, lambda i: None, lambda i: None, NOW,
                 new_results={"matches": [res]}, old_results={"matches": [res]})
    assert again == []


def test_timed_alerts_go_once():
    from cricsim.notify import record, timed
    soon = card("s", date="2026-10-23", time="12:00")                # 12:00 IST, 30 min after NOW (11:30 IST)
    later = card("l", date="2026-10-23", time="19:30")
    sent: dict = {}
    first = timed({"matches": [soon, later]}, sent, NOW)
    assert [(a["topic"], a["match"]) for a in first] == [("soon", "s")]   # no "today's matches" any more
    assert first[0]["title"] == "INDW v ZIMW starts in 30 minutes" and "fantasy team" in first[0]["body"]
    assert timed({"matches": [soon, later]}, sent, NOW) == first      # not delivered yet: still due
    record(sent, first, NOW)
    assert timed({"matches": [soon, later]}, sent, NOW) == []          # nothing twice


def test_busy_window_sends_the_seventh_match_next_pass():
    from cricsim.notify import record, timed
    cards = [card(f"m{i}", date="2026-10-23", time="12:00") for i in range(7)]
    sent: dict = {}
    first = timed({"matches": cards}, sent, NOW)
    assert len(first) == MAX_ALERTS
    record(sent, first, NOW)
    second = timed({"matches": cards}, sent, NOW)
    assert [a["match"] for a in second] == ["m6"]


def test_failed_sends_are_retried_and_not_recorded():
    from cricsim.notify import record, send, timed
    sent: dict = {}
    alerts = timed({"matches": [card("a", date="2026-10-23", time="12:00"), card("b", date="2026-10-23", time="12:00")]}, sent, NOW)
    calls: list[str] = []
    def post(a, project, token):                   # "a" fails for good (400); "b" fails once (503), then goes
        calls.append(a["match"])
        if a["match"] == "a":
            return False, False
        return calls.count("b") > 1, True
    delivered = send(alerts, "p", "t", post=post, pause=lambda s: None)
    assert [a["match"] for a in delivered] == ["b"] and calls == ["a", "b", "b"]
    record(sent, delivered, NOW)
    assert [a["match"] for a in timed({"matches": [card("a", date="2026-10-23", time="12:00")]}, sent, NOW)] == ["a"]


def test_update_reminders_three_times_a_day_to_older_builds_only():
    from cricsim.notify import fcm_message, record, update_reminders
    rel = [{"version": "0.3.21", "build": 140, "prerelease": False, "published": "2026-10-22T10:00:00Z"}] + [
        {"version": f"0.3.{i}", "build": 100 + 2 * i, "prerelease": False, "published": "2026-10-01T10:00:00Z"} for i in range(1, 8)]
    sent: dict = {}
    at10 = datetime(2026, 10, 23, 4, 40, tzinfo=timezone.utc)          # 10:10 IST
    r = update_reminders(rel, sent, at10)
    assert len(r) == 2 and r[0]["title"] == "Update CricSynthesis"
    assert r[0]["body"] == "Version 0.3.21 is ready, with fixes and improvements. Tap to update."
    assert r[0]["condition"] == "'build-114' in topics || 'build-112' in topics || 'build-110' in topics || 'build-108' in topics || 'build-106' in topics"
    assert "'build-140'" not in r[0]["condition"] + r[1]["condition"]
    assert "condition" in fcm_message(r[0])["message"] and "topic" not in fcm_message(r[0])["message"]
    record(sent, r[:1], at10)                                           # the second message failed: only it is due again
    assert [x["condition"] for x in update_reminders(rel, sent, at10)] == [r[1]["condition"]]
    record(sent, r[1:], at10)
    assert update_reminders(rel, sent, at10) == []                      # once per slot
    assert update_reminders(rel, sent, datetime(2026, 10, 23, 6, 0, tzinfo=timezone.utc)) == []      # 11:30 IST: between slots
    assert len(update_reminders(rel, sent, datetime(2026, 10, 23, 8, 35, tzinfo=timezone.utc))) == 2  # 14:05 IST
    assert len(update_reminders(rel, {}, datetime(2026, 10, 23, 13, 31, tzinfo=timezone.utc))) == 2   # 19:01 IST
    fresh = [{**rel[0], "published": "2026-10-23T04:30:00Z"}] + rel[1:]   # released 10 minutes ago: wait
    assert update_reminders(fresh, {}, at10) == []



def test_release_alert_is_short_and_names_the_version():
    from cricsim.notify import release_alert
    a = release_alert("0.3.4", 82)
    assert a["topic"] == "updates" and a["title"] == "Update CricSynthesis"
    assert a["body"] == "Version 0.3.4 is ready, with fixes and improvements. Tap to update." and a["match"] == "app-82"
