"""One-off check of the Big Balls Data cricket API: do our competitions, fixtures, squads/XIs and scorecards come through?

    BIGBALLS_KEY=... python -m cricsim.feed_probe_bigballs "West Indies tour of India" "Spring Challenge" ...

Prints a markdown report of field names and a few rows; never prints the key or request URLs.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.bigballsdata.com/v1/cricket"


class Feed:
    def __init__(self, key: str):
        self.key, self.calls, self.limits = key, 0, {}

    def get(self, path: str, **params) -> tuple[int, object]:
        url = f"{BASE}/{path}" + (f"?{urllib.parse.urlencode(params)}" if params else "")
        req = urllib.request.Request(url, headers={"x-api-key": self.key, "Authorization": f"Bearer {self.key}",
                                                   "Accept": "application/json", "User-Agent": "cricsynthesis-probe"})
        self.calls += 1
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                self.limits = {k: v for k, v in r.headers.items() if "limit" in k.lower() or "remaining" in k.lower()}
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            body = e.read()[:300].decode("utf-8", "replace")
            return e.code, {"error": body}
        except Exception as e:                       # noqa: BLE001 - report the type only, never the URL
            return 0, {"error": type(e).__name__}


def _items(x) -> list:
    """The list inside a response, whatever it is called."""
    if isinstance(x, list):
        return x
    if isinstance(x, dict):
        for k in ("data", "items", "results", "series", "matches"):
            v = x.get(k)
            if isinstance(v, list):
                return v
            if isinstance(v, dict):
                inner = _items(v)
                if inner:
                    return inner
    return []


def _shape(x, depth=0) -> str:
    if isinstance(x, dict):
        if depth >= 3:
            return "{…}"
        return "{" + ", ".join(f"{k}: {_shape(v, depth + 1)}" for k, v in list(x.items())[:25]) + "}"
    if isinstance(x, list):
        return f"[{_shape(x[0], depth + 1)} ×{len(x)}]" if x else "[]"
    return type(x).__name__


def _name(d: dict) -> str:
    return str(d.get("name") or d.get("title") or d.get("series_name") or d.get("description") or "")


def _id(d: dict):
    return d.get("id") or d.get("series_id") or d.get("match_id") or d.get("key")


def main() -> None:
    key = os.environ.get("BIGBALLS_KEY")
    if not key:
        sys.exit("BIGBALLS_KEY is not set")
    terms = sys.argv[1:] or ["West Indies tour of India", "Spring Challenge", "Legends"]
    f = Feed(key)
    out = ["### Big Balls Data probe", ""]
    st, series = f.get("series")
    items = _items(series)
    out += [f"`/series`: HTTP {st} · {len(items)} series", "```", _shape(series)[:900], "```"]
    if st != 200:
        out.append(f"Response: `{json.dumps(series)[:300]}`")
    for term in terms:
        words = term.lower().split()
        hit = [s for s in items if all(w in _name(s).lower() for w in words)]
        out += ["", f"**{term}**: {len(hit)} series"] + [f"- {_name(s)} · {json.dumps({k: s.get(k) for k in ('start_date', 'end_date', 'startDate', 'endDate', 'season', 'format')})}" for s in hit[:3]]
        if not hit:
            continue
        out.append("  first entry: `" + json.dumps(hit[0])[:300] + "`")
        rows = []
        for params in ({"series": _id(hit[0])}, {"series_id": _id(hit[0])}, {"series": _name(hit[0])}):
            st, ms = f.get("matches", **params, limit=50)
            rows = _items(ms)
            out.append(f"  `/matches?{list(params)[0]}=`: HTTP {st} · {len(rows)} matches")
            if rows:
                break
        if rows:
            out += ["  ```", "  " + _shape(rows[0])[:900], "  ```"]
        for m in rows[:8]:
            out.append("  - " + json.dumps({k: m.get(k) for k in ("start_time", "date", "start", "status", "name", "title", "venue", "result")
                                             if m.get(k) is not None})[:260])
        if not rows:
            continue
        up = next((m for m in rows if str(m.get("status", "")).lower() in ("scheduled", "upcoming", "not_started", "fixture")), None)
        done = next((m for m in rows if str(m.get("status", "")).lower() in ("finished", "complete", "completed", "result", "ended")), None)
        if up:
            st, detail = f.get(f"matches/{_id(up)}")
            out += [f"  upcoming match detail: HTTP {st}", "  ```", "  " + _shape(detail)[:1200], "  ```"]
        if done:
            st, sc = f.get(f"matches/{_id(done)}/scorecard")
            out += [f"  scorecard ({_name(done)}): HTTP {st}", "  ```", "  " + _shape(sc)[:1500], "  ```"]
            text = json.dumps(sc).lower()
            out.append(f"  mentions: fall of wickets {'fall' in text or 'fow' in text} · powerplay {'powerplay' in text} · "
                       f"toss {'toss' in text} · extras {'extras' in text}")
    st, allm = f.get("matches", limit=100)
    rows = _items(allm)
    out += ["", f"`/matches?limit=100` (no filter): HTTP {st} · {len(rows)} matches", "```", _shape(allm)[:1200], "```"]
    if rows:
        keys = [k for k in ("date", "start_time", "start", "match_date", "dateTimeGMT") if k in rows[0]]
        dates = sorted(str(r.get(keys[0])) for r in rows if keys and r.get(keys[0]))
        out.append(f"date field {keys[:1]}: earliest {dates[0] if dates else None} · latest {dates[-1] if dates else None}")
        out.append("statuses: " + json.dumps(sorted({str(r.get('status')) for r in rows})))
        for r in rows[:5]:
            out.append("- `" + json.dumps(r)[:300] + "`")
    big = sorted(items, key=lambda s: str(s.get("latest_match") or ""), reverse=True)[:12]
    out += ["", "Series with the most recent matches:"] + [f"- {s.get('name')} · {s.get('match_count')} matches · {s.get('first_match')} to {s.get('latest_match')}" for s in big]
    out += ["", f"Calls used: {f.calls} · rate-limit headers: {json.dumps(f.limits)}"]
    print("\n".join(out))


if __name__ == "__main__":
    main()
