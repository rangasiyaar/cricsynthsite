"""Coverage audit: what Cricsheet actually gives us, by format, competition and season.

The cross-league player ratings are only as good as this coverage, so the
audit is produced on every ingest and kept next to the data.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import pyarrow.compute as pc

from cricdata.build import read_table


def audit(out: Path) -> dict:
    m = read_table(out, "matches").to_pylist()
    d = read_table(out, "deliveries")
    balls_by_match = dict(zip(*_group_count(d, "match_id")))

    by_format = Counter((r["format"], r["gender"]) for r in m)
    by_competition: dict[tuple, dict] = defaultdict(lambda: {"matches": 0, "balls": 0, "seasons": set()})
    for r in m:
        key = (r["format"], r["gender"], r["team_type"], r["competition"] or "(no competition)")
        c = by_competition[key]
        c["matches"] += 1
        c["balls"] += balls_by_match.get(r["match_id"], 0)
        if r["season"]:
            c["seasons"].add(r["season"])

    players_with_id = pc.sum(pc.is_valid(d["batter_id"])).as_py() or 0
    report = {
        "matches": len(m),
        "deliveries": d.num_rows,
        "deliveries_with_batter_id_pct": round(100 * players_with_id / max(1, d.num_rows), 2),
        "matches_without_balls": sum(1 for r in m if r["match_id"] not in balls_by_match),
        "by_format": [{"format": f, "gender": g, "matches": n} for (f, g), n in sorted(by_format.items())],
        "competitions": sorted(
            ({"format": f, "gender": g, "team_type": tt, "competition": comp, "matches": v["matches"],
              "balls": v["balls"], "seasons": sorted(v["seasons"])[:1] + sorted(v["seasons"])[-1:],
              "n_seasons": len(v["seasons"])}
             for (f, g, tt, comp), v in by_competition.items()),
            key=lambda x: (-x["balls"], x["competition"])),
    }
    return report


def _group_count(table, column: str):
    g = table.group_by(column).aggregate([(column, "count")])
    return g[column].to_pylist(), g[f"{column}_count"].to_pylist()


def write_report(report: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.with_suffix(".json").write_text(json.dumps(report, indent=2, default=str))
    lines = [
        "# Cricsheet coverage audit", "",
        f"- Matches: **{report['matches']:,}** · balls: **{report['deliveries']:,}** "
        f"· balls with a registry player ID: {report['deliveries_with_batter_id_pct']}%",
        f"- Matches with no ball-by-ball data: {report['matches_without_balls']}", "",
        "## By format", "", "| Format | Gender | Matches |", "|---|---|---|",
        *[f"| {r['format']} | {r['gender']} | {r['matches']:,} |" for r in report["by_format"]], "",
        "## Competitions (by balls)", "",
        "| Competition | Format | Gender | Type | Matches | Balls | Seasons |", "|---|---|---|---|---|---|---|",
        *[f"| {c['competition']} | {c['format']} | {c['gender']} | {c['team_type']} | {c['matches']:,} | "
          f"{c['balls']:,} | {c['n_seasons']} ({'–'.join(c['seasons'])}) |" for c in report["competitions"]],
    ]
    path.with_suffix(".md").write_text("\n".join(lines) + "\n")
