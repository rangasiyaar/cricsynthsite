"""Fixtures, playing XIs and scorecards from the public match pages (cricsim.khelnow), so matches publish and score
themselves.

1. Fixtures: upcoming limited-overs matches in the competitions listed in auto.json become cricsim/fixtures/<id>.json
   (days_ahead before the start) with probable XIs: each side's XI in its last finished match on the pages (squads
   only appear on a match page once the match is on), else the side's last XI in our fixtures.
2. Playing XIs: from 75 minutes before the start until the match is due to end, once both XIs are named, the fixture
   gets them, the captains and who bats first, and the forecast is re-run on the real teams (also after the start,
   when the teams are named late).
3. Scorecards: when a match is over, cricsim/results/<id>.json in our scorecard format (an existing card is never
   replaced), so the results page scores it.

python -m cricsim.auto --fixtures cricsim/fixtures --results cricsim/results [--changed FILE] [--cache FILE] [--dry-run]

Run by .github/workflows/auto.yml every 5 minutes, which commits what changed and asks for a quick publish.
Fixtures stay ours to edit: a hand-written fixture is linked (live.kn) and gets the confirmed XIs, nothing else.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click

from cricsim import khelnow as kn
from cricsim.results import IST, kickoff

CONFIG = Path(__file__).with_name("auto.json")
ROLE = {"batter": "BAT", "batsman": "BAT", "wk-batter": "WK", "wk-batsman": "WK", "bowler": "BOWL",
        "batting allrounder": "AR", "bowling allrounder": "AR", "allrounder": "AR"}
QUOTA = (("WK", 1), ("BAT", 4), ("AR", 3), ("BOWL", 3))      # a probable XI from a squad, before top-up
XI_FROM = timedelta(minutes=75)                             # look for named XIs from this long before the start
RESULT_AFTER = {"T20": 3.0, "T10": 1.5, "HUNDRED": 2.5, "OD": 7.0}
INFO_TTL = 6 * 3600                                         # re-read an upcoming match's page after this long
LAST_XI_DAYS = 60                                           # how far back a side's last XI is looked for


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


# ── the match list: sitemap + each match page's facts, kept between passes ────────────────────────────────────────

class Index:
    """The sitemap's match pages and, for those near our window, the facts from each page (cached in a file between
    passes so a page is read once every few hours, not every 5 minutes)."""

    def __init__(self, page, cache: Path | None):
        self.page, self.cache = page, cache
        self.entries = kn.sitemap(kn.safe(page, kn.SITEMAP))
        self.by_id = {e["id"]: e for e in self.entries}
        self.saved = json.loads(cache.read_text()) if cache and cache.exists() else {}
        self.pages: dict[int, dict] = {}

    def data(self, e: dict) -> dict:
        """The page's data, read at most once per pass."""
        if e["id"] not in self.pages:
            self.pages[e["id"]] = kn.match(e["url"], self.page)
        return self.pages[e["id"]]

    def info(self, e: dict, fresh: bool = False) -> dict | None:
        s = self.saved.get(str(e["id"]))
        if s and not fresh and time.time() - s["t"] < INFO_TTL:
            i = dict(s["i"])
        else:
            d = self.data(e)
            if not d:
                return None
            i = kn.info(d)
            i["start"] = i["start"].isoformat() if i["start"] else None
            i = {k: v for k, v in i.items() if k != "toss"}
            self.saved[str(e["id"])] = {"t": time.time(), "i": dict(i)}
        i["start"] = datetime.fromisoformat(i["start"]) if i.get("start") else None
        i["url"] = e["url"]
        return i

    def near(self, lo: datetime, hi: datetime) -> list[dict]:
        """Sitemap entries whose page date falls within a day of [lo, hi]."""
        a, b = (lo - timedelta(days=1)).date(), (hi + timedelta(days=1)).date()
        return [e for e in self.entries if e["date"] and a <= e["date"] <= b]

    def save(self) -> None:
        if self.cache:
            keep = {k: v for k, v in self.saved.items() if time.time() - v["t"] < 4 * 86400}
            self.cache.parent.mkdir(parents=True, exist_ok=True)
            self.cache.write_text(json.dumps(keep))


# ── which matches ─────────────────────────────────────────────────────────────────────────────────────────────────

def wanted(i: dict, cfg: dict) -> str | None:
    """Our format for a match we cover, else None (multi-day, or not in the competitions we cover)."""
    series = i.get("competition") or ""
    if any(re.search(x, series, re.I) for x in cfg.get("exclude", [])):
        return None
    fmt = "HUNDRED" if re.search(r"\bhundred\b", series, re.I) else i.get("format")
    if not fmt:
        return None
    if cfg.get("all") or (i.get("international") and cfg.get("international", True)):
        return fmt
    return fmt if any(re.search(x, series, re.I) for x in cfg.get("leagues", [])) else None


def fixture_id(i: dict, fmt: str) -> str:
    t1, t2 = i["teams"]
    kind = {"T20": "t20", "OD": "odi", "T10": "t10", "HUNDRED": "hundred"}[fmt] + \
        ("i" if i.get("international") and fmt in ("T20", "T10") else "")
    return "-".join([_slug(t1.get("short") or t1["name"]), "v", _slug(t2.get("short") or t2["name"]), kind,
                     _slug(i.get("city") or i.get("venue") or "venue"), i["start"].astimezone(IST).date().isoformat()])


def same_teams(fx: dict, i: dict) -> bool:
    if len(fx.get("teams", [])) != 2:
        return False
    a, b = fx["teams"]
    s = lambda o, t: kn._team_match(o, t["name"], t.get("short", ""))     # noqa: E731
    t1, t2 = i["teams"]
    return max(min(s(a, t1), s(b, t2)), min(s(a, t2), s(b, t1))) >= 1


def linked(fixtures: dict[str, dict], i: dict) -> str | None:
    """The fixture already covering this match: same page id, or the same two sides on the same day."""
    day = i["start"].astimezone(IST).date().isoformat()
    for name, fx in fixtures.items():
        lid = (fx.get("live") or {}).get("kn")
        if lid:
            if int(lid) == int(i["id"]):
                return name
            continue
        if fx.get("date") == day and same_teams(fx, i):
            return name
    return None


# ── squads and playing XIs ────────────────────────────────────────────────────────────────────────────────────────

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


def _full(name: str, squad: list[str]) -> str:
    """A name the page shortens ("Smit") as it is in the squad ("JJ Smit"), when only one fits."""
    if not name or name in squad:
        return name
    fits = [s for s in squad if s.lower().endswith(" " + name.lower())]
    return fits[0] if len(fits) == 1 else name


def _team(fx_team: dict | None, page: dict, players: list[dict]) -> dict:
    squad = (fx_team or {}).get("squad") or []
    cap = next((_full(p["name"], squad) for p in players if p.get("captain")), None)
    t = {**(fx_team or {}), "name": (fx_team or {}).get("name") or page.get("name"),
         "short": (fx_team or {}).get("short") or page.get("short"),
         "players": [_full(p["name"], squad) for p in players], "roles": [role(p) for p in players]}
    if cap:
        t["captain"] = cap
    return t


def last_xi(index: Index, i: dict, team: dict) -> list[dict]:
    """A side's XI in its latest finished match on the pages (match pages only list squads once a match is on)."""
    slug, before = _slug(team["name"]), i["start"].date()
    past = [e for e in index.entries if e["date"] and before - timedelta(days=LAST_XI_DAYS) <= e["date"] <= before
            and e["id"] != i["id"] and (f"/{slug}-vs-" in e["url"] or f"-vs-{slug}-" in e["url"])]
    for e in sorted(past, key=lambda e: e["date"], reverse=True)[:3]:
        d = index.data(e)
        if not d or kn.info(d)["status"] not in (kn.COMPLETED, kn.LIVE):
            continue
        sq = kn.squads(d)
        tid = team.get("id") if team.get("id") in sq else next(
            (t["id"] for t in kn.info(d)["teams"] if kn._team_match({"name": team["name"]}, t["name"]) >= 2), None)
        xi = (sq.get(tid) or {}).get("xi") or []
        if len(xi) >= 11:
            return xi
    return []


def new_fixture(i: dict, fmt: str, sq: dict, previous: dict[str, list[str]]) -> dict | None:
    sides = []
    for t in i["teams"]:
        s = sq.get(t["id"], {})
        players = s.get("xi") if len(s.get("xi", [])) >= 11 else probable(s.get("squad", []), previous.get(t["name"]))
        if len(players) < 11:
            return None                                       # no XI to go on yet: try again next run
        side = _team(None, t, players[:11])
        side["squad"] = [p["name"] for p in s.get("squad", [])]
        sides.append(side)
    start = i["start"].astimezone(IST)
    series = re.sub(r",?\s*\d{4}(-\d{2,4})?\s*$", "", i.get("competition") or "").strip()
    confirmed = all(len(sq.get(t["id"], {}).get("xi", [])) >= 11 and sq[t["id"]].get("named") for t in i["teams"])
    desc = " · ".join(x for x in (i.get("competition"), i.get("subtitle")) if x)
    return {"id": fixture_id(i, fmt), "title": f"{sides[0]['name']} v {sides[1]['name']}",
            "date": start.date().isoformat(), "start_time": start.strftime("%H:%M"), "format": fmt,
            "gender": i.get("gender") or "male", "competition": desc,
            "comp_key": f"intl-international-{fmt if fmt != 'HUNDRED' else 'T20'}" if i.get("international") else _slug(series),
            "venue": ", ".join(x for x in (i.get("venue"), i.get("city")) if x),
            "venue_search": (i.get("city") or i.get("venue") or "").lower(), "city": i.get("city") or None,
            "status": "scheduled", "published": True,
            "note": "Playing XIs confirmed." if confirmed else "Probable XIs from the last matches; updated when the teams are named.",
            "teams": sides, "live": {"kn": int(i["id"]), "url": i["url"], "auto": True, "xis": confirmed}}


def confirm_xis(fx: dict, d: dict) -> bool:
    """Put the named XIs, captains and who bats first into the fixture. True if anything changed.
    XIs put in by hand (live.manual) are replaced by the page's once it names them; the flag is then dropped
    (that alone doesn't count as a change, so identical XIs don't re-run the forecast)."""
    i, sq = kn.info(d), kn.squads(d)
    by_side: list[list[dict] | None] = [None, None]
    for t in i["teams"]:
        xi = sq.get(t["id"], {}).get("xi", [])
        if len(xi) < 11:
            return False
        k = max(range(2), key=lambda j: kn._team_match(fx["teams"][j], t["name"], t["short"]))
        by_side[k] = xi[:12] if len(xi) == 12 else xi[:11]
    if by_side[0] is None or by_side[1] is None:
        return False
    (fx.get("live") or {}).pop("manual", None)
    before = json.dumps(fx, sort_keys=True)
    for k in (0, 1):
        fx["teams"][k] = _team(fx["teams"][k], {}, by_side[k][:11])
    t = kn.toss(d)
    if t:
        name = next((x["name"] for x in i["teams"] if x["id"] == t[0]), "")
        w = max(range(2), key=lambda j: kn._team_match(fx["teams"][j], name))
        fx["batting_first"] = w if t[1] == "bat" else 1 - w
        fx["note"] = f"Playing XIs confirmed. {fx['teams'][w]['name']} won the toss and " \
                     f"{'bat' if fx['batting_first'] == w else 'bowl'} first."
    else:
        fx["note"] = "Playing XIs confirmed."
    fx.setdefault("live", {})["xis"] = True
    return json.dumps(fx, sort_keys=True) != before


# ── one run ───────────────────────────────────────────────────────────────────────────────────────────────────────

LABEL = {"WK": "wk-batter", "BAT": "batter", "AR": "allrounder", "BOWL": "bowler"}


def _previous_sides(fixtures: dict[str, dict], before: str) -> dict[str, dict]:
    """Each side as it was in our most recent fixture for it (dated before the given day): players and roles."""
    last: dict[str, tuple[str, dict]] = {}
    for fx in fixtures.values():
        d = fx.get("date") or ""
        for t in fx.get("teams", []):
            if d < before and (t["name"] not in last or d > last[t["name"]][0]):
                last[t["name"]] = (d, t)
    return {k: v for k, (_, v) in last.items()}


def _as_squad(side: dict) -> list[dict]:
    """A fixture side as squad entries (with roles, so the probable XI keeps its keeper and balance)."""
    roles = side.get("roles") or []
    return [{"name": n, "role": LABEL.get(roles[k] if k < len(roles) else "", "allrounder"),
             "keeper": (roles[k] if k < len(roles) else "") == "WK"} for k, n in enumerate(side["players"])]


def _previous_xis(fixtures: dict[str, dict], before: str) -> dict[str, list[str]]:
    """Each side's most recent XI in our fixtures (dated before the given day)."""
    return {k: v.get("players", []) for k, v in _previous_sides(fixtures, before).items()}


def _url(fx: dict, index: Index | None) -> str | None:
    lv = fx.get("live") or {}
    if lv.get("url"):
        return lv["url"]
    if lv.get("kn") and index and int(lv["kn"]) in index.by_id:
        return index.by_id[int(lv["kn"])]["url"]
    return None


def run(fixtures_dir: Path, results_dir: Path, now: datetime | None = None, page=kn.get,
        cfg: dict | None = None, write: bool = True, late: set[str] | None = None, cache: Path | None = None) -> list[str]:
    """One pass. Returns the fixture files whose forecast should be re-run now (new, or XIs named).

    `late` names fixtures whose XIs were missed before the start: their named XIs are fetched whatever the time."""
    now, cfg = now or datetime.now(timezone.utc), cfg or json.loads(CONFIG.read_text())
    paths = {p.name: p for p in sorted(fixtures_dir.glob("*.json"))}
    fixtures = {n: json.loads(p.read_text()) for n, p in paths.items()}
    rerun: list[str] = []
    index = Index(page, cache)

    def save(name: str, fx: dict, why: str) -> None:
        click.echo(f"{why}: {name}")
        if write:
            (fixtures_dir / name).write_text(json.dumps(fx, indent=2, ensure_ascii=False) + "\n")
        fixtures[name] = fx

    # 1. new fixtures, and pages for our fixtures that have none yet
    horizon = now + timedelta(days=float(cfg.get("days_ahead", 2)))
    for e in index.near(now - timedelta(hours=12), horizon):
        i = index.info(e)
        if not i or not i.get("start") or not i["teams"][0]["name"]:
            continue
        fmt = wanted(i, cfg)
        if not fmt or not now - timedelta(hours=12) < i["start"] <= horizon:
            continue
        name = linked(fixtures, i)
        if name:
            fx = fixtures[name]
            if not (fx.get("live") or {}).get("kn"):
                save(name, {**fx, "live": {**(fx.get("live") or {}), "kn": int(i["id"]), "url": i["url"]}}, "linked")
            continue
        if i["start"] <= now:
            continue
        d = index.data(e)
        sq = kn.squads(d) if d else {}
        for t in i["teams"]:
            if len(sq.get(t["id"], {}).get("xi", [])) >= 11:
                sq[t["id"]]["named"] = True
        previous = _previous_xis(fixtures, i["start"].astimezone(IST).date().isoformat())
        last_sides = _previous_sides(fixtures, i["start"].astimezone(IST).date().isoformat())
        for t in i["teams"]:
            if len(sq.get(t["id"], {}).get("squad", [])) >= 11:
                continue                                      # squads listed: the page decides
            xi = last_xi(index, i, t)
            if xi:
                sq[t["id"]] = {"xi": [], "squad": xi}
                previous[t["name"]] = [p["name"] for p in xi]
            elif t["name"] in last_sides and len(last_sides[t["name"]]["players"]) >= 11:
                sq[t["id"]] = {"xi": [], "squad": _as_squad(last_sides[t["name"]])}     # our own last XI
        fx = new_fixture(i, fmt, sq, previous)
        if fx and f"{fx['id']}.json" in fixtures:
            continue                                          # the same match listed twice
        if fx:
            save(f"{fx['id']}.json", fx, "new fixture")
            rerun.append(f"{fx['id']}.json")
        else:
            click.echo(f"no XIs to go on yet: {i['competition']} {i['subtitle']} ({i['id']})")

    # 2. named XIs before the start (or, for `late` fixtures, whenever asked)
    for name, fx in list(fixtures.items()):
        lv, k = fx.get("live") or {}, kickoff(fx)
        url = _url(fx, index)
        if late is not None:
            if name not in late or not url:
                continue
        elif not url or not k or (lv.get("xis") and not lv.get("manual")) \
                or (paths.get(name) and (results_dir / name).exists()) \
                or not k - XI_FROM <= now <= k + timedelta(hours=RESULT_AFTER.get(fx.get("format", ""), 4.0)):
            continue                     # XIs put in by hand (live.manual) keep being checked: the page's replace them
        d = kn.match(url, page)
        if not d:
            continue
        manual = bool(lv.get("manual"))
        if confirm_xis(fx, d):
            save(name, fx, "playing XIs (replacing the hand-entered ones)" if manual else "playing XIs")
            rerun.append(name)
        elif manual and not (fx.get("live") or {}).get("manual"):
            save(name, fx, "page XIs match the hand-entered ones")
        elif late is not None:
            click.echo(f"no named XIs on the page yet: {name}")

    if late is not None:
        index.save()
        return rerun

    # 3. scorecards of finished matches
    for name, fx in fixtures.items():
        k, hours = kickoff(fx), RESULT_AFTER.get(fx.get("format", ""))
        out = results_dir / name
        url = _url(fx, index)
        if not url or not k or not hours or out.exists() or not k + timedelta(hours=hours * 0.5) <= now <= k + timedelta(days=3):
            continue
        card = kn.scorecard(fx, kn.match(url, page))
        if card:
            click.echo(f"scorecard: {name} ({card.get('result') or card.get('note')})")
            if write:
                out.write_text(json.dumps(card, indent=1, ensure_ascii=False) + "\n")
    index.save()
    return rerun


@click.command()
@click.option("--fixtures", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--results", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/results"))
@click.option("--changed", type=click.Path(path_type=Path), default=None,
              help="Write the fixture files to re-simulate now (comma-separated) here")
@click.option("--cache", type=click.Path(path_type=Path), default=None,
              help="File that keeps the match pages' facts between passes")
@click.option("--dry-run", is_flag=True, help="Report what would change; write nothing")
@click.option("--list", "show", is_flag=True, help="List the scheduled matches and whether we cover them")
@click.option("--probe", "probe_url", default=None, help="Show what we read from one match page")
@click.option("--late", default="", help="Fixture files (comma-separated) whose missed XIs to fetch now, whatever the time")
def main(fixtures: Path, results: Path, changed: Path | None, cache: Path | None, dry_run: bool, show: bool,
         late: str, probe_url: str | None) -> None:
    if probe_url:
        kn.probe.callback(probe_url)
        return
    if show:
        cfg, now = json.loads(CONFIG.read_text()), datetime.now(timezone.utc)
        index = Index(kn.get, cache)
        for e in index.near(now, now + timedelta(days=float(cfg.get("days_ahead", 2)))):
            i = index.info(e)
            if not i or not i.get("start"):
                continue
            click.echo(f"{i['start'].astimezone(IST):%d %b %H:%M} | {wanted(i, cfg) or '-':7} | {i['format_str']:10} | "
                       f"{i['competition']} | {i['teams'][0]['name']} v {i['teams'][1]['name']} | {i['state']}")
        index.save()
        return
    names = {n.strip() for n in late.split(",") if n.strip()}
    rerun = run(fixtures, results, write=not dry_run, late=names or None, cache=cache)
    if changed:
        changed.write_text(",".join(rerun))


if __name__ == "__main__":
    main()
