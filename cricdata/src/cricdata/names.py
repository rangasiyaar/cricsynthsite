"""Stable IDs for teams and venues.

Players already have stable Cricsheet registry IDs. Teams and venues only
have display names, which change (franchise renames) or vary in spelling, so
we map them to a canonical name and derive a slug ID from that. The alias
files are small, hand-maintained, and the raw name is always kept too.
"""
from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

_ALIASES = Path(__file__).parent / "aliases"


@lru_cache(maxsize=None)
def _load(name: str) -> dict[str, str]:
    data = json.loads((_ALIASES / f"{name}.json").read_text())
    return {k: v for k, v in data.items() if not k.startswith("_")}


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return re.sub(r"-+", "-", text)


def canonical_team(raw: str) -> str:
    return _load("teams").get(raw.strip(), raw.strip())


def team_id(raw: str) -> str:
    return slug(canonical_team(raw))


def canonical_venue(raw: str, city: str | None = None) -> str:
    """'Wankhede Stadium, Mumbai' and 'Wankhede Stadium' → 'Wankhede Stadium'."""
    name = re.sub(r"\s+", " ", raw.strip())
    aliases = _load("venues")
    if name in aliases:
        return aliases[name]
    if city and name.lower().endswith(", " + city.strip().lower()):
        name = name[: -(len(city.strip()) + 2)].strip()
    elif "," in name:
        head = name.rsplit(",", 1)[0].strip()
        # only strip a trailing ", <Place>" when what's left still looks like a ground name
        if re.search(r"(stadium|ground|oval|park|gardens|academy|arena|club|cricket)", head, re.I):
            name = head
    return aliases.get(name, name)


def venue_id(raw: str, city: str | None = None) -> str:
    return slug(canonical_venue(raw, city))
