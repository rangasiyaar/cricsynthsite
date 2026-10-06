"""Readable public IDs ↔ internal IDs for the v2 API."""
from __future__ import annotations

import re

from fastapi import HTTPException, status

from cricveda_api import store

_FALLBACK_PLAYER = re.compile(r"^p-(\d+)$")


def player_internal_id(slug: str) -> int:
    """`p-vk18` via the public_ids table, or `p-<player_id>` for players without a slug."""
    internal = store.resolve_public_id("player", slug)
    if internal is not None:
        return int(internal)
    m = _FALLBACK_PLAYER.match(slug)
    if m:
        return int(m.group(1))
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown player_id '{slug}'")


def player_public_ids(player_ids: list[int]) -> dict[int, str]:
    slugs = store.public_ids_for("player", [str(p) for p in player_ids])
    return {p: slugs.get(str(p), f"p-{p}") for p in player_ids}


def fixture_by_match_id(match_id: str) -> dict:
    fx = store.get_fixture_by_slug(match_id)
    if not fx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown match_id '{match_id}'")
    return fx
