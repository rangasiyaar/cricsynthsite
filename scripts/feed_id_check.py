"""Read-only check: do a live feed's player ids match the Cricsheet register's cricinfo keys?

    python3 scripts/feed_id_check.py <feed.json> <people.csv>

Prints how many feed players (playing XIs and scorecards) find a register entry by id, whether the names agree,
and the ids that don't match, per match.
"""
import csv
import json
import re
import sys
import unicodedata
from collections import Counter

feed = json.load(open(sys.argv[1], encoding="utf-8"))
reg = {}
for r in csv.DictReader(open(sys.argv[2], encoding="utf-8")):
    if r.get("key_cricinfo"):
        reg[r["key_cricinfo"].strip()] = (r["identifier"], r["name"], r.get("unique_name") or r["name"])


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", "", s).split()


def same(a: str, b: str) -> bool:
    x, y = norm(a), norm(b)
    return bool(x and y) and (x[-1] == y[-1] or x == y)          # surname agrees (initials differ a lot)


tot = Counter()
print(f"register: {len(reg)} players with a cricinfo key; feed: {len(feed)} matches\n")
for m in feed:
    players = {}
    for side in ("squad_ar", "squad_br", "squad_pa", "squad_pb"):
        for p in m.get(side) or []:
            if p.get("profileid"):
                players[str(p["profileid"])] = p.get("name", "")
    for inn in m.get("items") or []:
        for p in inn.get("batsman") or []:
            pid = str(p.get("batsman_id") or p.get("profileid") or p.get("id") or "")
            if pid.isdigit():
                players.setdefault(pid, p.get("batsman", ""))
    if not players:
        print(f"- {m.get('name')} {m.get('team_a', {}).get('name')} v {m.get('team_b', {}).get('name')} [{m.get('status')}]: no player ids")
        tot["no_ids"] += 1
        continue
    hit = {pid: reg[pid] for pid in players if pid in reg}
    agree = sum(same(players[pid], hit[pid][1]) or same(players[pid], hit[pid][2]) for pid in hit)
    miss = [f"{players[p]} ({p})" for p in players if p not in reg]
    odd = [f"{players[p]} -> {hit[p][1]}" for p in hit if not (same(players[p], hit[p][1]) or same(players[p], hit[p][2]))]
    tot["players"] += len(players); tot["hit"] += len(hit); tot["agree"] += agree
    print(f"- {m.get('name')} | {m.get('team_a', {}).get('name')} v {m.get('team_b', {}).get('name')} [{m.get('status')}]: "
          f"{len(hit)}/{len(players)} found, names agree {agree}/{len(hit)}"
          + (f"\n    not in register: {', '.join(miss[:8])}{' …' if len(miss) > 8 else ''}" if miss else "")
          + (f"\n    name differs: {', '.join(odd[:5])}" if odd else ""))
print(f"\nTOTAL: {tot['hit']}/{tot['players']} feed players found in the register by id "
      f"({100 * tot['hit'] / max(1, tot['players']):.0f}%), names agree for {tot['agree']}/{tot['hit']}; "
      f"{tot['no_ids']} matches without player ids yet")
