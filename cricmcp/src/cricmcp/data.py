"""Published CricSynthesis data: the same JSON the website reads (match index, forecasts, engine packs, Pattern Lab).

CRICSYNTHESIS_DATA_URL points elsewhere (another host, or a local folder such as app/public/data for tests).
"""
from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

from mcp.server.mcpserver.exceptions import ToolError

DEFAULT_URL = "https://cricsynthesis.in/data"
FALLBACK_URL = "https://cricsynthesis.web.app/data"     # same files; used if the main domain is unreachable
TTL = 600          # seconds; forecasts are rebuilt nightly
UA = "cricsynthesis-mcp/0.2"


class DataError(ToolError):
    """A problem the user can act on; its message is shown to the assistant."""


def safe_id(pid: str) -> str:
    """File name of a published id (cricsim.kit.safe_id)."""
    return re.sub(r"[^A-Za-z0-9_.-]", "_", pid)


def _norm(s: str) -> str:
    return " ".join(re.sub(r"[.,'\-]", " ", s.lower()).split())


def _initials(name: str, words: list[str]) -> bool:
    """'v kohli' for 'virat kohli', 'rg sharma' for 'rohit sharma': same surname, first initial matches."""
    t = name.split()
    return len(t) >= 2 and t[-1] == words[-1] and t[0][0] == words[0][0]


class Store:
    def __init__(self, base: str | None = None):
        self.base = (base or os.environ.get("CRICSYNTHESIS_DATA_URL") or DEFAULT_URL).rstrip("/")
        self._cache: dict[str, tuple[float, object]] = {}

    def get(self, path: str):
        hit = self._cache.get(path)
        if hit and time.time() - hit[0] < TTL:
            return hit[1]
        if re.match(r"^https?://", self.base):
            data = self._fetch(path)
        else:
            f = Path(self.base.removeprefix("file://")) / urllib.parse.unquote(path)
            if not f.exists():
                raise DataError(f"404 loading {path}")
            data = json.loads(f.read_text())
        self._cache[path] = (time.time(), data)
        return data

    def _fetch(self, path: str):
        bases = [self.base] + ([FALLBACK_URL] if self.base == DEFAULT_URL else [])
        for k, base in enumerate(bases):
            req = urllib.request.Request(f"{base}/{path}", headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.loads(r.read())
                if k:
                    self.base = base                    # stick with the one that works
                return data
            except urllib.error.HTTPError as e:
                raise DataError(f"{e.code} loading {path}") from e
            except (urllib.error.URLError, OSError) as e:
                if k == len(bases) - 1:
                    raise DataError(f"Can't reach {base}: {getattr(e, 'reason', e)}") from e

    def index(self) -> list[dict]:
        return [m for m in self.get("index.json").get("matches", []) if m.get("published", True)]

    def match(self, mid: str) -> dict:
        return self.get(f"matches/{urllib.parse.quote(mid)}.json")

    def pack(self, mid: str) -> dict:
        return self.get(f"matches/{urllib.parse.quote(mid)}.pack.json")

    # ── analytics kit (cricsim/kit.py) ──
    def kit_file(self, path: str):
        try:
            return self.get(f"analytics/{path}")
        except DataError as e:
            if str(e).startswith("404"):
                raise DataError("Not found in the published analytics.") from e
            raise

    def player(self, pid: str) -> dict:
        return self.kit_file(f"players/{safe_id(pid)}.json")

    def find_players(self, query: str, limit: int = 10) -> list[dict]:
        """Players matching the query by name or another name they're known by ("Virat Kohli" finds Cricsheet's
        "V Kohli"): an id, then an exact name, then prefix or every word, then surname plus first initial; the most
        experienced first. An exact namesake with little data gives way to an established player the query also fits."""
        idx = self.kit_file("players.json")
        fields = idx["fields"]
        q = _norm(query)
        words = q.split()
        hits = []
        for row in idx["players"]:
            r = dict(zip(fields, row))
            names = [_norm(n) for n in [r["name"] or "", *(r.get("aka") or [])]]
            if r["id"].lower() == q:
                rank = 0
            elif q in names:
                rank = 1
            elif any(n.startswith(q) for n in names) or (words and any(all(w in n for w in words) for n in names)):
                rank = 2
            elif len(words) >= 2 and any(_initials(n, words) for n in names):
                rank = 3
            else:
                continue
            hits.append((rank, -r["balls"], r))
        # an exact namesake with little data gives way to an established player the query also fits ("Rohit Sharma")
        top = max((-b for k, b, _ in hits if k >= 2), default=0)
        hits = [(2 if k == 1 and top >= 2000 and -b * 10 < top else k, b, r) for k, b, r in hits]
        hits.sort(key=lambda h: (h[0], h[1]))
        return [{k: v for k, v in h[2].items() if k != "aka"} for h in hits[:limit]]

    def resolve_player(self, query: str) -> dict:
        hits = self.find_players(query, 5)
        if not hits:
            raise DataError(f"No player matches '{query}'. Try search_players with part of the name.")
        return self.player(hits[0]["id"])

    def find_match(self, query: str | None) -> dict:
        """A match card by id or by words from the title / team names; no query = the next match."""
        cards = sorted(self.index(), key=lambda m: (m.get("date") or "9999", m.get("start_time") or ""))
        if not cards:
            raise DataError("No matches are published right now.")
        if not query:
            return cards[0]
        q = query.strip().lower()
        for m in cards:
            if m["id"].lower() == q:
                return m
        words = [w for w in re.split(r"[^a-z0-9]+", q) if w and w not in {"v", "vs", "versus", "and", "the", "match"}]

        def hay(m):
            parts = [m.get("title"), m.get("competition"), m.get("venue"), m.get("date"),
                     *(t["name"] for t in m["teams"]), *(t["short"] for t in m["teams"])]
            return " ".join(p for p in parts if p).lower()
        hits = [m for m in cards if words and all(w in hay(m) for w in words)]
        if not hits:
            names = "; ".join(f"{m['id']}: {m.get('title') or ' v '.join(t['name'] for t in m['teams'])}" for m in cards)
            raise DataError(f"No published match matches '{query}'. Published matches: {names}")
        return hits[0]
