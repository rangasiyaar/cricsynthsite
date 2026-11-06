"""Auto fixtures, playing XIs and scorecards from match pages (shapes as Khel Now serves them)."""
import json
from datetime import datetime, timezone

from cricsim import auto
from cricsim import khelnow as kn

from .khelnow_pages import IND, IND_ID, NZ, NZ_ID, START, URL, innings, names, page, sitemap

NAME = "nz-v-ind-t20i-auckland-2026-10-30.json"
# each side's last finished match (squads only show on a match page once it's on)
PREV_NZ = "https://khelnow.com/live-cricket-score/new-zealand-vs-india-india-tour-of-new-zealand-27th-october-2026-at-7-00-am-40090"
DAY_BEFORE = datetime(2026, 10, 29, 10, 0, tzinfo=timezone.utc)
TOSS = datetime(2026, 10, 30, 6, 30, tzinfo=timezone.utc)


def _info(**kw):
    i = kn.info(kn.data_of(page(**kw)))
    i["url"] = URL
    return i


def _pages(**kw):
    prev = page(status=2, named=True, match_id=40090, start=START - 3 * 86400)
    return {kn.SITEMAP: sitemap(PREV_NZ, URL), PREV_NZ: prev, URL: page(**kw)}


def _done():
    a, ca = innings(1, NZ_ID, IND_ID, [(0, 0, 4, ""), (0, 0, 0, "W:bowled"), (0, 0, 1, "")])
    b, cb = innings(2, IND_ID, NZ_ID, [(0, 7, 6, "")], target=6)
    return [(names(a, NZ, IND, NZ_ID, IND_ID), ca), (names(b, IND, NZ, IND_ID, NZ_ID), cb)]


def test_wanted_and_ids():
    cfg = {**json.loads(auto.CONFIG.read_text()), "all": False, "exclude": ["Sixes", "Legends"]}
    i = _info()
    assert auto.wanted(i, cfg) == "T20" and auto.fixture_id(i, "T20") == "nz-v-ind-t20i-auckland-2026-10-30"
    assert auto.wanted(_info(fmt="First Class"), cfg) is None
    league = _info(competition="Nepal Premier League", category="domestic", fmt="T20")
    assert auto.wanted(league, cfg) == "T20" and auto.fixture_id(league, "T20").split("-")[3] == "t20"
    assert auto.wanted(_info(competition="CSA Pro T20 Cup", category="domestic", fmt="T20"), cfg) is None
    assert auto.wanted(_info(competition="Hong Kong Sixes", category="domestic", fmt="T20"), cfg) is None
    every = json.loads(auto.CONFIG.read_text())                  # the live config: everything but the Sixes
    assert auto.wanted(_info(competition="CSA Pro T20 Cup", category="domestic", fmt="T20"), every) == "T20"
    assert auto.wanted(_info(competition="The Ford Trophy", category="domestic", fmt="List A"), every) == "OD"
    assert auto.wanted(_info(competition="Ranji Trophy Elite", category="domestic", fmt="First Class"), every) is None


def test_run_end_to_end(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    pages = _pages()
    assert auto.run(fixtures, results, now=DAY_BEFORE, page=pages.get) == [NAME]
    fx = json.loads((fixtures / NAME).read_text())
    nz, ind = fx["teams"]
    assert (fx["date"], fx["start_time"], fx["format"], fx["gender"]) == ("2026-10-30", "12:30", "T20", "male")
    assert fx["competition"] == "India tour of New Zealand · 4th T20I" and fx["comp_key"] == "intl-international-T20"
    assert nz["players"] == [n for n, *_ in NZ[:11]] and nz["roles"][0] == "WK" and nz["captain"] == "Mitchell Santner"
    assert fx["live"] == {"kn": 40100, "url": URL, "auto": True, "xis": False} and "Probable" in fx["note"]
    assert auto.run(fixtures, results, now=DAY_BEFORE, page=pages.get) == []          # already there
    # at the toss: the page names the XIs, India won it and bowl
    pages[URL] = page(named=True, toss=(IND_ID, "field"))
    assert auto.run(fixtures, results, now=TOSS, page=pages.get) == [NAME]
    fx = json.loads((fixtures / NAME).read_text())
    assert fx["batting_first"] == 0 and fx["live"]["xis"] and fx["teams"][1]["captain"] == "Shreyas Iyer"
    assert fx["note"] == "Playing XIs confirmed. India won the toss and bowl first."
    assert auto.run(fixtures, results, now=TOSS, page=pages.get) == []                # nothing new
    # after the match: the scorecard
    pages[URL] = page(status=2, inns=_done(), result="IND won by 10 wickets", winner=IND_ID, margin="10 wickets")
    auto.run(fixtures, results, now=datetime(2026, 10, 30, 11, 0, tzinfo=timezone.utc), page=pages.get)
    card = json.loads((results / NAME).read_text())
    assert card["winner"] == "India" and card["result"] == "India won by 10 wickets" and card["id"] == NAME[:-5]


def test_page_facts_are_cached_between_passes(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    pages, asked = _pages(), []
    get = lambda u: asked.append(u) or pages.get(u)                                    # noqa: E731
    auto.run(fixtures, results, now=DAY_BEFORE, page=get, cache=tmp_path / "index.json")
    asked.clear()
    (fixtures / NAME).unlink()
    auto.run(fixtures, results, now=DAY_BEFORE, page=get, cache=tmp_path / "index.json")
    assert asked.count(URL) == 1                     # read again only to build the fixture, not for its facts


def test_xis_late_and_after_the_start(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    pages = _pages()
    auto.run(fixtures, results, now=DAY_BEFORE, page=pages.get)
    pages[URL] = page(status=3, named=True, toss=(IND_ID, "field"))
    mid_match = datetime(2026, 10, 30, 8, 30, tzinfo=timezone.utc)                     # 1.5 hours after the start
    assert auto.run(fixtures, results, now=mid_match, page=pages.get) == [NAME]
    (fixtures / NAME).write_text(json.dumps({**json.loads((fixtures / NAME).read_text()), "live": {"url": URL}}))
    later = datetime(2026, 10, 30, 10, 30, tzinfo=timezone.utc)                        # T20 over: outside the window
    assert auto.run(fixtures, results, now=later, page=pages.get) == []
    assert auto.run(fixtures, results, now=later, page=pages.get, late={NAME}) == [NAME]


def test_hand_written_fixture_is_linked_and_page_xis_replace_mine(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    mine = {"id": "nz-v-ind-t20i-auckland-2026-10-30", "date": "2026-10-30", "start_time": "12:30", "format": "T20",
            "note": "Playing XIs confirmed.", "live": {"id": 161223},             # an older page id: relinked
            "teams": [{"name": "New Zealand", "short": "NZ", "players": ["x"] * 11},
                      {"name": "India", "short": "IND", "players": ["y"] * 11}]}
    (fixtures / "mine.json").write_text(json.dumps(mine))
    pages = _pages(named=True, toss=(IND_ID, "field"))
    assert auto.run(fixtures, results, now=TOSS, page=pages.get) == ["mine.json"]
    got = json.loads((fixtures / "mine.json").read_text())
    assert got["live"]["kn"] == 40100 and got["live"]["xis"] is True                      # linked, then the page's
    assert got["teams"][1]["players"] == [n for n, *_ in IND[:11]]                        # named XIs replace mine
    assert len(list(fixtures.glob("*.json"))) == 1
    # XIs entered by hand: identical ones only drop the flag
    got["live"]["manual"] = True
    assert not auto.confirm_xis(got, kn.data_of(pages[URL]))
    assert "manual" not in got["live"]


def test_our_own_last_fixture_gives_the_xi_when_nothing_else_does(tmp_path):
    fixtures, results = tmp_path / "fixtures", tmp_path / "results"
    fixtures.mkdir()
    results.mkdir()
    sides = [{"name": "New Zealand", "players": [n for n, *_ in NZ[:11]], "roles": ["WK"] + ["BAT"] * 4 + ["AR"] * 3 + ["BOWL"] * 3},
             {"name": "India", "players": [n for n, *_ in IND[:11]], "roles": ["BAT"] * 4 + ["WK"] + ["AR"] * 3 + ["BOWL"] * 3}]
    (fixtures / "old.json").write_text(json.dumps({"id": "old", "date": "2026-10-20", "format": "T20", "teams": sides}))
    pages = {kn.SITEMAP: sitemap(URL), URL: page()}                                     # no earlier match page
    [name] = auto.run(fixtures, results, now=DAY_BEFORE, page=pages.get)
    fx = json.loads((fixtures / name).read_text())
    assert set(fx["teams"][0]["players"]) == set(sides[0]["players"]) and fx["teams"][0]["roles"].count("WK") == 1
    assert not fx["live"]["xis"]


def test_no_xi_to_go_on_waits():
    fixtures_pages = {kn.SITEMAP: sitemap(URL), URL: page()}
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as t:
        f, r = Path(t) / "f", Path(t) / "r"
        f.mkdir()
        r.mkdir()
        assert auto.run(f, r, now=DAY_BEFORE, page=fixtures_pages.get) == [] and not list(f.glob("*.json"))


def test_short_page_names_take_the_squad_name():
    assert auto._full("Smit", ["JJ Smit", "Gerhard Erasmus"]) == "JJ Smit"
    assert auto._full("Smit", ["JJ Smit", "Ruan Smit"]) == "Smit"                     # two fit: left as is
    assert auto._full("Gerhard Erasmus", ["Gerhard Erasmus"]) == "Gerhard Erasmus"


def test_xis_confirmed_flag():
    from cricsim.publish import xis_confirmed
    assert xis_confirmed({"live": {"xis": True}})
    assert xis_confirmed({"note": "Playing XIs confirmed. India won the toss and bowl first."})
    assert not xis_confirmed({"live": {"xis": False}, "note": "Probable XIs from the last matches; updated when the teams are named."})
