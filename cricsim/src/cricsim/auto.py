"""Fixtures, playing XIs and scorecards from the public score pages, so matches publish and score themselves.

1. Fixtures: upcoming limited-overs matches in the competitions listed in auto.json become cricsim/fixtures/<id>.json
   (days_ahead before the start) with probable XIs: the side's last XI in our fixtures (same series) where it is
   still in the squad, else the squad picked by role.
2. Playing XIs: from 75 minutes before the start, once both XIs are named, the fixture gets them, the captains and
   who bats first, so the forecast is re-run on the real teams before it freezes at the start.
3. Scorecards: when a match is over, cricsim/results/<id>.json in our scorecard format (an existing card is never
   replaced), so the results page scores it.

python -m cricsim.auto --fixtures cricsim/fixtures --results cricsim/results [--changed FILE] [--dry-run]

Run by .github/workflows/auto.yml every 10 minutes, which commits what changed and asks for a quick publish.
Fixtures stay ours to edit: a hand-written fixture is linked (live.id) and gets the confirmed XIs, nothing else.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click

from cricsim import live
from cricsim.results import IST, kickoff

CONFIG = Path(__file__).with_name("auto.json")
SCHEDULE = f"{live.BASE}/cricket-schedule/upcoming-series/all"
FMT = {"T20": "T20", "ODI": "OD", "T10": "T10"}
ROLE = {"batter": "BAT", "batsman": "BAT", "wk-batter": "WK", "wk-batsman": "WK", "bowler": "BOWL",
        "batting allrounder": "AR", "bowling allrounder": "AR", "allrounder": "AR"}
QUOTA = (("WK", 1), ("BAT", 4), ("AR", 3), ("BOWL", 3))      # a probable XI from a squad, before top-up
XI_FROM = timedelta(minutes=75)                             # look for named XIs from this long before the start
RESULT_AFTER = {"T20": 3.0, "T10": 1.5, "HUNDRED": 2.5, "OD": 7.0}


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _ist(ms: float) -> datetime:
    return datetime.fromtimestamp(ms / 1000, IST)


def _overs(x) -> str:
    f = float(x or 0)
    return str(int(f)) if f == int(f) else f"{f:.1f}"


# ── which matches ─────────────────────────────────────────────────────────────────────────────────────────────────

def wanted(mi: dict, cfg: dict) -> str | None:
    """Our format for a schedule match we cover, else None."""
    series = mi.get("seriesName") or ""
    if any(re.search(x, series, re.I) for x in cfg.get("exclude", [])):
        return None
    fmt = "HUNDRED" if re.search(r"\bhundred\b", series, re.I) else FMT.get((mi.get("matchFormat") or "").upper())
    if not fmt:
        return None
    intl = (mi.get("matchType") or "").lower() == "international"
    if intl and cfg.get("international", True):
        return fmt
    return fmt if any(re.search(x, series, re.I) for x in cfg.get("leagues", [])) else None


def fixture_id(mi: dict, fmt: str) -> str:
    t1, t2 = mi.get("team1") or {}, mi.get("team2") or {}
    intl = (mi.get("matchType") or "").lower() == "international"
    kind = {"T20": "t20", "OD": "odi", "T10": "t10", "HUNDRED": "hundred"}[fmt] + ("i" if intl and fmt in ("T20", "T10") else "")
    city = _slug((mi.get("venueInfo") or {}).get("city") or "venue")
    return "-".join([_slug(t1.get("teamSName") or t1.get("teamName", "a")), "v",
                     _slug(t2.get("teamSName") or t2.get("teamName", "b")), kind, city,
                     _ist(mi["startDate"]).date().isoformat()])


def linked(fixtures: dict[str, dict], mi: dict) -> str | None:
    """The fixture already covering this match: same page id, or the same two sides on the same day."""
    day = _ist(mi["startDate"]).date().isoformat()
    for name, fx in fixtures.items():
        lid = (fx.get("live") or {}).get("id")
        if lid:
            if str(lid) == str(mi.get("matchId")):
                return name
            continue
        if fx.get("date") == day and len(fx.get("teams", [])) == 2 and live.find_match(fx, [mi]) is not None:
            return name
    return None


# ── squads and playing XIs ────────────────────────────────────────────────────────────────────────────────────────

def squads(text: str) -> dict[int, dict[str, list[dict]]]:
    """Per page team id: 'xi' (named playing XI, in order) and 'squad' (everyone listed)."""
    out: dict[int, dict[str, list[dict]]] = {}
    for block in live.objects(text, "players"):
        for kind, players in block.items():
            if not isinstance(players, list):
                continue
            for p in players:
                if not isinstance(p, dict) or "teamId" not in p:
                    continue
                t = out.setdefault(int(p["teamId"]), {"xi": [], "squad": []})
                if kind.lower() == "playing xi" and p not in t["xi"]:
                    t["xi"].append(p)
                if p not in t["squad"]:
                    t["squad"].append(p)
    return out


def role(p: dict) -> str:
    return "WK" if p.get("keeper") and ROLE.get((p.get("role") or "").lower()) != "BOWL" else ROLE.get((p.get("role") or "").lower(), "AR")


def probable(squad: list[dict], previous: list[str] | None) -> list[dict]:
    """Eleven from a squad: the side's last XI where still in the squad, then by role (1 WK, 4 BAT, 3 AR, 3 BOWL)."""
    names = {p["name"]: p for p in squad}
    xi = [names[n] for n in (previous or []) if n in names][:11]
    for r, n in QUOTA:
        have = sum(role(p) == r for p in xi)
        xi += [p for p in squad if role(p) == r and p not in xi][:max(0, n - have)]
    xi += [p for p in squad if p not in xi][:max(0, 11 - len(xi))]
    return xi[:11]


def _team(fx_team: dict | None, page: dict, players: list[dict]) -> dict:
    cap = next((p["name"] for p in players if p.get("captain")), None)
    t = {**(fx_team or {}), "name": (fx_team or {}).get("name") or page.get("teamName") or page.get("name"),
         "short": (fx_team or {}).get("short") or page.get("teamSName") or page.get("shortName"),
         "players": [p["name"] for p in players], "roles": [role(p) for p in players]}
    if cap:
        t["captain"] = cap
    return t


def new_fixture(mi: dict, fmt: str, sq: dict, previous: dict[str, list[str]]) -> dict | None:
    t1, t2 = mi.get("team1") or {}, mi.get("team2") or {}
    sides = []
    for t in (t1, t2):
        s = sq.get(int(t.get("teamId", -1)), {})
        players = s.get("xi") if len(s.get("xi", [])) >= 11 else probable(s.get("squad", []), previous.get(t.get("teamName", "")))
        if len(players) < 11:
            return None                                       # squads not out yet: try again next run
        side = _team(None, t, players[:11])
        side["squad"] = [p["name"] for p in s.get("squad", [])]
        sides.append(side)
    start, venue = _ist(mi["startDate"]), mi.get("venueInfo") or {}
    women = any("women" in (x or "").lower() for x in (mi.get("seriesName"), t1.get("teamName"), t2.get("teamName")))
    intl = (mi.get("matchType") or "").lower() == "international"
    series = re.sub(r",?\s*\d{4}(-\d{2,4})?\s*$", "", mi.get("seriesName") or "").strip()
    confirmed = all(len(sq.get(int(t.get("teamId", -1)), {}).get("xi", [])) >= 11 for t in (t1, t2))
    return {"id": fixture_id(mi, fmt), "title": f"{sides[0]['name']} v {sides[1]['name']}",
            "date": start.date().isoformat(), "start_time": start.strftime("%H:%M"), "format": fmt,
            "gender": "female" if women else "male",
            "competition": f"{mi.get('seriesName', '').strip()} · {mi.get('matchDesc', '').strip()}".strip(" ·"),
            "comp_key": f"intl-international-{fmt if fmt != 'HUNDRED' else 'T20'}" if intl else _slug(series),
            "venue": ", ".join(x for x in (venue.get("ground"), venue.get("city")) if x),
            "venue_search": (venue.get("city") or venue.get("ground") or "").lower(), "city": venue.get("city"),
            "status": "scheduled", "published": True,
            "note": "Playing XIs confirmed." if confirmed else "Probable XIs from the squads; updated when the teams are named.",
            "teams": sides, "live": {"id": int(mi["matchId"]), "auto": True, "xis": confirmed}}


def confirm_xis(fx: dict, sq: dict, head: dict) -> bool:
    """Put the named XIs, captains and who bats first into the fixture. True if anything changed."""
    teams = [head.get("team1") or {}, head.get("team2") or {}]
    by_side: list[list[dict] | None] = [None, None]
    for t in teams:
        xi = sq.get(int(t.get("id", -1)), {}).get("xi", [])
        if len(xi) < 11:
            return False
        k = max(range(2), key=lambda i: live._team_score(fx["teams"][i], {"teamName": t.get("name"), "teamSName": t.get("shortName")}))
        by_side[k] = xi[:11]
    if by_side[0] is None or by_side[1] is None:
        return False
    before = json.dumps(fx, sort_keys=True)
    for k in (0, 1):
        fx["teams"][k] = _team(fx["teams"][k], {}, by_side[k])
    toss = head.get("tossResults") or {}
    if toss.get("tossWinnerName"):
        w = max(range(2), key=lambda i: live._team_score(fx["teams"][i], {"teamName": toss["tossWinnerName"]}))
        fx["batting_first"] = w if (toss.get("decision") or "").lower().startswith("bat") else 1 - w
        fx["note"] = f"Playing XIs confirmed. {fx['teams'][w]['name']} won the toss and " \
                     f"{'bat' if fx['batting_first'] == w else 'bowl'} first."
    else:
        fx["note"] = "Playing XIs confirmed."
    fx.setdefault("live", {})["xis"] = True
    return json.dumps(fx, sort_keys=True) != before


# ── scorecards ────────────────────────────────────────────────────────────────────────────────────────────────────

def _side(fx: dict, name: str) -> str:
    k = max(range(2), key=lambda i: live._team_score(fx["teams"][i], {"teamName": name}))
    return fx["teams"][k]["name"] if live._team_score(fx["teams"][k], {"teamName": name}) > 0 else name


def scorecard(fx: dict, card_text: str, head: dict) -> dict | None:
    """Our results file for a finished match, or None while it isn't over."""
    state = (head.get("state") or "").lower()
    res = head.get("result") or {}
    rtype = (res.get("resultType") or "").lower()
    if "abandon" in state or rtype in ("abandon", "noresult", "no result"):
        return {"id": fx["id"], "abandoned": True, "note": head.get("status") or "No result"}
    if state != "complete":
        return None
    m = re.search(r'"scoreCard":\s*(?=\[)', card_text)
    cards = json.JSONDecoder().raw_decode(card_text, m.end())[0] if m else []
    cards = sorted((c for c in cards if c.get("inningsId") in (1, 2)), key=lambda c: c["inningsId"])
    if not cards:
        return None
    innings, revised = [], 0
    for c in cards:
        bat, bowl, sd = c.get("batTeamDetails") or {}, c.get("bowlTeamDetails") or {}, c.get("scoreDetails") or {}
        revised = max(revised, int(sd.get("revisedOvers") or 0))
        ex = c.get("extrasData") or {}
        batting = [{"name": b.get("batName"), "dismissal": "not out" if (b.get("outDesc") or "").lower() == "batting" else b.get("outDesc"),
                    "runs": int(b.get("runs") or 0), "balls": int(b.get("balls") or 0),
                    "fours": int(b.get("fours") or 0), "sixes": int(b.get("sixes") or 0)}
                   for b in (bat.get("batsmenData") or {}).values() if (b.get("outDesc") or "").strip() or int(b.get("balls") or 0) > 0]
        bowling = [{"name": b.get("bowlName"), "overs": _overs(b.get("overs")), "maidens": int(b.get("maidens") or 0),
                    "runs": int(b.get("runs") or 0), "wickets": int(b.get("wickets") or 0),
                    "no_balls": int(b.get("no_balls") or 0), "wides": int(b.get("wides") or 0)}
                   for b in (bowl.get("bowlersData") or {}).values()]
        fow = [{"wicket": int(w.get("wktNbr") or i + 1), "batter": w.get("batName"), "score": int(w.get("wktRuns") or 0),
                "over": _overs(w.get("wktOver"))}
               for i, w in enumerate(sorted((c.get("wicketsData") or {}).values(), key=lambda w: w.get("wktNbr") or 0))]
        inn = {"team": _side(fx, bat.get("batTeamName") or ""), "runs": int(sd.get("runs") or 0),
               "wickets": int(sd.get("wickets") or 0), "overs": _overs(sd.get("overs")), "batting": batting,
               "bowling": bowling, "fall_of_wickets": fow,
               "extras": {"b": int(ex.get("byes") or 0), "lb": int(ex.get("legByes") or 0), "w": int(ex.get("wides") or 0),
                          "nb": int(ex.get("noBalls") or 0), "p": int(ex.get("penalty") or 0)}}
        pp = [p for p in (c.get("ppData") or {}).values() if isinstance(p, dict)]
        mand = next((p for p in pp if "mandatory" in (p.get("ppType") or "").lower()), pp[0] if pp else None)
        if mand and mand.get("runsScored") is not None:
            inn["powerplay_runs"] = int(mand["runsScored"])
        innings.append(inn)
    out = {"id": fx["id"], "innings": innings}
    if revised:
        out["overs_per_side"] = revised
    if rtype == "tie":
        out["result"] = "Match tied"
    elif res.get("winningTeam"):
        winner, margin = _side(fx, res["winningTeam"]), int(res.get("winningMargin") or 0)
        unit = ("run" if res.get("winByRuns") else "wicket") + ("" if margin == 1 else "s")
        out["winner"], out["result"] = winner, f"{winner} won by {margin} {unit}"
    return out


# ── one run ───────────────────────────────────────────────────────────────────────────────────────────────────────

def _previous_xis(fixtures: dict[str, dict], before: str) -> dict[str, list[str]]:
    """Each side's most recent XI in our fixtures (dated before the given day)."""
    last: dict[str, tuple[str, list[str]]] = {}
    for fx in fixtures.values():
        for t in fx.get("teams", []):
            d = fx.get("date") or ""
            if d < before and (t["name"] not in last or d > last[t["name"]][0]):
                last[t["name"]] = (d, t.get("players", []))
    return {k: v for k, (_, v) in last.items()}


def run(fixtures_dir: Path, results_dir: Path, now: datetime | None = None, page=live.get,
        cfg: dict | None = None, write: bool = True) -> list[str]:
    """One pass. Returns the fixture files whose forecast should be re-run now (new, or XIs named)."""
    now, cfg = now or datetime.now(timezone.utc), cfg or json.loads(CONFIG.read_text())
    paths = {p.name: p for p in sorted(fixtures_dir.glob("*.json"))}
    fixtures = {n: json.loads(p.read_text()) for n, p in paths.items()}
    rerun: list[str] = []

    def save(name: str, fx: dict, why: str) -> None:
        click.echo(f"{why}: {name}")
        if write:
            (fixtures_dir / name).write_text(json.dumps(fx, indent=2, ensure_ascii=False) + "\n")
        fixtures[name] = fx

    listing = live.match_list(live._safe(page, SCHEDULE)) + live.match_list(live._safe(page, live.LIST))
    by_id = {int(m["matchId"]): m for m in listing if m.get("matchId")}

    # 1. new fixtures
    horizon = now + timedelta(days=float(cfg.get("days_ahead", 2)))
    for mi in by_id.values():
        fmt = wanted(mi, cfg)
        if not fmt or not mi.get("startDate") or not now < _ist(mi["startDate"]) <= horizon:
            continue
        name = linked(fixtures, mi)
        if name:
            fx = fixtures[name]
            if not (fx.get("live") or {}).get("id"):
                save(name, {**fx, "live": {**(fx.get("live") or {}), "id": int(mi["matchId"])}}, "linked")
            continue
        sq = squads(live.flight(live._safe(page, f"{live.BASE}/cricket-match-squads/{mi['matchId']}")))
        fx = new_fixture(mi, fmt, sq, _previous_xis(fixtures, _ist(mi["startDate"]).date().isoformat()))
        if fx:
            save(f"{fx['id']}.json", fx, "new fixture")
            rerun.append(f"{fx['id']}.json")

    # 2. named XIs before the start
    for name, fx in list(fixtures.items()):
        lv, k = fx.get("live") or {}, kickoff(fx)
        mid = lv.get("id")
        if not mid or not k or lv.get("xis") or not k - XI_FROM <= now <= k + timedelta(minutes=20):
            continue
        if not lv.get("auto") and "confirmed" in (fx.get("note") or "").lower():
            continue                                          # XIs already confirmed by hand
        sq = squads(live.flight(live._safe(page, f"{live.BASE}/cricket-match-squads/{mid}")))
        head = live.first(live.flight(live._safe(page, f"{live.BASE}/live-cricket-scores/{mid}")), "matchHeader", mid) or {}
        if confirm_xis(fx, sq, head):
            save(name, fx, "playing XIs")
            rerun.append(name)

    # 3. scorecards of finished matches
    for name, fx in fixtures.items():
        k, hours = kickoff(fx), RESULT_AFTER.get(fx.get("format", ""))
        out = results_dir / name
        if not k or not hours or out.exists() or not k + timedelta(hours=hours * 0.5) <= now <= k + timedelta(days=3):
            continue
        mid = (fx.get("live") or {}).get("id") or live.find_match(fx, listing)
        if not mid:
            continue
        head = live.first(live.flight(live._safe(page, f"{live.BASE}/live-cricket-scores/{mid}")), "matchHeader", mid) or {}
        if (head.get("state") or "").lower() not in ("complete",) and "abandon" not in (head.get("state") or "").lower():
            continue
        card = scorecard(fx, live.flight(live._safe(page, f"{live.BASE}/live-cricket-scorecard/{mid}")), head)
        if card:
            click.echo(f"scorecard: {name} ({card.get('result') or card.get('note')})")
            if write:
                out.write_text(json.dumps(card, indent=1, ensure_ascii=False) + "\n")
    return rerun


@click.command()
@click.option("--fixtures", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--results", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/results"))
@click.option("--changed", type=click.Path(path_type=Path), default=None,
              help="Write the fixture files to re-simulate now (comma-separated) here")
@click.option("--dry-run", is_flag=True, help="Report what would change; write nothing")
def main(fixtures: Path, results: Path, changed: Path | None, dry_run: bool) -> None:
    rerun = run(fixtures, results, write=not dry_run)
    if changed:
        changed.write_text(",".join(rerun))


if __name__ == "__main__":
    main()
