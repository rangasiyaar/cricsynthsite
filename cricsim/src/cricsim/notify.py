"""Match alerts for the Android app (Firebase Cloud Messaging topics; free).

    python -m cricsim.notify plan --publish data/publish --out data/notify.json    # before deploying: compare with the live site
    python -m cricsim.notify send --plan data/notify.json --project <gcp project> # after deploying (FCM_ACCESS_TOKEN set)

Two topics, matching the app's switches (app/lib/native.ts):
- "forecasts": a match is published for the first time;
- "xis": a published match's playing XIs changed (the forecast was re-run with the named teams).
A nightly refit re-runs every forecast but changes neither, so it sends nothing. Only matches yet to start are
announced, at most MAX_ALERTS per run.
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


def plan(new_index: dict, old_index: dict | None, new_doc, old_doc, now: datetime | None = None) -> list[dict]:
    """Alerts for this publish. `new_doc(id)` / `old_doc(id)` return a match document (old: the live one, or None)."""
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
            before, after = _xis(old_doc(c["id"])), _xis(new_doc(c["id"]))
            if before is not None and after is not None and before != after:
                alerts.append({**msg, "topic": "xis", "title": f"Playing XIs named: {short}",
                               "body": f"Forecast re-run with the confirmed teams · {_line(c)}"})
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
    alerts = plan(new_index, _fetch("index.json"), new_doc, lambda i: _fetch(f"matches/{i}.json"))
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


if __name__ == "__main__":
    main()
