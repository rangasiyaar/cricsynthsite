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


def competitions(path: str, types=("T20", "IT20")) -> None:
    """Every T20 competition in the archive: matches, years, and recency-weighted share (3-year half-life, as the
    model weights its training balls)."""
    today = date.today()
    agg: dict = {}
    with zipfile.ZipFile(path) as zf:
        for name in zf.namelist():
            if not name.endswith(".json"):
                continue
            info = json.loads(zf.read(name)).get("info", {})
            if info.get("match_type") not in types or not info.get("dates"):
                continue
            d = date.fromisoformat(str(info["dates"][0]))
            if d.year < 2004:
                continue
            ev = (info.get("event") or {}).get("name") or ("T20 internationals (bilateral)" if info.get("team_type") == "international" else "Other club T20")
            key = (ev, info.get("gender"), info.get("team_type"))
            a = agg.setdefault(key, [0, d, d, 0.0])
            a[0] += 1
            a[1], a[2] = min(a[1], d), max(a[2], d)
            a[3] += 0.5 ** ((today - d).days / (365.25 * 3))
    tot = sum(v[3] for v in agg.values())
    print(f"\n### T20 competitions in training ({sum(v[0] for v in agg.values()):,} matches, {len(agg)} competitions)\n")
    print("| Competition | Gender | Type | Matches | Years | Weight share |\n|---|---|---|---|---|---|")
    for (ev, g, tt), (n, d0, d1, w) in sorted(agg.items(), key=lambda kv: -kv[1][3])[:80]:
        print(f"| {ev} | {g} | {tt} | {n} | {d0.year}-{d1.year} | {100 * w / tot:.1f}% |")


if __name__ == "__main__":
    main(sys.argv[1])
    competitions(sys.argv[1])
