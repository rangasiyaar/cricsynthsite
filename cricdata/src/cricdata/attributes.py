"""Batting hand and bowling style per player — the one thing Cricsheet doesn't record.

Source: `player_meta` from the cricketdata R package (Hyndman et al., GPL-3,
https://github.com/robjhyndman/cricketdata), compiled from ESPNcricinfo profiles
and already keyed by Cricsheet registry ID. ~16k players, snapshot March 2025;
players who debut later are filled in by admin overrides.

Output: <out>/attributes/attributes.parquet
    player_id, batting_hand (right|left), bowling_arm (right|left),
    bowling_kind (pace | off_spin | leg_spin | left_arm_orthodox | left_arm_wrist | slow),
    bowling_pace (fast | fast_medium | medium_fast | medium | slow_medium), raw styles, source
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

PLAYER_META_URL = "https://raw.githubusercontent.com/robjhyndman/cricketdata/master/data/player_meta.rda"
SOURCE = "cricketdata:player_meta"

SCHEMA = pa.schema([
    ("player_id", pa.string()),
    ("batting_hand", pa.string()),
    ("bowling_arm", pa.string()),
    ("bowling_kind", pa.string()),
    ("bowling_pace", pa.string()),
    ("batting_style_raw", pa.string()),
    ("bowling_style_raw", pa.string()),
    ("source", pa.string()),
])

_PACE = (("fast medium", "fast_medium"), ("fast-medium", "fast_medium"), ("medium fast", "medium_fast"),
         ("medium-fast", "medium_fast"), ("slow medium", "slow_medium"), ("slow-medium", "slow_medium"),
         ("fast", "fast"), ("medium", "medium"))


def batting_hand(style: str | None) -> str | None:
    s = (style or "").lower()
    if not s.endswith("bat"):          # a few rows carry a bowling style in the batting column
        return None
    return "left" if s.startswith("left") else "right" if s.startswith("right") else None


def bowling(style: str | None) -> tuple[str | None, str | None, str | None]:
    """(arm, kind, pace) from the player's primary (first-listed) bowling style."""
    if not style:
        return None, None, None
    s = re.sub(r"\s+", " ", style.split(",")[0].strip().lower())
    if "orthodox" in s:
        return "left", "left_arm_orthodox", None
    if "wrist" in s or "chinaman" in s:
        return ("left" if "left" in s else "right"), ("left_arm_wrist" if "left" in s else "leg_spin"), None
    if "legbreak" in s or "googly" in s:
        return "right", "leg_spin", None
    if "offbreak" in s:
        return ("left" if "left" in s else "right"), "off_spin", None
    arm = "left" if s.startswith("left") else "right" if s.startswith("right") else None
    for word, pace in _PACE:
        if word in s:
            return arm, "pace", pace
    if "slow" in s:
        return arm, "slow", None
    return arm, None, None             # "Right arm Bowler", "(Unknown Arm) Slow" …


def normalise(rows: Iterable[dict], source: str = SOURCE) -> pa.Table:
    out = {f.name: [] for f in SCHEMA}
    seen = set()
    for r in rows:
        pid = r.get("cricsheet_id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        arm, kind, pace = bowling(r.get("bowling_style"))
        for k, v in (("player_id", pid), ("batting_hand", batting_hand(r.get("batting_style"))),
                     ("bowling_arm", arm), ("bowling_kind", kind), ("bowling_pace", pace),
                     ("batting_style_raw", r.get("batting_style")), ("bowling_style_raw", r.get("bowling_style")),
                     ("source", source)):
            out[k].append(v)
    return pa.table(out, schema=SCHEMA)


def apply_overrides(table: pa.Table, overrides: Path | None) -> pa.Table:
    """Overrides CSV (player_id + any attribute columns) wins over the dataset — for debutants and fixes."""
    if overrides is None or not overrides.exists():
        return table
    import csv
    rows = {r["player_id"]: r for r in table.to_pylist()}
    with overrides.open(newline="") as fh:
        for o in csv.DictReader(fh):
            base = rows.setdefault(o["player_id"], {f.name: None for f in SCHEMA} | {"player_id": o["player_id"]})
            base.update({k: v for k, v in o.items() if v and k in SCHEMA.names})
            base["source"] = "override"
    return pa.Table.from_pylist(list(rows.values()), schema=SCHEMA)


def read_player_meta(rda: Path) -> list[dict]:
    import warnings

    import rdata
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")          # rdata warns about R classes it doesn't need (Date, tibble)
        df = rdata.read_rda(str(rda))["player_meta"]
    cols = ["cricsheet_id", "batting_style", "bowling_style"]
    df = df[cols].astype(object)
    return df.where(df.notna(), None).to_dict("records")


def build_attributes(rda: Path, out: Path, overrides: Path | None = None) -> dict[str, int]:
    t = apply_overrides(normalise(read_player_meta(rda)), overrides)
    dest = out / "attributes"
    dest.mkdir(parents=True, exist_ok=True)
    pq.write_table(t, dest / "attributes.parquet", compression="zstd")
    col = t.column
    return {"players": t.num_rows,
            "with_batting_hand": t.num_rows - col("batting_hand").null_count,
            "with_bowling_kind": t.num_rows - col("bowling_kind").null_count}
