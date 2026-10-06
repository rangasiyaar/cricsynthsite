"""Fetch Cricsheet downloads (all matches, or just recently added) and the player register."""
from __future__ import annotations

import logging
import urllib.request
from pathlib import Path

log = logging.getLogger(__name__)

BASE = "https://cricsheet.org"
SOURCES = {
    "all": f"{BASE}/downloads/all_json.zip",
    "recent": f"{BASE}/downloads/recently_added_30_json.zip",
    "people": f"{BASE}/register/people.csv",
    "names": f"{BASE}/register/names.csv",
    # batting hand / bowling style keyed by Cricsheet ID (see cricdata.attributes)
    "player_meta": "https://raw.githubusercontent.com/robjhyndman/cricketdata/master/data/player_meta.rda",
}


def fetch(kind: str, dest_dir: Path) -> Path:
    url = SOURCES[kind]
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / url.rsplit("/", 1)[-1]
    log.info("Downloading %s", url)
    req = urllib.request.Request(url, headers={"User-Agent": "CricSynthesis ingest (+https://cricsynthesis.in)"})
    with urllib.request.urlopen(req, timeout=300) as resp, dest.open("wb") as fh:
        while chunk := resp.read(1 << 20):
            fh.write(chunk)
    log.info("Saved %s (%.1f MB)", dest, dest.stat().st_size / 1e6)
    return dest
