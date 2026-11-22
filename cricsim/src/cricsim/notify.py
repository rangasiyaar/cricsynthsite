"""Match alerts for the Android app (Firebase Cloud Messaging topics; free).

    python -m cricsim.notify plan --publish data/publish --out data/notify.json    # before deploying: compare with the live site
    python -m cricsim.notify send --plan data/notify.json --project <gcp project> # after deploying (FCM_ACCESS_TOKEN set)

Topics, matching the app's switches (app/lib/native.ts). From the site update (`plan`, comparing with the live site):
- "forecasts" (Fixture added): a match is published for the first time;
- "xis" (Playing XI announced): a published match's playing XIs changed (the forecast was re-run with the named teams);
- "results": a finished match was scored ("Renegades won by 4 wickets · we had them 57%").
From the auto loop every few minutes (`timed`, remembering what it sent in cricsim/alerts/sent.json):
- "soon" (Match about to start): a published match starts in about 30 minutes, with a nudge to make a fantasy team;
- update reminders at 10:00, 14:00 and 19:00 IST to phones on an older app build (each phone with "App updates" on
  subscribes to the topic build-<its build>), until they update.
A nightly refit re-runs every forecast but changes none of these, so it sends nothing. At most MAX_ALERTS per run.

    python -m cricsim.notify timed --project <gcp project> --state cricsim/alerts/sent.json
"""
from __future__ import annotations

import json
import os
import time
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


def _when(card: dict) -> str:
    """'23 Nov, 7:30 PM' (or just '23 Nov' without a start time)."""
    k = kickoff(card)
    if not k:
        return ""
    return k.strftime("%-d %b, %-I:%M %p") if card.get("start_time") else k.strftime("%-d %b")


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
            names = " v ".join(t["name"] for t in c["teams"])
            when = _when(c)
            alerts.append({**msg, "topic": "forecasts", "title": f"New match added: {short}",
                           "body": f"{names}{f', {when}' if when else ''}. See who's favourite and the likely scores."})
        elif c.get("generated_at") != old[c["id"]].get("generated_at"):
            nd = new_doc(c["id"])
            before, after = _xis(old_doc(c["id"])), _xis(nd)
            if before is not None and after is not None and before != after:
                cap = _captain(nd)
                alerts.append({**msg, "topic": "xis", "title": f"Playing XIs are out: {short}",
                               "body": "See both line-ups and our updated forecast." + (f" Our captain pick: {cap}." if cap else "")})
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
    """To a topic, or (update reminders) to a condition over build topics."""
    target = {"condition": alert["condition"]} if alert.get("condition") else {"topic": alert["topic"]}
    return {"message": {
        **target,
        "notification": {"title": alert["title"], "body": alert["body"]},
        "data": {"path": alert["path"], "match": alert["match"]},
        "android": {"priority": "high", "collapse_key": f"{alert['topic']}-{alert['match']}"},
    }}


def _post(alert: dict, project: str, token: str) -> tuple[bool, bool]:
    """(delivered, worth retrying): a 429 / 5xx / network error may pass on a second try; a 4xx won't."""
    req = urllib.request.Request(f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
                                 data=json.dumps(fcm_message(alert)).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True, False
    except urllib.error.HTTPError as e:
        click.echo(f"FCM refused {alert['topic']} {alert['match']}: {e.code} {e.read()[:300]!r}", err=True)
        return False, e.code == 429 or e.code >= 500
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        click.echo(f"FCM unreachable for {alert['topic']} {alert['match']}: {e}", err=True)
        return False, True


def send(alerts: list[dict], project: str, token: str, post=_post, pause=time.sleep) -> list[dict]:
    """Sends each alert (one retry after a short pause when the failure looks temporary); returns those delivered."""
    done = []
    for a in alerts:
        ok, again = post(a, project, token)
        if not ok and again:
            pause(3)
            ok, _ = post(a, project, token)
        if ok:
            done.append(a)
    return done


def report(planned: list[dict], delivered: list[dict]) -> str:
    missed = [a for a in planned if a not in delivered]
    line = f"Sent {len(delivered)} of {len(planned)} alert(s)"
    return line + "".join(f"\n::warning::Alert not delivered: [{a['topic']}] {a['title']}" for a in missed)


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
    click.echo(report(alerts, send(alerts, project, token)))   # a miss is flagged on the run, not fatal to the publish


SOON_MIN = 30          # "about to start" goes out this many minutes before the start (± one loop pass)
UPDATE_AT = [(10, 0), (14, 0), (19, 0)]   # update reminders, IST, each within 2 hours of its time
UPDATE_TOPICS = 25     # the most recent older builds reminded (5 topics per message: at most 5 messages)


def timed(index: dict, sent: dict, now: datetime | None = None) -> list[dict]:
    """The "about to start" alerts due now that haven't been delivered (at most MAX_ALERTS; the rest come next pass).
    Each carries its `key`; the caller records in `sent` (alert key -> ISO time) only the ones delivered."""
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
            out.append({"key": key, "match": c["id"], "path": f"/m/match/?id={c['id']}", "topic": "soon",
                        "title": f"{short} starts in {max(1, round(mins))} minutes",
                        "body": "Still building your fantasy team? See our top picks, captain choice and team suggestions before the start."})
    cutoff = (now - timedelta(days=3)).isoformat()
    for k2 in [k2 for k2, v in sent.items() if v < cutoff]:
        del sent[k2]
    return out[:MAX_ALERTS]


@main.command("timed")
@click.option("--project", required=True)
@click.option("--state", type=click.Path(path_type=Path), required=True, help="what was sent (kept in the repo)")
@click.option("--dry-run", is_flag=True)
def timed_cmd(project: str, state: Path, dry_run: bool) -> None:
    """Send the time-based alerts that are due (match about to start, update reminders)."""
    index = _fetch("index.json")
    if not index:
        click.echo("No live index"); return
    sent = json.loads(state.read_text()) if state.exists() else {}
    alerts = timed(index, sent) + update_reminders(_releases(), sent)
    if not alerts:
        click.echo("No timed alerts due"); return
    for a in alerts:
        click.echo(f"- [{a['topic']}] {a['title']} — {a['body']}")
    if dry_run:
        return
    token = os.environ.get("FCM_ACCESS_TOKEN", "")
    if not token:
        raise click.ClickException("FCM_ACCESS_TOKEN is not set")
    delivered = send(alerts, project, token)
    record(sent, delivered)                       # only what went out: a refused alert is tried again next pass
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(json.dumps(sent, indent=1, sort_keys=True) + "\n")
    click.echo(report(alerts, delivered))
    if len(delivered) < len(alerts):
        raise click.ClickException(f"{len(alerts) - len(delivered)} alert(s) not delivered; they'll be retried next pass")


def record(sent: dict, delivered: list[dict], now: datetime | None = None) -> None:
    stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="minutes")
    for a in delivered:
        sent[a["key"]] = stamp


def _update_copy(version: str) -> dict:
    return {"title": "Update CricSynthesis", "body": f"Version {version} is ready, with fixes and improvements. Tap to update."}


def release_alert(version: str, build: int) -> dict:
    """The "new version" alert for one release, to every phone with app-update alerts on (what's new is in the app's prompt)."""
    return {"topic": "updates", "match": f"app-{build}", "path": "/m/matches/", **_update_copy(version)}


def _releases() -> list[dict]:
    """The app's releases ({version, build, prerelease, published}) from GitHub (the auto loop has GH_TOKEN); [] if unavailable."""
    import re
    import subprocess
    try:
        out = subprocess.run(["gh", "release", "list", "--limit", "60", "--json", "tagName,isPrerelease,publishedAt"],
                             capture_output=True, text=True, timeout=60, check=True).stdout
    except Exception as e:  # noqa: BLE001 - reminders are best effort
        click.echo(f"no release list: {e}", err=True)
        return []
    rows = []
    for r in json.loads(out or "[]"):
        m = re.match(r"android-v(.+)-build(\d+)$", r.get("tagName") or "")
        if m:
            rows.append({"version": m.group(1), "build": int(m.group(2)), "prerelease": bool(r.get("isPrerelease")),
                         "published": r.get("publishedAt") or ""})
    return rows


def update_reminders(releases: list[dict], sent: dict, now: datetime | None = None) -> list[dict]:
    """At 10:00, 14:00 and 19:00 IST: "Update CricSynthesis" to phones on any older build (topics build-<n>), until they
    update. Waits 30 minutes after a release so the site offers it first. Returns the messages not yet delivered in
    this slot (the caller records the delivered ones in `sent`)."""
    now = now or datetime.now(timezone.utc)
    full = [r for r in releases if not r["prerelease"]]
    if not full:
        return []
    latest = max(full, key=lambda r: r["build"])
    try:
        published = datetime.fromisoformat(latest["published"].replace("Z", "+00:00"))
    except ValueError:
        return []
    if now - published < timedelta(minutes=30):
        return []
    local = now.astimezone(IST)
    due = None
    for h, m in UPDATE_AT:
        at = local.replace(hour=h, minute=m, second=0, microsecond=0)
        if at <= local < at + timedelta(hours=2):
            due = f"update:{local.date().isoformat()}:{h:02d}"
    if not due:
        return []
    older = sorted({r["build"] for r in releases if r["build"] < latest["build"]}, reverse=True)[:UPDATE_TOPICS]
    out = []
    for i in range(0, len(older), 5):                 # one message per 5 builds (FCM's limit per condition), each tracked
        chunk = older[i:i + 5]
        key = f"{due}:{chunk[0]}"
        if key not in sent:
            out.append({"key": key, "topic": "updates", "match": f"app-{latest['build']}", "path": "/m/matches/",
                        **_update_copy(latest["version"]), "condition": " || ".join(f"'build-{b}' in topics" for b in chunk)})
    return out


@main.command("release")
@click.option("--version", "version", required=True)
@click.option("--build", type=int, required=True)
@click.option("--project", required=True)
@click.option("--dry-run", is_flag=True)
def release_cmd(version: str, build: int, project: str, dry_run: bool) -> None:
    """Tell phones with app-update alerts on that a new version is out (sent once, by the release job)."""
    alert = release_alert(version, build)
    click.echo(f"[updates] {alert['title']} — {alert['body']}")
    if dry_run:
        return
    token = os.environ.get("FCM_ACCESS_TOKEN", "")
    if not token:
        raise click.ClickException("FCM_ACCESS_TOKEN is not set")
    if not send([alert], project, token):
        raise click.ClickException("FCM refused the update alert (see above)")


@main.command("test")
@click.option("--topic", type=click.Choice(["forecasts", "xis", "soon", "results", "updates"]), default="forecasts")
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
