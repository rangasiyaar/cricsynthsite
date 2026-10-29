"""Live match state for the match centre's live projection: polled from a public score page while our published
matches are on, and written to Firestore live/{id} when an over ends, a wicket falls or the match state changes.
Browsers re-simulate the rest of the match from that state (app/components/LiveProjection.tsx); we publish
projections, never a score feed.

python -m cricsim.live --fixtures cricsim/fixtures [--dry-run] [--once] [--max-minutes 340]

Run by .github/workflows/live.yml (every 30 minutes; each run loops while a match is on). One page request a minute
per live match, plus the scorecard page when a wicket falls; the match list only until each match is found.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click

from cricsim.engine.states import FORMAT_RULES
from cricsim.results import Roster, _fetch, _tokens, kickoff

log = logging.getLogger("cricsim.live")

BASE = "https://www.cricbuzz.com"
LIST = f"{BASE}/cricket-match/live-scores"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
DURATION = {"T20": 4.5, "T10": 2.5, "HUNDRED": 3.5, "OD": 9.5}     # hours after the start we keep polling
EARLY = timedelta(minutes=20)                                      # before the start: toss and XIs
POLL = 60                                                          # seconds between polls of a live match
ROSTER_REFRESH = 600                                               # seconds before re-reading the published XIs
FINISHED = ("complete", "abandon", "no result", "cancel")
GENERIC = {"women", "woman", "men", "cricket", "club", "team", "xi", "cc", "the", "of"}


# ── page data ─────────────────────────────────────────────────────────────────────────────────────────────────────

def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def flight(html: str) -> str:
    """The page's embedded data: every self.__next_f.push([1,"..."]) chunk, decoded and joined."""
    out = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html):
        try:
            out.append(json.loads(m.group(1)))
        except ValueError:
            pass
    return "".join(out)


def objects(text: str, key: str) -> list[dict]:
    """Every JSON object stored under "key" in the page data."""
    dec, found = json.JSONDecoder(), []
    for m in re.finditer(f'"{re.escape(key)}":\\s*(?=\\{{)', text):
        try:
            found.append(dec.raw_decode(text, m.end())[0])
        except ValueError:
            continue
    return found


def first(text: str, key: str, match_id: int | None = None) -> dict | None:
    """The first object under "key" (for match_id, when given: pages also carry other matches' data)."""
    for o in objects(text, key):
        mid = o.get("matchId") or (o.get("matchScoreDetails") or {}).get("matchId")
        if match_id is None or mid is None or int(mid) == int(match_id):
            return o
    return None


# ── which page match is our fixture ───────────────────────────────────────────────────────────────────────────────

def _team_score(ours: dict, theirs: dict) -> float:
    a, b = _tokens(ours.get("name", "")), _tokens(theirs.get("teamName") or theirs.get("name") or "")
    if a and "".join(a) == "".join(b):
        return 3                                                   # "Sudur Paschim Royals" ~ "Sudurpaschim Royals"
    short = (theirs.get("teamSName") or theirs.get("shortName") or "").upper()
    if short and short == (ours.get("short") or "").upper():
        return 2
    return 1 if (set(a) - GENERIC) & (set(b) - GENERIC) else 0


def find_match(fx: dict, listing: list[dict]) -> int | None:
    """The page's match id for a fixture: both sides named alike, starting within 12 hours of our kickoff."""
    if (fx.get("live") or {}).get("id"):
        return int(fx["live"]["id"])
    k = kickoff(fx)
    best, who = 0.0, None
    for mi in listing:
        try:
            start = float(mi.get("startDate") or 0) / 1000
        except (TypeError, ValueError):
            start = 0
        if k and start and abs(start - k.timestamp()) > 12 * 3600:
            continue
        t1, t2 = mi.get("team1") or {}, mi.get("team2") or {}
        a, b = fx["teams"]
        s = max(min(_team_score(a, t1), _team_score(b, t2)), min(_team_score(a, t2), _team_score(b, t1)))
        if s > best:
            best, who = s, mi.get("matchId")
    return int(who) if best >= 1 and who else None


def match_list(html: str) -> list[dict]:
    seen, out = set(), []
    for mi in objects(flight(html), "matchInfo"):
        if mi.get("matchId") and mi["matchId"] not in seen:
            seen.add(mi["matchId"])
            out.append(mi)
    return out


# ── the state the browser engine starts from ──────────────────────────────────────────────────────────────────────

def balls_of(overs: float | str | None, bpo: int) -> int:
    whole, _, part = f"{float(overs or 0):.1f}".partition(".")
    return int(whole) * bpo + int(part)


def out_batters(card_text: str, innings: int, match_id: int | None = None) -> list[str]:
    """Names of the batters already out in this innings, from the scorecard page."""
    dec, names = json.JSONDecoder(), []
    m = re.search(r'"scoreCard":\s*(?=\[)', card_text)
    if not m:
        return names
    try:
        cards = dec.raw_decode(card_text, m.end())[0]
    except ValueError:
        return names
    for inn in cards:
        if inn.get("inningsId") != innings or (match_id and inn.get("matchId") and int(inn["matchId"]) != int(match_id)):
            continue
        for b in ((inn.get("batTeamDetails") or {}).get("batsmenData") or {}).values():
            desc = (b.get("outDesc") or "").strip().lower()
            if desc and desc not in ("batting", "not out") and not desc.startswith("retired hurt"):
                names.append(b.get("batName") or "")
    return names


def state(page_text: str, roster: Roster, fmt: str, out_names: list[str] | None = None,
          match_id: int | None = None) -> dict | None:
    """Our live doc from the score page: innings, score, balls, who is batting and who is out, in our player ids."""
    mini, head = first(page_text, "miniscore", match_id), first(page_text, "matchHeader", match_id) or {}
    status = (head.get("state") or "").strip()
    if not mini:
        return {"state": status or "Preview", "status": head.get("status") or ""} if head else None
    bpo = FORMAT_RULES.get(fmt, FORMAT_RULES["T20"])["bpo"]
    names = {t.get("id"): t.get("name") for t in (head.get("team1") or {}, head.get("team2") or {})}
    innings = (mini.get("matchScoreDetails") or {}).get("inningsScoreList") or []
    first_inn = next((x for x in innings if x.get("inningsId") == 1), None)
    bat_id = (mini.get("batTeam") or {}).get("teamId")
    side = lambda tid, short=None: roster.team(names.get(tid) or short or "")   # noqa: E731
    batting = side(bat_id)
    inn_no = int(mini.get("inningsId") or 1)
    doc = {"state": status, "status": mini.get("status") or head.get("status") or "",
           "innings": inn_no, "batting": batting,
           "battingFirst": side(first_inn.get("batTeamId"), first_inn.get("batTeamName")) if first_inn else batting,
           "runs": int((mini.get("batTeam") or {}).get("teamScore") or 0),
           "wickets": int((mini.get("batTeam") or {}).get("teamWkts") or 0),
           "balls": balls_of(mini.get("overs"), bpo), "overs": str(mini.get("overs") or 0)}
    if inn_no == 2 and first_inn:
        doc["firstInningsTotal"] = int(first_inn.get("score") or 0)
    if mini.get("target"):
        doc["target"] = int(mini["target"])
    for key, field in (("batsmanStriker", "striker"), ("batsmanNonStriker", "nonStriker")):
        nm = (mini.get(key) or {}).get("name")
        pid = roster.player(nm, batting) if nm else None
        if pid:
            doc[field] = pid
    if out_names is not None:
        doc["out"] = [p for p in (roster.player(n, batting) for n in out_names if n) if p]
    return doc


def change_key(doc: dict, bpo: int) -> tuple:
    """Write when an over ends, a wicket falls, the innings or the match state changes."""
    return (doc.get("state"), doc.get("innings"), doc.get("wickets"), (doc.get("balls") or 0) // bpo)


# ── Firestore ─────────────────────────────────────────────────────────────────────────────────────────────────────

def value(v) -> dict:
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, (list, tuple)):
        return {"arrayValue": {"values": [value(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: value(x) for k, x in v.items()}}}
    return {"stringValue": str(v)}


class Writer:
    """live/{id} in Firestore with the job's Google credentials; dry run prints instead."""

    def __init__(self, dry: bool):
        self.dry, self.session, self.url = dry, None, None
        if dry:
            return
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        creds, project = google.auth.default(scopes=["https://www.googleapis.com/auth/datastore"])
        project = project or os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
        self.session = AuthorizedSession(creds)
        self.url = f"https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/live"

    def write(self, mid: str, doc: dict) -> None:
        body = {**doc, "id": mid, "published": True, "updated": int(time.time() * 1000)}
        if self.dry:
            click.echo(f"{mid}: {json.dumps(body)}")
            return
        r = self.session.patch(f"{self.url}/{mid}", json={"fields": {k: value(v) for k, v in body.items()}}, timeout=30)
        if r.status_code >= 300:
            log.warning("live/%s not written: %s %s", mid, r.status_code, r.text[:300])


# ── the loop ──────────────────────────────────────────────────────────────────────────────────────────────────────

def window(fx: dict, now: datetime) -> str:
    """'on' while the match can be live, 'soon' within 35 minutes of the toss, else 'off'."""
    k, hours = kickoff(fx), DURATION.get(fx.get("format", ""))
    if not k or not hours or not fx.get("published", True):
        return "off"
    if k - EARLY <= now <= k + timedelta(hours=hours):
        return "on"
    return "soon" if now < k - EARLY <= now + timedelta(minutes=35) else "off"


def run(fixtures: Path, dry: bool, once: bool, max_minutes: float, fetch=_fetch, page=get) -> None:
    writer, end = Writer(dry), time.monotonic() + max_minutes * 60
    ids: dict[str, int] = {}
    rosters: dict[str, Roster] = {}
    fetched: dict[str, float] = {}
    last: dict[str, tuple] = {}
    outs: dict[str, tuple[int, int, list[str]]] = {}             # match → (innings, wickets, names) last read
    done: set[str] = set()
    while True:
        now = datetime.now(timezone.utc)
        fxs = {p.stem: json.loads(p.read_text()) for p in sorted(fixtures.glob("*.json"))}
        live = {m: fx for m, fx in fxs.items() if m not in done and window(fx, now) == "on"}
        if not live and not any(window(fx, now) == "soon" for m, fx in fxs.items() if m not in done):
            click.echo("no match on now or within 35 minutes")
            return
        listing = None
        for mid, fx in live.items():
            if mid not in ids:
                listing = listing if listing is not None else match_list(_safe(page, LIST))
                found = find_match(fx, listing)
                if not found:
                    click.echo(f"{mid}: not on the live page yet")
                    continue
                ids[mid] = found
                click.echo(f"{mid}: page match {found}")
            if mid not in rosters or time.monotonic() - fetched.get(mid, 0) > ROSTER_REFRESH:
                fetched[mid] = time.monotonic()             # again every few minutes: XIs can change at the toss
                doc = fetch(f"matches/{mid}.json")
                if doc:
                    rosters[mid] = Roster(doc, fx)
                elif mid not in rosters:
                    click.echo(f"{mid}: no published forecast, skipped")
                    done.add(mid)
                    continue
            fmt = fx.get("format", "T20")
            text = flight(_safe(page, f"{BASE}/live-cricket-scores/{ids[mid]}"))
            doc = state(text, rosters[mid], fmt, match_id=ids[mid])
            if not doc:
                continue
            if "innings" in doc:
                seen = outs.get(mid)
                if not seen or seen[:2] != (doc["innings"], doc["wickets"]):
                    card = flight(_safe(page, f"{BASE}/live-cricket-scorecard/{ids[mid]}"))
                    names = out_batters(card, doc["innings"], ids[mid])
                    outs[mid] = (doc["innings"], doc["wickets"], names)
                doc = state(text, rosters[mid], fmt, outs[mid][2], ids[mid])
            key = change_key(doc, FORMAT_RULES.get(fmt, FORMAT_RULES["T20"])["bpo"])
            if key != last.get(mid):
                writer.write(mid, doc)
                last[mid] = key
                click.echo(f"{mid}: {doc.get('state')} {doc.get('runs', '')}/{doc.get('wickets', '')} "
                           f"({doc.get('overs', '')} ov)")
            if any(w in (doc.get("state") or "").lower() for w in FINISHED):
                done.add(mid)
        if once or time.monotonic() + POLL > end:
            return
        time.sleep(POLL)


def _safe(page, url: str) -> str:
    try:
        return page(url)
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        log.warning("%s: %s", url, e)
        return ""


def probe(page_id: int) -> None:
    """What we read from one page match (no fixture, no writes): a check that the page format hasn't changed."""
    listing = match_list(_safe(get, LIST))
    click.echo(f"match list: {len(listing)} matches; ids {[m.get('matchId') for m in listing[:12]]}")
    text = flight(_safe(get, f"{BASE}/live-cricket-scores/{page_id}"))
    mini, head = first(text, "miniscore", page_id), first(text, "matchHeader", page_id) or {}
    click.echo(f"header: {head.get('state')} | {head.get('status')} | teams "
               f"{(head.get('team1') or {}).get('name')} v {(head.get('team2') or {}).get('name')}")
    if mini:
        inn = (mini.get("matchScoreDetails") or {}).get("inningsScoreList")
        click.echo(f"miniscore: innings {mini.get('inningsId')} {mini.get('batTeam')} overs {mini.get('overs')} "
                   f"target {mini.get('target')} striker {(mini.get('batsmanStriker') or {}).get('name')} "
                   f"non-striker {(mini.get('batsmanNonStriker') or {}).get('name')} innings list {inn}")
        card = flight(_safe(get, f"{BASE}/live-cricket-scorecard/{page_id}"))
        click.echo(f"out this innings: {out_batters(card, int(mini.get('inningsId') or 1), page_id)}")
    else:
        click.echo("no miniscore on the page")


@click.command()
@click.option("--probe", "probe_id", type=int, default=None, help="Print what we read from one page match and stop")
@click.option("--fixtures", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--dry-run", is_flag=True, help="Print the live docs instead of writing them")
@click.option("--once", is_flag=True, help="One poll, then stop")
@click.option("--max-minutes", default=340.0, help="Stop polling after this long (the next scheduled run takes over)")
def main(probe_id: int | None, fixtures: Path, dry_run: bool, once: bool, max_minutes: float) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if probe_id:
        probe(probe_id)
        return
    run(fixtures, dry_run, once, max_minutes)


if __name__ == "__main__":
    main()
