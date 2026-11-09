"""Instagram carousels for covered matches, to be posted two hours before the start.

Run from the auto loop every few minutes (`run`, remembering what it posted in cricsim/social/posted.json):

- Covered: Women's Big Bash League, Nepal Premier League, and internationals between two Test-playing nations
  (men's and women's; A sides, Lions and age-group teams are not national sides and are left out).
- Two hours before each covered match's start (with or without the playing XIs), the match's published Overview is
  drawn as six 1080x1350 slides, one per Overview block (carousel.html, rendered by render.mjs): projected scores
  (with the win chance), key duel, fall of wickets, players to watch, the ground, fantasy picks.
- Email (the default, for posting by hand): when RESEND_API_KEY and SOCIAL_EMAIL_TO are set, the six JPEGs and the
  caption are emailed 20 minutes before the posting time (SOCIAL_FROM sets the sender; the domain must be verified
  in Resend).
- Direct posting (optional): with IG_ACCESS_TOKEN and IG_USER_ID instead, the slides are pushed to the repository's
  `social` branch (Instagram fetches images from public URLs) and published through the Instagram Graph API at
  exactly start minus two hours.

    python -m cricsim.social run --state cricsim/social/posted.json        # email or post whatever is due
    python -m cricsim.social preview --match <id> --out <dir>               # slides + caption only
"""
from __future__ import annotations

import base64
import html
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click

from cricsim.notify import IST, kickoff
from cricsim.results import _fetch

HERE = Path(__file__).parent
LEAD = timedelta(hours=2)            # post this long before the start
EARLY = timedelta(minutes=6)         # prepare a due post this early (the loop passes every 5 minutes)
LATE = timedelta(minutes=25)         # still post if the loop was this late; after that, skip the match
EMAIL_AHEAD = timedelta(minutes=20)  # email the slides this long before the posting time
BRANCH = "social"

TEST_NATIONS = {"India", "Australia", "England", "South Africa", "New Zealand", "Pakistan", "Sri Lanka",
                "West Indies", "Bangladesh", "Afghanistan", "Ireland", "Zimbabwe"}
LEAGUES = [("wbbl", re.compile(r"Women's Big Bash League|\bWBBL\b")),
           ("npl", re.compile(r"Nepal Premier League|\bNPL\b"))]
HASHTAGS = {
    "wbbl": "#WBBL #WomensBigBashLeague #WomensCricket #BBL #CricketAustralia",
    "npl": "#NPL #NepalPremierLeague #NepalCricket",
    "intl": "#InternationalCricket",
}
COMMON = "#Cricket #CricketLovers #CricketAnalytics #MatchPrediction #FantasyCricket #CricSynthesis"
_ID = re.compile(r"^(kn:\d+|[0-9a-f]{8})$")          # a player we only know by id (no name yet)


def _named(n: str | None) -> bool:
    return bool(n) and not _ID.match(n)


# ── which matches, and when ──────────────────────────────────────────────────────────────────────────────────

def league(card: dict) -> str | None:
    """'wbbl', 'npl' or 'intl' for a covered match, else None."""
    comp = card.get("competition") or ""
    for key, rx in LEAGUES:
        if rx.search(comp):
            return key
    names = [t.get("name", "") for t in card.get("teams", [])]
    if len(names) != 2:
        return None
    women = [n.endswith(" Women") for n in names]
    base = [n[:-6] if w else n for n, w in zip(names, women)]
    return "intl" if women[0] == women[1] and all(b in TEST_NATIONS for b in base) else None


def due(index: dict, posted: dict, now: datetime, ahead: timedelta = timedelta(0)) -> list[tuple[dict, datetime]]:
    """Covered, published, not yet started matches whose time to act (start minus two hours, minus `ahead`) is within
    the next few minutes or only just passed, and that haven't been handled. Returns (card, posting time)."""
    out = []
    for c in index.get("matches", []):
        k = kickoff(c) if c.get("start_time") else None
        if not k or c["id"] in posted or not c.get("published", True) or not league(c):
            continue
        if c.get("status") in ("started", "finished", "result", "abandoned"):
            continue
        at = k - LEAD
        if -LATE <= at - ahead - now <= EARLY:
            out.append((c, at))
    return sorted(out, key=lambda x: x[1])


# ── what goes on the slides ──────────────────────────────────────────────────────────────────────────────────

def _wicket_overs(t: dict, overs: int) -> list[int]:
    return [min(overs, max(1, math.ceil(f["over"]["q"]["50"]))) for f in t["batting"]["fall_of_wickets"]
            if f.get("p", 0) >= .5 and (f.get("over") or {}).get("q", {}).get("50") is not None]


def carousel_data(doc: dict, venue: dict | None) -> dict:
    """The figures of the match centre's Overview blocks (app/components/Snapshot.tsx), for the six slides."""
    m, s = doc["match"], doc["summary"]
    names = {p["id"]: p["name"] for t in s["teams"] for p in t["players"]}
    short = [t["short"] for t in m["teams"]]
    overs = s["meta"]["rules"]["overs"]
    curve = s["result"].get("win_by_first_innings") or []
    par = next((r["from"] for r in curve if r["p_win"] >= .5), None) if len(curve) >= 3 else None
    teams = []
    for k, t in enumerate(s["teams"]):
        b, q = t["batting"], t["batting"]["score"]["q"]
        pp = next((p for p in b["phases"] if p["phase"] == "Powerplay"), None)
        bats = sorted([p for p in t["players"] if p.get("batting") and _named(p["name"])],
                      key=lambda p: -(p["batting"]["runs"]["mean"] or 0))[:3]
        bowls = sorted([p for p in t["players"] if p.get("bowling") and p["bowling"]["p_bowls"] > .5 and _named(p["name"])],
                       key=lambda p: -(p["bowling"]["wickets"]["mean"] or 0))[:3]
        fow = (b["fall_of_wickets"] or [{}])[0].get("over") or {}
        teams.append({
            "name": t["name"], "short": short[k], "win": s["result"]["win"][t["name"]],
            "med": round(q["50"]), "lo": round(q["25"]), "hi": round(q["75"]), "p10": round(q["10"]), "p90": round(q["90"]),
            "pp": [round(pp["runs"]["mean"]), round(pp["wickets"]["mean"], 1)] if pp else None,
            "runs": [o["runs"] for o in b["per_over"]], "pw": [o["p_wicket"] for o in b["per_over"]],
            "wkt_overs": _wicket_overs(t, overs),
            "first_wkt": round(fow["q"]["50"]) if fow.get("q") else None, "wickets": round(b["wickets"]["mean"], 1),
            "phases": [[p["phase"], p["overs"], round(p["wickets"]["mean"], 1)] for p in b["phases"]],
            "bats": [[p["name"], round(p["batting"]["runs"]["mean"])] for p in bats],
            "bowls": [[p["name"], round(p["bowling"]["wickets"]["mean"], 1)] for p in bowls],
        })
    duels = [[names[x["bowler"]], names[x["batter"]], x["p"]] for x in s.get("matchups", [])
             if _named(names.get(x["bowler"])) and _named(names.get(x["batter"]))][:3]
    ground = None
    h = (venue or {}).get("history")
    if h and h.get("matches") and h.get("recent"):
        here = (venue.get("bowling") or {}).get("here") or {}
        fi = h["first_innings"]
        ground = {"first": round(fi.get("median") or fi["mean"]),
                  "chase": None if h.get("bat_first_won") is None else 1 - h["bat_first_won"],
                  "pace": (here.get("pace") or {}).get("share_of_wickets"), "spin": (here.get("spin") or {}).get("share_of_wickets"),
                  "recent": [r["first"]["runs"] for r in reversed(h["recent"])][-10:], "avg": fi["mean"], "matches": h["matches"]}
    fant, f = None, doc.get("fantasy")
    if f and f.get("single"):
        def pick(i: str) -> list:
            return [f["players"].get(i, {}).get("name") or names.get(i, i), short[f["players"].get(i, {}).get("team", 0)]]
        sg = f["single"]
        must = sorted([p for p in sg["players"] if p not in (sg["captain"], sg["vice_captain"])],
                      key=lambda p: -(f["players"].get(p, {}).get("expected") or 0))[:3]
        fant = {"c": pick(sg["captain"]), "vc": pick(sg["vice_captain"]), "must": [pick(p) for p in must]}
    return {"match": {k: m.get(k) for k in ("id", "competition", "date", "start_time", "venue", "format", "gender", "xis")},
            "overs": overs, "pp": s["meta"]["rules"].get("pp", 0), "par": par, "teams": teams, "duels": duels,
            "ground": ground, "fantasy": fant}


def caption(data: dict, lg: str) -> str:
    """Short, factual, no betting words; the numbers match slides 1, 2 and 6."""
    a, b = data["teams"]
    comp = re.sub(r"\s*\b\d{4}\b\s*", " ", data["match"]["competition"] or "").strip()
    fav = a if a["win"] >= b["win"] else b
    gap = abs(a["win"] - b["win"])
    lines = [f"{a['name']} v {b['name']}", comp, ""]
    lines.append("Too close to call: " if gap < .08 else f"{fav['name']} start ahead: ")
    lines[-1] += f"{a['short']} {round(100 * a['win'])}% · {b['short']} {round(100 * b['win'])}% to win."
    lines.append(f"Projected scores: {a['short']} {a['med']} · {b['short']} {b['med']}.")
    if data["duels"]:
        d = data["duels"][0]
        lines.append(f"Key duel: {d[0]} v {d[1]} ({round(100 * d[2])}% chance of a wicket).")
    if data["fantasy"]:
        lines.append(f"Fantasy captain pick: {data['fantasy']['c'][0]}.")
    if not data["match"].get("xis"):
        lines.append("Playing XIs not announced yet: we project the likeliest XIs.")
    lines += ["", "Swipe for wickets, players to watch, the ground and fantasy picks.",
              "Full match centre free at cricsynthesis.in (link in bio).",
              "Projections, not certainties. For analysis and entertainment.", ""]
    tags = [HASHTAGS[lg], COMMON]
    if lg == "intl":
        tags.insert(0, f"#{a['short']}v{b['short']}")
    lines.append(" ".join(tags))
    return "\n".join(lines)


# ── rendering, hosting, posting ──────────────────────────────────────────────────────────────────────────────

def render(data: dict, out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    (out / "data.json").write_text(json.dumps(data))
    subprocess.run(["node", str(HERE / "render.mjs"), str(out / "data.json"), str(out)], check=True)
    return [out / f"{i}.jpg" for i in range(1, 7)]


def host(slides: dict[str, list[Path]], repo: str, token: str) -> dict[str, list[str]]:
    """Push the slides to the `social` branch (one commit, replacing the last) and return their public URLs."""
    work = Path(tempfile.mkdtemp())
    for mid, paths in slides.items():
        (work / mid).mkdir()
        for p in paths:
            shutil.copy(p, work / mid / p.name)
    (work / "README.md").write_text("Images for the current Instagram posts (cricsim.social). Replaced on every post.\n")
    git = ["git", "-C", str(work), "-c", "user.name=github-actions[bot]",
           "-c", "user.email=41898283+github-actions[bot]@users.noreply.github.com"]
    subprocess.run(git + ["init", "-q", "-b", BRANCH], check=True)
    subprocess.run(git + ["add", "-A"], check=True)
    subprocess.run(git + ["commit", "-q", "-m", "Instagram slides: " + ", ".join(slides)], check=True)
    subprocess.run(git + ["push", "-q", "-f", f"https://x-access-token:{token}@github.com/{repo}.git", f"HEAD:refs/heads/{BRANCH}"],
                   check=True)
    stamp = int(time.time())
    urls = {mid: [f"https://raw.githubusercontent.com/{repo}/{BRANCH}/{mid}/{p.name}?v={stamp}" for p in paths]
            for mid, paths in slides.items()}
    for u in [u for us in urls.values() for u in us]:            # wait until each image is served
        for _ in range(30):
            try:
                with urllib.request.urlopen(u, timeout=20) as r:
                    if r.status == 200 and r.headers.get("Content-Type", "").startswith("image/"):
                        break
            except urllib.error.URLError:
                pass
            time.sleep(4)
        else:
            raise click.ClickException(f"image not served: {u}")
    return urls


class Instagram:
    def __init__(self, user: str, token: str, base: str = "https://graph.facebook.com/v21.0"):
        self.user, self.token, self.base = user, token, base.rstrip("/")

    def _call(self, method: str, path: str, **params) -> dict:
        params["access_token"] = self.token
        data = urllib.parse.urlencode(params).encode()
        url = f"{self.base}/{path}"
        req = urllib.request.Request(url, data=data, method="POST") if method == "POST" else \
            urllib.request.Request(f"{url}?{data.decode()}")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace").replace(self.token, "***")
            raise click.ClickException(f"Instagram {path}: HTTP {e.code} {body[:500]}")

    def prepare(self, images: list[str], text: str) -> str:
        """Upload the slides as carousel items and make the carousel container; returns its id once it's ready."""
        kids = [self._call("POST", f"{self.user}/media", image_url=u, is_carousel_item="true")["id"] for u in images]
        cid = self._call("POST", f"{self.user}/media", media_type="CAROUSEL", children=",".join(kids), caption=text)["id"]
        for _ in range(40):
            st = self._call("GET", cid, fields="status_code").get("status_code")
            if st == "FINISHED":
                return cid
            if st in ("ERROR", "EXPIRED"):
                raise click.ClickException(f"Instagram container {cid}: {st}")
            time.sleep(5)
        raise click.ClickException(f"Instagram container {cid} not ready")

    def publish(self, cid: str) -> str:
        return self._call("POST", f"{self.user}/media_publish", creation_id=cid)["id"]


def email(data: dict, text: str, slides: list[Path], post_at: datetime, key: str, to: str, sender: str) -> str:
    """Send the slides (attached in order) and the caption, for posting by hand; returns the Resend email id."""
    a, b = data["teams"]
    when = post_at.astimezone(IST).strftime("%-I:%M %p")
    comp = re.sub(r"\s*\b\d{4}\b\s*", " ", data["match"]["competition"] or "").strip()
    tag = f"{a['short']}v{b['short']}".lower()
    body = (f"<p>Post this carousel at <b>{when} IST</b>, two hours before the start.</p>"
            f"<p>The six slides are attached in order ({tag}-1.jpg to {tag}-6.jpg). Caption to paste:</p>"
            f"<pre style=\"font:15px/1.5 system-ui,sans-serif;white-space:pre-wrap;background:#f2f2f3;padding:16px;"
            f"border-radius:6px\">{html.escape(text)}</pre>")
    msg = {"from": sender, "to": [x.strip() for x in to.split(",") if x.strip()],
           "subject": f"Post at {when} IST: {a['short']} v {b['short']} · {comp}",
           "html": body, "text": f"Post at {when} IST.\n\n{text}",
           "attachments": [{"filename": f"{tag}-{i}.jpg", "content": base64.b64encode(p.read_bytes()).decode()}
                           for i, p in enumerate(slides, 1)]}
    req = urllib.request.Request("https://api.resend.com/emails", data=json.dumps(msg).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                          "User-Agent": "cricsynthesis-ci"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read()).get("id", "")
    except urllib.error.HTTPError as e:
        raise click.ClickException(f"email: HTTP {e.code} {e.read().decode(errors='replace')[:300]}")


# ── commands ─────────────────────────────────────────────────────────────────────────────────────────────────

@click.group()
def main() -> None:
    """Instagram carousels for covered matches."""


def _match(mid: str) -> tuple[dict, dict | None]:
    doc = _fetch(f"matches/{mid}.json")
    if not doc:
        raise click.ClickException(f"no published match {mid}")
    return doc, _fetch(f"venue/{mid}.json")


@main.command()
@click.option("--match", "mid", required=True)
@click.option("--out", type=click.Path(path_type=Path), required=True)
def preview(mid: str, out: Path) -> None:
    """Draw one match's slides and caption without posting."""
    doc, venue = _match(mid)
    data = carousel_data(doc, venue)
    render(data, out)
    (out / "caption.txt").write_text(caption(data, league(doc["match"]) or "intl"))
    click.echo(f"slides and caption in {out}")


@main.command()
@click.option("--state", type=click.Path(path_type=Path), required=True, help="what was posted (kept in the repo)")
@click.option("--dry-run", is_flag=True, help="list what is due; post nothing")
def run(state: Path, dry_run: bool) -> None:
    """Email (or post) the carousels that are due: posting time is start minus two hours."""
    key, to = os.environ.get("RESEND_API_KEY", ""), os.environ.get("SOCIAL_EMAIL_TO", "")
    mode = "email" if key and to else "instagram"
    index = _fetch("index.json")
    if not index:
        click.echo("No live index"); return
    posted = json.loads(state.read_text()) if state.exists() else {}
    now = datetime.now(timezone.utc)
    todo = due(index, posted, now, EMAIL_AHEAD if mode == "email" else timedelta(0))
    if not todo:
        click.echo("No Instagram posts due"); return
    for c, at in todo:
        click.echo(f"- {c['id']} ({league(c)}): {mode}, post at {at.isoformat(timespec='minutes')}")
    if dry_run:
        return
    if mode == "email":
        sender = os.environ.get("SOCIAL_FROM") or "CricSynthesis <social@cricsynthesis.in>"
        work = Path(tempfile.mkdtemp())
        for c, at in todo:
            try:
                doc, venue = _match(c["id"])
                data = carousel_data(doc, venue)
                sent = email(data, caption(data, league(c)), render(data, work / c["id"]), at, key, to, sender)
            except (click.ClickException, subprocess.CalledProcessError, OSError, KeyError, IndexError, TypeError, ValueError) as e:
                click.echo(f"  {c['id']}: not emailed ({e})"); continue
            posted[c["id"]] = {"at": datetime.now(timezone.utc).isoformat(timespec="minutes"), "email": sent}
            state.parent.mkdir(parents=True, exist_ok=True)
            state.write_text(json.dumps(posted, indent=1, sort_keys=True) + "\n")
            click.echo(f"  {c['id']}: emailed ({sent})")
        _prune(state, posted, now)
        return
    user, token = os.environ.get("IG_USER_ID", ""), os.environ.get("IG_ACCESS_TOKEN", "")
    gh, repo = os.environ.get("GH_TOKEN", ""), os.environ.get("GITHUB_REPOSITORY", "")
    if not (user and token and gh and repo):
        raise click.ClickException("set RESEND_API_KEY + SOCIAL_EMAIL_TO (email) or IG_USER_ID + IG_ACCESS_TOKEN (posting)")
    ig = Instagram(user, token, os.environ.get("IG_GRAPH") or "https://graph.facebook.com/v21.0")
    work = Path(tempfile.mkdtemp())
    ready = []
    for c, at in todo:
        try:
            doc, venue = _match(c["id"])
            data = carousel_data(doc, venue)
            ready.append((c, at, data, render(data, work / c["id"])))
        except (click.ClickException, subprocess.CalledProcessError, OSError, KeyError, IndexError, TypeError, ValueError) as e:
            # one bad match doesn't stop the others
            click.echo(f"  {c['id']}: not drawn ({e})")
    if not ready:
        return
    urls = host({c["id"]: paths for c, _, _, paths in ready}, repo, gh)
    for c, at, data, _ in ready:
        try:
            cid = ig.prepare(urls[c["id"]], caption(data, league(c)))
            wait = (at - datetime.now(timezone.utc)).total_seconds()
            if wait > 0:
                time.sleep(wait)
            media = ig.publish(cid)
        except click.ClickException as e:
            click.echo(f"  {c['id']}: not posted ({e.message})"); continue
        posted[c["id"]] = {"at": datetime.now(timezone.utc).isoformat(timespec="minutes"), "media": media}
        state.parent.mkdir(parents=True, exist_ok=True)
        state.write_text(json.dumps(posted, indent=1, sort_keys=True) + "\n")
        click.echo(f"  {c['id']}: posted ({media})")
    _prune(state, posted, now)


def _prune(state: Path, posted: dict, now: datetime) -> None:
    """Forget matches handled over two weeks ago, and save."""
    cutoff = (now - timedelta(days=14)).isoformat()
    for k in [k for k, v in posted.items() if v["at"] < cutoff]:
        del posted[k]
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(json.dumps(posted, indent=1, sort_keys=True) + "\n")
