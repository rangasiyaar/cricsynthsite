"""Read-only check: do Cricbuzz's player ids (squads pages) match the Cricsheet register's cricbuzz keys?

    uv run python scripts/cricbuzz_id_check.py <people.csv> <cricbuzz match id> [...]

For each match: players on the squads page, how many find a register entry by `key_cricbuzz`, whether the names
agree, and the ones that don't match.
"""
import csv
import re
import sys
import unicodedata

from cricsim import auto, live

reg = {}
for r in csv.DictReader(open(sys.argv[1], encoding="utf-8")):
    if r.get("key_cricbuzz"):
        reg[r["key_cricbuzz"].strip()] = (r["identifier"], r["name"], r.get("unique_name") or r["name"])
print(f"register: {len(reg)} players with a cricbuzz key")


def words(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", "", s).split()


def same(a: str, b: str) -> bool:
    x, y = words(a), words(b)
    return bool(x and y) and (x[-1] == y[-1] or x == y)


tot = [0, 0, 0]
for mid in sys.argv[2:]:
    sq = auto.squads(live.flight(live._safe(live.get, f"{live.BASE}/cricket-match-squads/{mid}")))
    players = {str(p["id"]): p["name"] for t in sq.values() for p in t["squad"] if p.get("id") is not None}
    sample = next((p for t in sq.values() for p in t["squad"]), None)
    hit = {pid: reg[pid] for pid in players if pid in reg}
    agree = sum(same(players[p], hit[p][1]) or same(players[p], hit[p][2]) for p in hit)
    tot[0] += len(players); tot[1] += len(hit); tot[2] += agree
    print(f"\nmatch {mid}: {len(players)} players with ids, {len(hit)} in the register, names agree {agree}/{len(hit)}")
    print("  a player as the page gives it:", sample)
    miss = [f"{players[p]} ({p})" for p in players if p not in reg]
    odd = [f"{players[p]} -> {hit[p][1]}" for p in hit if not (same(players[p], hit[p][1]) or same(players[p], hit[p][2]))]
    if miss: print("  not in register:", ", ".join(miss[:12]))
    if odd: print("  name differs:", ", ".join(odd[:8]))
print(f"\nTOTAL: {tot[1]}/{tot[0]} found by cricbuzz id ({100 * tot[1] / max(1, tot[0]):.0f}%), names agree {tot[2]}/{tot[1]}")
