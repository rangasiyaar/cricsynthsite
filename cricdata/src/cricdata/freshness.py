"""How current is the Cricsheet archive? Newest matches overall and by format, and how many recent matches it has.

    python -m cricdata.freshness data/raw/all_json.zip
"""
from __future__ import annotations

import json
import sys
import zipfile
from collections import Counter
from datetime import date, timedelta


def main(path: str) -> None:
    today = date.today()
    rows = []
    with zipfile.ZipFile(path) as zf:
        for name in zf.namelist():
            if not name.endswith(".json"):
                continue
            info = json.loads(zf.read(name)).get("info", {})
            dates = info.get("dates") or []
            if not dates:
                continue
            d = date.fromisoformat(str(dates[-1]))
            teams = " v ".join(info.get("teams") or [])
            rows.append((d, info.get("match_type"), info.get("gender"), teams, (info.get("event") or {}).get("name", "")))
    rows.sort(reverse=True)
    print(f"### Cricsheet freshness ({today})\n")
    print(f"{len(rows):,} matches. Newest: **{rows[0][0]}** ({(today - rows[0][0]).days} days ago).\n")
    print("| Window | Matches |\n|---|---|")
    for days in (3, 7, 14, 30):
        print(f"| last {days} days | {sum(r[0] >= today - timedelta(days=days) for r in rows)} |")
    print("\n| Type | Gender | Newest |\n|---|---|---|")
    seen = {}
    for r in rows:
        seen.setdefault((r[1], r[2]), r[0])
    for (t, g), d in sorted(seen.items(), key=lambda kv: kv[1], reverse=True)[:10]:
        print(f"| {t} | {g} | {d} |")
    print("\nNewest 15 matches:\n\n| Date | Type | Gender | Teams | Event |\n|---|---|---|---|---|")
    for d, t, g, teams, ev in rows[:15]:
        print(f"| {d} | {t} | {g} | {teams} | {ev} |")
    print("\nMatches per day, last 14 days: " + ", ".join(
        f"{d.strftime('%d %b')}: {n}" for d, n in sorted(Counter(r[0] for r in rows if r[0] >= today - timedelta(days=14)).items())))


if __name__ == "__main__":
    main(sys.argv[1])
