"""Match alerts for the Android app (Firebase Cloud Messaging topics; free).

    python -m cricsim.notify plan --publish data/publish --out data/notify.json    # before deploying: compare with the live site
    python -m cricsim.notify send --plan data/notify.json --project <gcp project> # after deploying (FCM_ACCESS_TOKEN set)

Topics, matching the app's switches (app/lib/native.ts). From the site update (`plan`, comparing with the live site):
- "forecasts": a match is published for the first time;
- "xis": a published match's playing XIs changed (the forecast was re-run with the named teams), with our captain;
- "results": a finished match was scored ("Renegades won by 4 wickets · we had them 57%").
From the auto loop every few minutes (`timed`, remembering what it sent in cricsim/alerts/sent.json):
- "soon": a published match starts in about 30 minutes;
- "today": once a day around 9:00 IST, the day's published matches.
A nightly refit re-runs every forecast but changes none of these, so it sends nothing. At most MAX_ALERTS per run.

    python -m cricsim.notify timed --project <gcp project> --state cricsim/alerts/sent.json
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click

from cricsim.results import _fetch

MAX_ALERTS = 6
IST = timezone(timedelta(hours=5, minutes=30))


def kickoff(card: dict) -> datetime | None:
    if not card.get("date"):
        return None
    t = card.get("start_time") or "23:59"
    try:
        return datetime.fromisoformat(f"{card['date']}T{t[:5]}").replace(tzinfo=IST)
    except ValueError:
        return None


def _xis(doc: dict | None) -> list[list[str]] | None:
    if not doc:
        return None
    return [list(t.get("players") or []) for t in doc.get("match", {}).get("teams", [])]


def _line(card: dict) -> str:
    """'India Women 78% to win · 23 Oct, 2:00 PM IST'"""
    win = card.get("win") or {}
    fav = max(win, key=win.get) if win else None
    parts = [f"{fav} {round(100 * win[fav])}% to win"] if fav else []
    k = kickoff(card)
    if k and card.get("start_time"):
        parts.append(k.strftime("%-d %b, %-I:%M %p IST"))
    elif k:
        parts.append(k.strftime("%-d %b"))
    return " · ".join(parts)


def _captain(doc: dict | None) -> str | None:
    f = (doc or {}).get("fantasy") or {}
    c = (f.get("single") or {}).get("captain")
    return ((f.get("players") or {}).get(c) or {}).get("name") if c else None


def plan(new_index: dict, old_index: dict | None, new_doc, old_doc, now: datetime | None = None,
         new_results: dict | None = None, old_results: dict | None = None, result_doc=None) -> list[dict]:
    """Alerts for this publish. `new_doc(id)` / `old_doc(id)` return a match document (old: the live one, or None);
    `new_results` / `old_results` are the results indexes (old: live) and `result_doc(id)` a scored match."""
    now = now or datetime.now(timezone.utc)
    old = {c["id"]: c for c in (old_index or {}).get("matches", [])}
    alerts: list[dict] = []
    for c in new_index.get("matches", []):
        k = kickoff(c)
        if not c.get("published") or (k is not None and k <= now):
            continue
        short = " v ".join(t["short"] for t in c["teams"])
        msg = {"match": c["id"], "path": f"/m/match/?id={c['id']}"}
        if c["id"] not in old:
            if old_index is None:
                continue                      # no live index to compare with: don't announce everything
            alerts.append({**msg, "topic": "forecasts", "title": f"New forecast: {short}", "body": _line(c)})
        elif c.get("generated_at") != old[c["id"]].get("generated_at"):
            nd = new_doc(c["id"])
            before, after = _xis(old_doc(c["id"])), _xis(nd)
            if before is not None and after is not None and before != after:
                cap = _captain(nd)
                alerts.append({**msg, "topic": "xis", "title": f"Playing XIs named: {short}",
                               "body": " · ".join(x for x in (f"Captain: {cap}" if cap else "", _line(c)) if x)})
    if new_results is not None and old_results is not None:
        seen = {r["id"] for r in old_results.get("matches", [])}
        for r in new_results.get("matches", []):
            if r["id"] in seen or not r.get("result"):
                continue
            d = result_doc(r["id"]) if result_doc else None
            win = ((d or {}).get("forecast") or {}).get("win") or {}
            winner = r.get("winner")
            had = f" · we had them {round(100 * win[winner])}%" if winner and winner in win else ""
            short = " v ".join(t.get("short") or t["name"] for t in r.get("teams", []))
            alerts.append({"match": r["id"], "path": f"/m/match/?id={r['id']}", "topic": "results",
                           "title": f"Result: {short}", "body": f"{r['result']}{had}"})
    alerts.sort(key=lambda a: a["topic"] != "xis")      # named XIs first: they matter most close to the start
    return alerts[:MAX_ALERTS]


def fcm_message(alert: dict) -> dict:
    return {"message": {
        "topic": alert["topic"],
        "notification": {"title": alert["title"], "body": alert["body"]},
        "data": {"path": alert["path"], "match": alert["match"]},
        "android": {"priority": "high", "collapse_key": f"{alert['topic']}-{alert['match']}"},
    }}


def send(alerts: list[dict], project: str, token: str) -> int:
    sent = 0
    for a in alerts:
        req = urllib.request.Request(f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
                                     data=json.dumps(fcm_message(a)).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30):
                sent += 1
        except urllib.error.HTTPError as e:
            click.echo(f"FCM refused {a['topic']} {a['match']}: {e.code} {e.read()[:300]!r}", err=True)
    return sent


@click.group()
def main() -> None:
    """Match alerts for the app."""


@main.command("plan")
@click.option("--publish", type=click.Path(exists=True, path_type=Path), required=True, help="the new data/publish")
@click.option("--out", type=click.Path(path_type=Path), required=True)
def plan_cmd(publish: Path, out: Path) -> None:
    new_index = json.loads((publish / "index.json").read_text())
    def new_doc(i: str):
        f = publish / "matches" / f"{i}.json"
        return json.loads(f.read_text()) if f.exists() else None
    rp = publish / "results" / "index.json"
    def result_doc(i: str):
        f = publish / "results" / f"{i}.json"
        return json.loads(f.read_text()) if f.exists() else None
    alerts = plan(new_index, _fetch("index.json"), new_doc, lambda i: _fetch(f"matches/{i}.json"),
                  new_results=json.loads(rp.read_text()) if rp.exists() else None,
                  old_results=_fetch("results/index.json"), result_doc=result_doc)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(alerts, indent=1) + "\n")
    click.echo(f"{len(alerts)} alert(s)" + "".join(f"\n- [{a['topic']}] {a['title']} — {a['body']}" for a in alerts))


@main.command("send")
@click.option("--plan", "plan_file", type=click.Path(exists=True, path_type=Path), required=True)
@click.option("--project", required=True)
def send_cmd(plan_file: Path, project: str) -> None:
    alerts = json.loads(plan_file.read_text())
    token = os.environ.get("FCM_ACCESS_TOKEN", "")
    if not alerts:
        click.echo("No alerts to send"); return
    if not token:
        raise click.ClickException("FCM_ACCESS_TOKEN is not set")
    click.echo(f"Sent {send(alerts, project, token)} of {len(alerts)} alert(s)")


SOON_MIN = 30          # "starting soon" goes out this many minutes before the start (± one loop pass)
TODAY_AT = (9, 0)      # "today's matches" from this IST time, once a day


def timed(index: dict, sent: dict, now: datetime | None = None) -> list[dict]:
    """The time-based alerts due now that haven't been sent: "soon" per match and one "today" per day.
    `sent` (alert key -> ISO time) is updated in place with what this returns."""
    now = now or datetime.now(timezone.utc)
    out: list[dict] = []
    cards = [c for c in index.get("matches", []) if c.get("published")]
    for c in cards:
        k = kickoff(c)
        if not k or not c.get("start_time"):
            continue
        mins = (k - now).total_seconds() / 60
        key = f"soon:{c['id']}"
        if 0 < mins <= SOON_MIN + 5 and key not in sent:
            short = " v ".join(t["short"] for t in c["teams"])
            win = c.get("win") or {}
            fav = max(win, key=win.get) if win else None
            body = " · ".join(x for x in (f"Starts {k.strftime('%-I:%M %p')} IST", f"{fav} {round(100 * win[fav])}% to win" if fav else "",
                                          "XIs in" if c.get("xis") else "") if x)
            out.append({"match": c["id"], "path": f"/m/match/?id={c['id']}", "topic": "soon",
                        "title": f"{short} starts in {max(1, round(mins))} min", "body": body})
            sent[key] = now.isoformat(timespec="minutes")
    local = now.astimezone(IST)
    key = f"today:{local.date().isoformat()}"
    if (local.hour, local.minute) >= TODAY_AT and local.hour < 21 and key not in sent:
        todays = [c for c in cards if c.get("date") == local.date().isoformat() and (kickoff(c) or now) > now]
        if todays:
            comps = list(dict.fromkeys((c.get("competition") or "").split(" · ")[0] for c in todays if c.get("competition")))
            first = min(todays, key=lambda c: kickoff(c) or now)
            out.append({"match": f"today-{local.date().isoformat()}", "path": "/m/matches/", "topic": "today",
                        "title": f"{len(todays)} match{'es' if len(todays) > 1 else ''} today",
                        "body": " · ".join(x for x in (", ".join(comps[:3]),
                                                       f"first at {kickoff(first).strftime('%-I:%M %p')} IST" if first.get("start_time") else "") if x)})
        sent[key] = now.isoformat(timespec="minutes")
    cutoff = (now - timedelta(days=3)).isoformat()
    for k2 in [k2 for k2, v in sent.items() if v < cutoff]:
        del sent[k2]
    return out[:MAX_ALERTS]


@main.command("timed")
@click.option("--project", required=True)
@click.option("--state", type=click.Path(path_type=Path), required=True, help="what was sent (kept in the repo)")
@click.option("--dry-run", is_flag=True)
def timed_cmd(project: str, state: Path, dry_run: bool) -> None:
    """Send the time-based alerts that are due (match starting soon, today's matches)."""
    index = _fetch("index.json")
    if not index:
        click.echo("No live index"); return
    sent = json.loads(state.read_text()) if state.exists() else {}
    alerts = timed(index, sent)
    if not alerts:
        click.echo("No timed alerts due"); return
    for a in alerts:
        click.echo(f"- [{a['topic']}] {a['title']} — {a['body']}")
    if dry_run:
        return
    token = os.environ.get("FCM_ACCESS_TOKEN", "")
    if not token:
        raise click.ClickException("FCM_ACCESS_TOKEN is not set")
    click.echo(f"Sent {send(alerts, project, token)} of {len(alerts)} alert(s)")
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(json.dumps(sent, indent=1, sort_keys=True) + "\n")


@main.command("test")
@click.option("--topic", type=click.Choice(["forecasts", "xis", "soon", "results", "today"]), default="forecasts")
@click.option("--project", required=True)
def test_cmd(topic: str, project: str) -> None:
    """Send one test alert to a topic: every phone with that switch on should get it."""
    token = os.environ.get("FCM_ACCESS_TOKEN", "")
    if not token:
        raise click.ClickException("FCM_ACCESS_TOKEN is not set")
    alert = {"topic": topic, "match": "test", "path": "/m/matches/", "title": "Test alert from CricSynthesis",
             "body": "Match alerts are working. Tap to open the matches."}
    if not send([alert], project, token):
        raise click.ClickException("FCM refused the test alert (see above)")
    click.echo(f"Sent a test alert to the '{topic}' topic")


if __name__ == "__main__":
    main()
