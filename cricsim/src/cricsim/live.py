"""Live match state for the match centre's live projection: polled from the public match page (cricsim.khelnow)
while our published matches are on, and written to Firestore live/{id} when an over ends, a wicket falls or the
match state changes. Browsers re-simulate the rest of the match from that state (app/components/LiveProjection.tsx);
we publish projections, never a score feed.

python -m cricsim.live --fixtures cricsim/fixtures [--dry-run] [--once] [--max-minutes 340]

Run by .github/workflows/live.yml (every 30 minutes; each run loops while a match is on). One page request every
30 seconds per live match (the page carries the score, both innings and every ball); the sitemap once per run,
to find a match's page when the fixture doesn't name it.
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click

from cricsim import khelnow as kn
from cricsim.engine.states import FORMAT_RULES
from cricsim.results import Roster, _fetch, kickoff

log = logging.getLogger("cricsim.live")

DURATION = {"T20": 4.5, "T10": 2.5, "HUNDRED": 3.5, "OD": 9.5}     # hours after the start we keep polling
EARLY = timedelta(minutes=20)                                      # before the start: toss and XIs
POLL = 30                                                          # seconds between polls of a live match
ROSTER_REFRESH = 600                                               # seconds before re-reading the published XIs
FINISHED = ("complete", "abandon", "no result", "cancel")


# ── which page is our fixture ─────────────────────────────────────────────────────────────────────────────────────

def find_page(fx: dict, entries: list[dict]) -> str | None:
    """The match page for a fixture: named by the fixture (live.url / live.kn), else the sitemap page on the same day
    whose slug names both sides."""
    lv = fx.get("live") or {}
    if lv.get("url"):
        return lv["url"]
    if lv.get("kn"):
        hit = next((e for e in entries if e["id"] == int(lv["kn"])), None)
        if hit:
            return hit["url"]
    k = kickoff(fx)
    if not k or len(fx.get("teams", [])) != 2:
        return None
    words = [set(kn.tokens(t.get("name", ""))) - kn.GENERIC for t in fx["teams"]]
    for e in entries:
        if not e["date"] or abs((e["date"] - k.date()).days) > 1:
            continue
        slug = set(kn.tokens(e["url"].rsplit("/", 1)[-1].replace("-", " ")))
        if all(w and len(w & slug) >= max(1, len(w) - 1) for w in words):
            return e["url"]
    return None


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


def run(fixtures: Path, dry: bool, once: bool, max_minutes: float, fetch=_fetch, page=kn.get) -> None:
    writer, end = Writer(dry), time.monotonic() + max_minutes * 60
    urls: dict[str, str] = {}
    rosters: dict[str, Roster] = {}
    fetched: dict[str, float] = {}
    last: dict[str, tuple] = {}
    done: set[str] = set()
    entries: list[dict] | None = None
    while True:
        now = datetime.now(timezone.utc)
        fxs = {p.stem: json.loads(p.read_text()) for p in sorted(fixtures.glob("*.json"))}
        live = {m: fx for m, fx in fxs.items() if m not in done and window(fx, now) == "on"}
        if not live and not any(window(fx, now) == "soon" for m, fx in fxs.items() if m not in done):
            click.echo("no match on now or within 35 minutes")
            return
        for mid, fx in live.items():
            if mid not in urls:
                if entries is None and not (fx.get("live") or {}).get("url"):
                    entries = kn.sitemap(kn.safe(page, kn.SITEMAP))
                found = find_page(fx, entries or [])
                if not found:
                    click.echo(f"{mid}: no match page yet")
                    continue
                urls[mid] = found
                click.echo(f"{mid}: {found}")
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
            doc = kn.live_state(kn.match(urls[mid], page), rosters[mid], fmt)
            if not doc:
                continue
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


@click.command()
@click.option("--probe", "probe_url", default=None, help="Print what we read from one match page and stop")
@click.option("--fixtures", type=click.Path(exists=True, path_type=Path), default=Path("cricsim/fixtures"))
@click.option("--dry-run", is_flag=True, help="Print the live docs instead of writing them")
@click.option("--once", is_flag=True, help="One poll, then stop")
@click.option("--max-minutes", default=340.0, help="Stop polling after this long (the next scheduled run takes over)")
def main(probe_url: str | None, fixtures: Path, dry_run: bool, once: bool, max_minutes: float) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if probe_url:
        kn.probe.callback(probe_url)
        return
    run(fixtures, dry_run, once, max_minutes)


if __name__ == "__main__":
    main()
