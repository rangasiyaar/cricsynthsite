"""Reading Khel Now match pages: facts, squads, toss, the live state, our scorecard and Cricsheet's format."""
import json
import zipfile

from cricdata.parse import parse_match
from cricsim import khelnow as kn
from cricsim.results import Roster
from .khelnow_pages import IND, IND_ID, NZ, NZ_ID, URL, innings, names, page, pid, sitemap

# NZ bat first: a four, a wide and a single by Seifert, Allen caught first ball, three dots by Mitchell (over), a leg-bye
NZ_BALLS = [(0, 0, 4, ""), (0, 0, 1, "wd"), (0, 0, 1, ""), (1, 0, 0, "W:caught"), (0, 0, 0, ""), (0, 0, 0, ""),
            (0, 0, 0, ""), (0, 1, 1, "lb")]
IND_BALLS = [(0, 7, 6, ""), (0, 7, 0, "W:bowled"), (0, 7, 2, "")]


def _inns(second: bool = True):
    a, ca = innings(1, NZ_ID, IND_ID, NZ_BALLS)
    out = [(names(a, NZ, IND, NZ_ID, IND_ID), ca)]
    if second:
        b, cb = innings(2, IND_ID, NZ_ID, IND_BALLS, target=a["equations"]["runs"] + 1)
        out.append((names(b, IND, NZ, IND_ID, NZ_ID), cb))
    return out


def _doc():
    ids = [[f"n{k}" for k in range(11)], [f"i{k}" for k in range(11)]]
    return {"summary": {"teams": [{"players": [{"id": p, "name": n} for p, (n, *_) in zip(ids[0], NZ)]},
                                  {"players": [{"id": p, "name": n} for p, (n, *_) in zip(ids[1], IND)]}]},
            "match": {"teams": [{"name": "New Zealand", "players": ids[0]}, {"name": "India", "players": ids[1]}]}}


def test_sitemap_and_facts():
    sm = kn.sitemap(sitemap(URL, "https://khelnow.com/live-cricket-score/x-women's-big-bash-league-5th-november-2026-40311",
                            "https://khelnow.com/cricket/news/x"))
    assert [e["id"] for e in sm] == [40100, 40311] and sm[1]["url"].endswith("women's-big-bash-league-5th-november-2026-40311")
    assert sm[0]["date"].isoformat() == "2026-10-30"
    i = kn.info(kn.data_of(page()))
    assert (i["id"], i["format"], i["international"], i["gender"], i["status"]) == (40100, "T20", True, "male", kn.SCHEDULED)
    assert i["teams"][1] == {"id": IND_ID, "name": "India", "short": "IND", "scores": ""}
    assert i["start"].isoformat() == "2026-10-30T07:00:00+00:00" and i["city"] == "Auckland"
    assert kn.info(kn.data_of(page(fmt="First Class")))["format"] is None
    assert kn.info(kn.data_of(page(fmt="List A", category="domestic")))["format"] == "OD"
    assert kn.data_of("<html>no data</html>") == {}


def test_squads_and_toss():
    d = kn.data_of(page())
    assert kn.squads(d) == {} and kn.toss(d) is None                         # nothing before the match is on
    d = kn.data_of(page(named=True, toss=(IND_ID, "field")))
    sq = kn.squads(d)
    nz = sq[NZ_ID]
    assert len(nz["xi"]) == 11 and len(nz["squad"]) == 13
    assert nz["xi"][0]["keeper"] and nz["xi"][0]["role"] == "wk-batter"
    assert [p["name"] for p in nz["squad"] if p["captain"]] == ["Mitchell Santner"]
    assert [p["name"] for p in nz["squad"] if p["keeper"]] == ["Tim Seifert"]           # Conway (also "wk") bats
    assert next(p for p in nz["squad"] if p["name"] == "Devon Conway")["role"] == "batter"
    assert kn.toss(d) == (IND_ID, "field")
    people = kn.people(d)
    assert people[pid(NZ_ID, 0)]["name"] == "Tim Seifert" and people[pid(NZ_ID, 0)]["born"]


def test_live_state():
    roster = Roster(_doc(), None)
    first = kn.live_state(kn.data_of(page(status=3, inns=_inns(False), live_inning=1)), roster, "T20")
    assert (first["innings"], first["batting"], first["runs"], first["wickets"], first["balls"]) == (1, 0, 7, 1, 7)
    assert first["state"] == "In Progress" and first["out"] == ["n1"]
    # Seifert took the leg-bye after the over changed ends: Daryl Mitchell (in at 3) faces next
    assert first["striker"] == "n2" and first["nonStriker"] == "n0"
    chase = kn.live_state(kn.data_of(page(status=3, inns=_inns(), live_inning=2)), roster, "T20")
    assert (chase["innings"], chase["batting"], chase["battingFirst"], chase["firstInningsTotal"], chase["target"]) == \
        (2, 1, 0, 7, 8)
    assert (chase["runs"], chase["wickets"], chase["balls"]) == (8, 1, 3) and chase["out"] == ["i0"]
    pre = kn.live_state(kn.data_of(page(toss=(IND_ID, "field"))), roster, "T20")
    assert pre == {"state": "Toss", "status": ""}


def test_scorecard():
    fx = {"id": "nz-v-ind", "format": "T20", "teams": [{"name": "New Zealand", "short": "NZ"}, {"name": "India", "short": "IND"}]}
    assert kn.scorecard(fx, kn.data_of(page(status=3, inns=_inns(False)))) is None
    c = kn.scorecard(fx, kn.data_of(page(status=2, inns=_inns(), result="IND won by 9 wickets", winner=IND_ID,
                                         margin="9 wickets")))
    a, b = c["innings"]
    assert (a["team"], a["runs"], a["wickets"], a["overs"], b["team"]) == ("New Zealand", 7, 1, "1.1", "India")
    assert a["batting"][0] == {"name": "Tim Seifert", "dismissal": "not out", "runs": 5, "balls": 3, "fours": 0, "sixes": 0}
    assert a["batting"][1]["dismissal"] == "caught b 0"
    assert a["extras"] == {"b": 0, "lb": 1, "w": 1, "nb": 0, "p": 0} and a["powerplay_runs"] == 7
    assert a["fall_of_wickets"] == [{"wicket": 1, "batter": "Finn Allen", "score": 6, "over": "0.3"}]
    assert c["winner"] == "India" and c["result"] == "India won by 9 wickets"
    assert kn.scorecard(fx, kn.data_of(page(status=4, result="Match abandoned")))["abandoned"]


def test_cricsheet_format_parses():
    d = kn.data_of(page(status=2, inns=_inns(), result="IND won by 9 wickets", winner=IND_ID, margin="9 wickets",
                        toss=(IND_ID, "field")))
    cs = kn.to_cricsheet(d, {pid(NZ_ID, 0): "abc12345"})
    assert cs["info"]["registry"]["people"]["Tim Seifert"] == "abc12345"
    assert cs["info"]["registry"]["people"]["Finn Allen"] == f"kn:{pid(NZ_ID, 1)}"
    assert cs["info"]["outcome"] == {"winner": "India", "by": {"wickets": 9}} and cs["info"]["match_type"] == "IT20"
    assert cs["info"]["toss"] == {"winner": "India", "decision": "field"}
    first = cs["innings"][0]["overs"]
    assert first[0]["deliveries"][1]["extras"] == {"wides": 1}
    w = first[0]["deliveries"][3]["wickets"][0]
    assert w["player_out"] == "Finn Allen" and w["kind"] == "caught" and w["fielders"] == [{"name": "Nitish Kumar Reddy"}]
    rows = parse_match(cs, "kn40100")
    assert rows["matches"][0]["format"] == "T20" and len(rows["deliveries"]) == len(NZ_BALLS) + len(IND_BALLS)
    assert rows["innings"][0]["runs"] == 7 and rows["innings"][1]["target_runs"] == 8
    assert rows["deliveries"][0]["batter_id"] == "abc12345"
    # balls that don't add up to the scorecard: not rebuilt
    bad = kn.data_of(page(status=2, inns=_inns(), winner=IND_ID, margin="9 wickets"))
    bad["matchInsights"][-1]["score_card"]["innings"][0]["equations"]["runs"] = 99
    assert kn.to_cricsheet(bad) is None


def test_bridge(tmp_path):
    cs_zip = tmp_path / "all.zip"
    other = {"info": {"dates": ["2026-10-29"], "teams": ["Australia", "England"],
                      "players": {"New Zealand": ["T Seifert", "FH Allen"]},
                      "registry": {"people": {"T Seifert": "abc12345", "FH Allen": "def67890"}}}}
    with zipfile.ZipFile(cs_zip, "w") as zf:
        zf.writestr("1.json", json.dumps(other))
    done = page(status=2, inns=_inns(), result="IND won by 9 wickets", winner=IND_ID, margin="9 wickets")
    pages = {kn.SITEMAP: sitemap(URL), URL: done}
    from datetime import datetime, timezone
    stats = kn.bridge(cs_zip, tmp_path / "cache", tmp_path / "extra.zip", days=10, page=pages.__getitem__,
                      now=datetime(2026, 11, 2, tzinfo=timezone.utc))
    assert stats["written"] == 1 and stats["fetched"] == 1
    with zipfile.ZipFile(tmp_path / "extra.zip") as zf:
        cs = json.loads(zf.read("kn40100.json"))
    reg = cs["info"]["registry"]["people"]
    assert reg["Tim Seifert"] == "abc12345" and reg["Finn Allen"] == "def67890"      # linked by team and name
    assert json.loads((tmp_path / "cache" / "links.json").read_text())[pid(NZ_ID, 0)] == "abc12345"
    # the same match once Cricsheet has it: left out
    with zipfile.ZipFile(cs_zip, "a") as zf:
        zf.writestr("2.json", json.dumps({"info": {"dates": ["2026-10-30"], "teams": ["New Zealand", "India"]}}))
    stats = kn.bridge(cs_zip, tmp_path / "cache", tmp_path / "extra.zip", days=10, page=pages.__getitem__,
                      now=datetime(2026, 11, 2, tzinfo=timezone.utc))
    assert stats["written"] == 0 and stats["in_cricsheet"] == 1 and stats["fetched"] == 0     # read from the cache
