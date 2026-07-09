"""ESPNcricinfo player metadata scraper.

Fetches batting hand, bowling style, playing role, nationality, and DOB
from public ESPNcricinfo player profile pages. Never writes to authenticated
or restricted content. Only fills NULL fields — never overwrites existing data.

Usage:
    uv run python -m cricveda_ingest.scraper --player-ids 28081 253802
    uv run python -m cricveda_ingest.scraper --from-db  # scrape all unresolved players in player_meta
"""
from __future__ import annotations

import csv
import logging
import re
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import click
import requests
from bs4 import BeautifulSoup

from cricveda_core.domain.models import BattingHand, BowlingStyle, PlayerMeta, PlayerRole

from .db import get_client

log = logging.getLogger(__name__)

ESPNCRICINFO_BASE = "https://www.espncricinfo.com"
PLAYER_URL = "https://www.espncricinfo.com/cricketers/player-{player_id}"
USER_AGENT = "Mozilla/5.0 (compatible; cricket-research-bot/1.0)"
REQUEST_DELAY = 1.5   # seconds between requests
RETRY_DELAYS = (3, 9, 27)  # exponential backoff

MAPPINGS_DIR = Path(__file__).parent.parent.parent.parent.parent / "data" / "mappings"


# ============================================================
# Bowling style normalization
# ============================================================

def load_bowling_style_map(csv_path: Path | None = None) -> dict[str, str]:
    path = csv_path or (MAPPINGS_DIR / "bowling_style_map.csv")
    style_map: dict[str, str] = {}
    try:
        with path.open() as f:
            for row in csv.DictReader(f):
                style_map[row["raw_label"].strip().lower()] = row["enum_value"].strip()
    except FileNotFoundError:
        log.warning("bowling_style_map.csv not found at %s", path)
    return style_map


_STYLE_MAP: dict[str, str] = {}


def normalize_bowling_style(raw_label: str, style_map: dict[str, str] | None = None) -> str | None:
    global _STYLE_MAP
    if style_map is None:
        if not _STYLE_MAP:
            _STYLE_MAP = load_bowling_style_map()
        style_map = _STYLE_MAP
    normalized = style_map.get(raw_label.strip().lower())
    if normalized is None:
        log.warning("Unmapped bowling style: %r", raw_label)
    return normalized


# ============================================================
# HTML parsing
# ============================================================

_ROLE_MAP = {
    "batter": PlayerRole.BAT,
    "batsman": PlayerRole.BAT,
    "top order batter": PlayerRole.BAT,
    "middle order batter": PlayerRole.BAT,
    "opening batter": PlayerRole.BAT,
    "bowler": PlayerRole.BOWL,
    "bowling allrounder": PlayerRole.AR,
    "batting allrounder": PlayerRole.AR,
    "allrounder": PlayerRole.AR,
    "all-rounder": PlayerRole.AR,
    "wicketkeeper": PlayerRole.WK,
    "wicketkeeper batter": PlayerRole.WK,
    "wicket-keeper": PlayerRole.WK,
}


def _parse_player_page(html: str, player_id: int) -> PlayerMeta | None:
    soup = BeautifulSoup(html, "html.parser")

    # ESPNcricinfo uses data-key attributes or specific class patterns.
    # We target the player overview section.
    name = None
    batting_hand: BattingHand | None = None
    bowling_style_raw: str | None = None
    bowling_style: BowlingStyle | None = None
    primary_role: PlayerRole | None = None
    nationality: str | None = None
    dob: date | None = None

    # Name — og:title or h1
    og_title = soup.find("meta", property="og:title")
    if og_title:
        name = og_title.get("content", "").split("|")[0].strip()
    if not name:
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)

    # Player info items — ESPNcricinfo renders a list of labeled facts
    # The structure uses divs with data labels like "Batting Style", "Bowling Style", etc.
    # We scan all text pairs on the page.
    for item in soup.find_all(["p", "div", "span", "td"]):
        text = item.get_text(" ", strip=True)

        if "Batting:" in text or "Batting Style:" in text:
            val = re.sub(r"Batting(?: Style)?:\s*", "", text, flags=re.I).strip()
            if "left" in val.lower():
                batting_hand = BattingHand.LEFT
            elif "right" in val.lower():
                batting_hand = BattingHand.RIGHT

        if "Bowling:" in text or "Bowling Style:" in text:
            val = re.sub(r"Bowling(?: Style)?:\s*", "", text, flags=re.I).strip()
            if val:
                bowling_style_raw = val
                enum_val = normalize_bowling_style(val)
                if enum_val:
                    bowling_style = BowlingStyle(enum_val)

        if "Playing Role:" in text or "Role:" in text:
            val = re.sub(r"(?:Playing )?Role:\s*", "", text, flags=re.I).strip().lower()
            primary_role = _ROLE_MAP.get(val)

        if "Country:" in text or "Nationality:" in text:
            val = re.sub(r"(?:Country|Nationality):\s*", "", text, flags=re.I).strip()
            if val and len(val) < 50:
                nationality = val

        if "Born:" in text or "Date of Birth:" in text:
            val = re.sub(r"(?:Born|Date of Birth):\s*", "", text, flags=re.I).strip()
            # Try to parse a date like "January 1, 1990" or "1990-01-01"
            dob = _parse_date(val)

    if not name:
        log.warning("Could not extract name for player %s", player_id)
        return None

    return PlayerMeta(
        player_id=player_id,
        name=name,
        batting_hand=batting_hand,
        bowling_style=bowling_style,
        bowling_style_raw=bowling_style_raw,
        primary_role=primary_role,
        nationality=nationality,
        dob=dob,
    )


def _parse_date(text: str) -> date | None:
    import re
    from datetime import datetime
    # Remove extra info like age in parentheses
    text = re.sub(r"\(.*?\)", "", text).strip()
    for fmt in ("%B %d, %Y", "%d %B %Y", "%Y-%m-%d", "%b %d, %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


# ============================================================
# HTTP fetch with retry
# ============================================================

def _fetch_player_page(player_id: int, session: requests.Session) -> str | None:
    url = PLAYER_URL.format(player_id=player_id)
    for attempt, delay in enumerate(RETRY_DELAYS, start=1):
        try:
            resp = session.get(url, timeout=15)
            if resp.status_code == 200:
                return resp.text
            if resp.status_code == 404:
                log.warning("Player %s not found (404)", player_id)
                return None
            log.warning("Player %s: HTTP %s (attempt %s)", player_id, resp.status_code, attempt)
        except requests.RequestException as e:
            log.warning("Player %s: request error attempt %s: %s", player_id, attempt, e)
        time.sleep(delay)
    log.error("Player %s: all retries exhausted", player_id)
    return None


# ============================================================
# Single player scrape
# ============================================================

def scrape_player(player_id: int, session: requests.Session) -> PlayerMeta | None:
    html = _fetch_player_page(player_id, session)
    if html is None:
        return None
    return _parse_player_page(html, player_id)


# ============================================================
# Database upsert — only fill NULL fields
# ============================================================

def upsert_player_meta(meta: PlayerMeta) -> str:
    """Insert or partially update player_meta. Returns 'inserted', 'updated', or 'skipped'."""
    client = get_client()
    existing = client.table("player_meta").select("*").eq("player_id", meta.player_id).execute()

    if not existing.data:
        # New player — insert everything we have
        row: dict = {"player_id": meta.player_id, "name": meta.name}
        if meta.batting_hand:
            row["batting_hand"] = meta.batting_hand.value
        if meta.bowling_style:
            row["bowling_style"] = meta.bowling_style.value
        if meta.bowling_style_raw:
            row["bowling_style_raw"] = meta.bowling_style_raw
        if meta.primary_role:
            row["primary_role"] = meta.primary_role.value
        if meta.nationality:
            row["nationality"] = meta.nationality
        if meta.dob:
            row["dob"] = str(meta.dob)
        client.table("player_meta").insert(row).execute()
        return "inserted"

    # Existing player — only fill NULL fields
    existing_row = existing.data[0]
    updates: dict = {}
    if not existing_row.get("batting_hand") and meta.batting_hand:
        updates["batting_hand"] = meta.batting_hand.value
    if not existing_row.get("bowling_style") and meta.bowling_style:
        updates["bowling_style"] = meta.bowling_style.value
    if not existing_row.get("bowling_style_raw") and meta.bowling_style_raw:
        updates["bowling_style_raw"] = meta.bowling_style_raw
    if not existing_row.get("primary_role") and meta.primary_role:
        updates["primary_role"] = meta.primary_role.value
    if not existing_row.get("nationality") and meta.nationality:
        updates["nationality"] = meta.nationality
    if not existing_row.get("dob") and meta.dob:
        updates["dob"] = str(meta.dob)

    if updates:
        client.table("player_meta").update(updates).eq("player_id", meta.player_id).execute()
        return "updated"
    return "skipped"


# ============================================================
# Batch scraper
# ============================================================

@dataclass
class ScrapeResult:
    successful: int = 0
    failed: int = 0
    inserted: int = 0
    updated: int = 0
    skipped: int = 0


def scrape_batch(player_ids: list[int], batch_size: int = 50) -> ScrapeResult:
    result = ScrapeResult()
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT

    for i, player_id in enumerate(player_ids, start=1):
        meta = scrape_player(player_id, session)
        if meta is None:
            result.failed += 1
        else:
            result.successful += 1
            outcome = upsert_player_meta(meta)
            if outcome == "inserted":
                result.inserted += 1
            elif outcome == "updated":
                result.updated += 1
            else:
                result.skipped += 1

        if i % batch_size == 0:
            log.info(
                "Progress %d/%d — ok:%d fail:%d new:%d updated:%d",
                i, len(player_ids), result.successful, result.failed, result.inserted, result.updated,
            )

        if i < len(player_ids):
            time.sleep(REQUEST_DELAY)

    return result


def get_unresolved_player_ids() -> list[int]:
    """Return player_ids in player_meta where any key field is NULL."""
    client = get_client()
    rows = (
        client.table("player_meta")
        .select("player_id")
        .is_("batting_hand", "null")
        .execute()
    )
    return [r["player_id"] for r in rows.data]


# ============================================================
# CLI
# ============================================================

@click.command()
@click.option("--player-ids", multiple=True, type=int, help="Specific player IDs to scrape")
@click.option("--from-db", is_flag=True, default=False, help="Scrape all players with NULL batting_hand in player_meta")
@click.option("--batch-size", default=50, show_default=True)
def main(player_ids: tuple[int, ...], from_db: bool, batch_size: int) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    ids: list[int] = list(player_ids)
    if from_db:
        ids = get_unresolved_player_ids()
        log.info("Found %d players with incomplete metadata", len(ids))

    if not ids:
        click.echo("No player IDs specified. Use --player-ids or --from-db.")
        return

    result = scrape_batch(ids, batch_size=batch_size)
    click.echo(f"\nScrape complete:")
    click.echo(f"  Successful:  {result.successful}")
    click.echo(f"  Failed:      {result.failed}")
    click.echo(f"  Inserted:    {result.inserted}")
    click.echo(f"  Updated:     {result.updated}")
    click.echo(f"  Skipped:     {result.skipped}")


if __name__ == "__main__":
    main()
