"""Cricsheet zip → Parquet tables, written in chunks so memory stays flat.

Layout:  <out>/<table>/part-00001.parquet …   plus  <out>/players/players.parquet
"""
from __future__ import annotations

import csv
import json
import logging
import zipfile
from collections.abc import Iterator
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from cricdata.parse import parse_match
from cricdata.schema import SCHEMAS

log = logging.getLogger(__name__)
TABLES = ("matches", "match_players", "innings", "deliveries", "wickets")


def iter_matches(zip_path: Path) -> Iterator[tuple[str, dict]]:
    """(match_id, json) for every match file in a Cricsheet zip, in a stable order."""
    with zipfile.ZipFile(zip_path) as zf:
        names = sorted((n for n in zf.namelist() if n.endswith(".json")), key=_sort_key)
        for name in names:
            match_id = Path(name).stem
            try:
                yield match_id, json.loads(zf.read(name))
            except json.JSONDecodeError as e:
                log.warning("Skipping unreadable %s: %s", name, e)


def _sort_key(name: str):
    stem = Path(name).stem
    return (0, int(stem)) if stem.isdigit() else (1, stem)


def _write(rows: list[dict], table: str, out: Path, part: int) -> None:
    if not rows:
        return
    schema = SCHEMAS[table]
    cols = {}
    for f in schema:
        vals = [r.get(f.name) for r in rows]
        if pa.types.is_string(f.type):       # Cricsheet sometimes uses numbers for text fields (e.g. event.group: 1)
            vals = [v if v is None or isinstance(v, str) else str(v) for v in vals]
        elif pa.types.is_list(f.type) and pa.types.is_string(f.type.value_type):
            vals = [v if v is None else [x if x is None or isinstance(x, str) else str(x) for x in v] for v in vals]
        cols[f.name] = vals
    tbl = pa.Table.from_pydict(cols, schema=schema)
    (out / table).mkdir(parents=True, exist_ok=True)
    pq.write_table(tbl, out / table / f"part-{part:05d}.parquet", compression="zstd")


def build(zip_path: Path, out: Path, chunk_matches: int = 500, limit: int | None = None) -> dict[str, int]:
    """Parse every match and write Parquet. Returns row counts per table."""
    counts = {t: 0 for t in TABLES}
    buf: dict[str, list[dict]] = {t: [] for t in TABLES}
    part, n, failed = 1, 0, 0
    for match_id, data in iter_matches(zip_path):
        try:
            parsed = parse_match(data, match_id)
        except (KeyError, ValueError, TypeError) as e:
            failed += 1
            log.warning("Could not parse match %s: %s", match_id, e)
            continue
        for t in TABLES:
            buf[t].extend(parsed[t])
        n += 1
        if n % chunk_matches == 0:
            for t in TABLES:
                _write(buf[t], t, out, part)
                counts[t] += len(buf[t])
                buf[t] = []
            part += 1
            log.info("%d matches parsed", n)
        if limit and n >= limit:
            break
    for t in TABLES:
        _write(buf[t], t, out, part)
        counts[t] += len(buf[t])
    counts["matches_failed"] = failed
    log.info("Done: %s", counts)
    return counts


def build_players(people_csv: Path, names_csv: Path | None, out: Path) -> int:
    """Cricsheet register: people.csv (IDs + cross-site keys) and names.csv (alternate names)."""
    aliases: dict[str, list[str]] = {}
    if names_csv and names_csv.exists():
        with names_csv.open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                aliases.setdefault(row["identifier"], []).append(row["name"])
    rows = []
    with people_csv.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            pid = row["identifier"]
            rows.append({"player_id": pid, "name": row.get("name"), "unique_name": row.get("unique_name"),
                         "key_cricinfo": row.get("key_cricinfo") or None,
                         "key_cricbuzz": row.get("key_cricbuzz") or None,
                         "key_bcci": row.get("key_bcci") or None,
                         "aliases": sorted(set(aliases.get(pid, [])) - {row.get("name")})})
    _write(rows, "players", out, 1)
    return len(rows)


def read_table(out: Path, table: str) -> pa.Table:
    return pq.read_table(out / table)
