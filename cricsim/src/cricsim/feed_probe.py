"""One-off check of the fixtures/scorecard feed (CricketData.org free plan): what it lists and what a scorecard holds.

    CRICKETDATA_KEY=... python -m cricsim.feed_probe

Spends about ten calls of the 100/day free quota. Prints a markdown report; never prints the key or request URLs.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

BASE = "https://api.cricapi.com/v1"
WATCH = ("India", "West Indies", "Strikers", "Scorchers", "Thunder", "Heat", "Sixers", "ACT", "Champions", "Legends")


class Feed:
    def __init__(self, key: str):
        self.key, self.calls, self.info = key, 0, {}

    def get(self, path: str, **params) -> dict:
        q = urllib.parse.urlencode({"apikey": self.key, **params})
        self.calls += 1
        try:
            with urllib.request.urlopen(f"{BASE}/{path}?{q}", timeout=30) as r:
                d = json.loads(r.read())
        except Exception as e:                       # noqa: BLE001 - report, never echo the URL
            return {"status": "error", "reason": type(e).__name__}
        self.info = d.get("info") or self.info
        return d


def _shape(x, depth=0) -> str:
    """Field names of a JSON value, two levels deep (structure only, no values)."""
    if isinstance(x, dict):
        if depth >= 2:
            return "{…}"
        return "{" + ", ".join(f"{k}: {_shape(v, depth + 1)}" for k, v in list(x.items())[:20]) + "}"
    if isinstance(x, list):
        return f"[{_shape(x[0], depth + 1)} ×{len(x)}]" if x else "[]"
    return type(x).__name__


def main() -> None:
    key = os.environ.get("CRICKETDATA_KEY")
    if not key:
        sys.exit("CRICKETDATA_KEY is not set")
    f = Feed(key)
    out = ["### Feed probe", ""]
    matches, offset = [], 0
    for _ in range(6):                                # up to 6 pages of 25
        d = f.get("matches", offset=offset)
        if d.get("status") != "success":
            out.append(f"`matches` failed: {d.get('status')} {d.get('reason', '')}")
            break
        page = d.get("data") or []
        matches += page
        total = (d.get("info") or {}).get("totalRows") or 0
        offset += len(page)
        if not page or offset >= total:
            break
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=7)

    def when(m):
        try:
            return datetime.fromisoformat((m.get("dateTimeGMT") or "").replace("Z", "")).replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    upcoming = [m for m in matches if not m.get("matchStarted") and when(m) and now - timedelta(hours=6) <= when(m) <= soon]
    ended = [m for m in matches if m.get("matchEnded")]
    out += [f"`matches`: {len(matches)} listed · {len(upcoming)} starting in the next 7 days · {len(ended)} finished",
            f"Types: {dict(Counter(m.get('matchType') for m in matches))}", "",
            "#### Next 7 days", "", "| Starts (GMT) | Match | Type | Venue |", "|---|---|---|---|"]
    for m in sorted(upcoming, key=when)[:40]:
        out.append(f"| {m.get('dateTimeGMT')} | {m.get('name')} | {m.get('matchType')} | {m.get('venue')} |")
    hits = [m for m in matches if any(w in (m.get("name") or "") for w in WATCH)]
    out += ["", "#### Our current competitions in the list", ""]
    out += [f"- {m.get('dateTimeGMT')} · {m.get('name')} · {m.get('status')}" for m in hits[:25]] or ["- none found"]

    cur = f.get("currentMatches", offset=0)
    out += ["", f"`currentMatches`: {cur.get('status')} · {len(cur.get('data') or [])} matches"]

    t20_done = next((m for m in ended if m.get("matchType") == "t20"), ended[0] if ended else None)
    if t20_done:
        sc = f.get("match_scorecard", id=t20_done["id"])
        data = sc.get("data") or {}
        out += ["", f"#### Scorecard fields ({t20_done.get('name')})", "", "```", _shape(data), "```"]
        inn = (data.get("scorecard") or [{}])[0]
        out += ["Innings fields: `" + ", ".join(inn.keys()) + "`",
                f"Has fall of wickets: {'yes' if any('fow' in k.lower() or 'fall' in k.lower() for k in inn) else 'no'} · "
                f"has powerplay: {'yes' if 'powerplay' in json.dumps(inn).lower() else 'no'}"]
        if inn.get("batting"):
            out.append("Batting row fields: `" + ", ".join(inn["batting"][0].keys()) + "`")
        if inn.get("bowling"):
            out.append("Bowling row fields: `" + ", ".join(inn["bowling"][0].keys()) + "`")
    if upcoming:
        m = sorted(upcoming, key=when)[0]
        sq = f.get("match_squad", id=m["id"])
        info = f.get("match_info", id=m["id"])
        teams = sq.get("data") or []
        out += ["", f"#### Squad and match info ({m.get('name')})", "",
                f"`match_squad`: {sq.get('status')} · " + ", ".join(f"{t.get('teamName')} {len(t.get('players') or [])} players" for t in teams),
                f"`match_info` fields: `{', '.join((info.get('data') or {}).keys())}`"]
    out += ["", f"Calls used by this probe: {f.calls} · quota: {json.dumps({k: f.info.get(k) for k in ('hitsToday', 'hitsUsed', 'hitsLimit')})}"]
    print("\n".join(out))


if __name__ == "__main__":
    main()
