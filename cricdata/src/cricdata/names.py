"""Stable IDs for teams and venues.

Players already have stable Cricsheet registry IDs. Teams and venues only
have display names, which change (franchise renames) or vary in spelling, so
we map them to a canonical name and derive a slug ID from that. The alias
files are small, hand-maintained, and the raw name is always kept too.
"""
from __future__ import annotations

import json
import os
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


_GROUND = re.compile(r"(stadium|ground|oval|park|gardens|academy|arena|club|cricket)", re.I)
_SECOND_GROUND = re.compile(r"(\d|\bground\b|\boval\b|\bfield\b|\bno\b|^[a-z]$)", re.I)   # "…, Ground 2" is another ground


def canonical_city(city: str | None) -> str | None:
    """'Bangalore' and 'Bengaluru' → 'Bengaluru' (cities/aliases spelled differently over the years)."""
    if not city:
        return city
    c = re.sub(r"\s+", " ", city.strip())
    return _load("cities").get(c, c)


def _legacy() -> bool:
    return os.environ.get("CRICDATA_VENUE_RULES") == "legacy"     # the old IDs, for before/after backtests


def canonical_venue(raw: str, city: str | None = None) -> str:
    """'Wankhede Stadium, Mumbai' and 'Wankhede Stadium' → 'Wankhede Stadium'.

    Generic names that several cities use ('County Ground') keep their city: 'County Ground, Chelmsford'."""
    name = re.sub(r"\s+", " ", raw.strip())
    aliases = _load("venues")
    if _legacy():
        if name in aliases:
            return aliases[name]
        if city and name.lower().endswith(", " + city.strip().lower()):
            name = name[: -(len(city.strip()) + 2)].strip()
        elif "," in name:
            head = name.rsplit(",", 1)[0].strip()
            if _GROUND.search(head):
                name = head
        return aliases.get(name, name)
    name = re.sub(r"\.\s+([A-Z][a-z]+)$", r", \1", name)            # 'Gahanga … Stadium. Rwanda'
    if name in aliases:
        name = aliases[name]
    else:
        if city and name.lower().endswith(", " + city.strip().lower()):
            name = name[: -(len(city.strip()) + 2)].strip()
        # then any trailing ', <Suburb>' ('…, Woolloongabba', '…, Mohali') while what's left still names a ground
        while "," in name:
            head, tail = (x.strip() for x in name.rsplit(",", 1))
            if not _GROUND.search(head) or _SECOND_GROUND.search(tail):
                break
            name = head
        name = aliases.get(name, name)
    if name in _load("generic_venues") and city:
        name = f"{name}, {canonical_city(city)}"
    return name


def venue_id(raw: str, city: str | None = None) -> str:
    return slug(canonical_venue(raw, city))
