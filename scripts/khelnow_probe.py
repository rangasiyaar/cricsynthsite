"""Read-only check of a Khel Now live-score page: what its embedded match JSON holds, how often it changes,
and which matches its live-score list covers.

    python3 scripts/khelnow_probe.py <match page url> [polls] [seconds between polls]
"""
import json
import re
import sys
import time
import urllib.request
from collections import Counter

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
URL = sys.argv[1]
POLLS = int(sys.argv[2]) if len(sys.argv) > 2 else 20
GAP = int(sys.argv[3]) if len(sys.argv) > 3 else 15


def get(url: str) -> tuple[str, dict]:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
        return r.read().decode("utf-8", "replace"), dict(r.headers)


def next_data(html: str) -> dict:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else {}


def shape(x, depth=0, key="$", max_depth=4):
    pad = "  " * depth
    if isinstance(x, dict):
        print(f"{pad}{key}: {{{len(x)} keys}}")
        if depth < max_depth:
            for k, v in list(x.items())[:40]:
                shape(v, depth + 1, k, max_depth)
    elif isinstance(x, list):
        print(f"{pad}{key}: [{len(x)} items]")
        if x and depth < max_depth:
            shape(x[0], depth + 1, "[0]", max_depth)
    else:
        print(f"{pad}{key}: {str(x)[:90]!r}")


def walk(x, path="$"):
    if isinstance(x, dict):
        for k, v in x.items():
            yield f"{path}.{k}", k, v
            yield from walk(v, f"{path}.{k}")
    elif isinstance(x, list):
        for i, v in enumerate(x[:3]):
            yield from walk(v, f"{path}[{i}]")


def find(d, pattern):
    rx = re.compile(pattern, re.I)
    seen = set()
    for path, k, v in walk(d):
        p = re.sub(r"\[\d+\]", "[]", path)
        if rx.search(k) and p not in seen:
            seen.add(p)
            yield p, v


# ── 1. what the page carries ──
html, headers = get(URL)
print("headers:", {k: v for k, v in headers.items() if k.lower() in ("cache-control", "age", "last-modified", "x-cache", "cf-cache-status", "x-nextjs-cache", "date", "etag")})
nd = next_data(html)
data = nd.get("props", {}).get("pageProps", {}).get("data", {})
print(f"\n__NEXT_DATA__: {len(json.dumps(nd))} chars; pageProps keys: {list(nd.get('props', {}).get('pageProps', {}).keys())}")
print("\n== SHAPE of pageProps.data ==")
shape(data, max_depth=4)

print("\n== FIELDS BY TOPIC (path → sample) ==")
topics = {
    "toss": r"toss",
    "XIs / squads / players": r"squad|playing|lineup|players?$|xi$|^team_?[ab]?_?players",
    "player ids": r"^pid$|player_id|batsman_id|bowler_id|^id$",
    "roles / styles / captain / keeper": r"role|style|captain|keeper|^wk$|overseas|substitute|impact",
    "chase": r"target|required|need|rrr|req_",
    "venue / time / format": r"venue|ground|date_start|timestamp|start|format|toss_|umpire|referee",
    "live state": r"^live|current|striker|non_striker|partnership|last_?\d|recent|fow|fall",
    "result": r"result|winner|win_|status_note|status_str",
}
for name, pat in topics.items():
    hits = list(find(data, pat))
    print(f"\n[{name}] {len(hits)} paths")
    for p, v in hits[:18]:
        s = json.dumps(v, ensure_ascii=False) if not isinstance(v, (dict, list)) else (
            f"<{type(v).__name__} {len(v)}> " + json.dumps(v, ensure_ascii=False)[:260])
        print(f"  {p} = {s[:300]}")

# one full player record and one commentary ball, as given
for p, v in find(data, r"^players$|^squad|playing_?xi|^team_?[ab]_?squad"):
    if isinstance(v, list) and v and isinstance(v[0], dict):
        print("\nONE PLAYER RECORD at", p, ":", json.dumps(v[0], ensure_ascii=False)[:900])
        break
    if isinstance(v, dict):
        for kk, vv in v.items():
            if isinstance(vv, list) and vv and isinstance(vv[0], dict):
                print(f"\nONE PLAYER RECORD at {p}.{kk}:", json.dumps(vv[0], ensure_ascii=False)[:900])
                break
        else:
            continue
        break
for p, v in find(data, r"commentar"):
    if isinstance(v, list) and v:
        print(f"\nCOMMENTARY at {p}: {len(v)} items; first:", json.dumps(v[0], ensure_ascii=False)[:900])
        print("  last:", json.dumps(v[-1], ensure_ascii=False)[:500])
        break
print("\nmatch_info:", json.dumps(data.get("match_info", {}), ensure_ascii=False)[:3000])


# ── 2. how often it changes ──
def state(d: dict) -> str:
    mi = d.get("match_info", {}) if isinstance(d, dict) else {}
    bits = []
    for k in ("status_note", "status_str", "game_state_str", "live", "result"):
        if mi.get(k):
            bits.append(f"{k}={str(mi[k])[:60]}")
    for p, v in find(d, r"^scores$|^scores_full$"):
        if not isinstance(v, (dict, list)):
            bits.append(f"{p.split('.')[-1]}={v}")
    for p, v in find(d, r"commentar"):
        if isinstance(v, list) and v:
            last = v[-1] if isinstance(v[-1], dict) else {}
            first = v[0] if isinstance(v[0], dict) else {}
            bits.append(f"comm={len(v)} first_over={first.get('over')}.{first.get('ball')} last_over={last.get('over')}.{last.get('ball')}")
            break
    return " | ".join(bits)


print(f"\n== POLLING {POLLS}x every {GAP}s ==")
prev, changes = None, []
t0 = time.time()
for i in range(POLLS):
    try:
        h, hd = get(URL)
        s = state(next_data(h).get("props", {}).get("pageProps", {}).get("data", {}))
    except Exception as e:
        s, hd = f"error {e}", {}
    t = time.time() - t0
    mark = "CHANGED" if s != prev else "same"
    if s != prev:
        changes.append(t)
    print(f"t={t:5.0f}s age={hd.get('Age', hd.get('age', '-'))} {mark}: {s[:260]}")
    prev = s
    if i < POLLS - 1:
        time.sleep(GAP)
gaps = [round(b - a) for a, b in zip(changes, changes[1:])]
print(f"changes seen: {len(changes)}; seconds between changes: {gaps}")

# ── 3. coverage of the live-score list ──
print("\n== LIVE-SCORE LIST ==")
for list_url in ("https://khelnow.com/cricket/live-score", "https://khelnow.com/live-cricket-score"):
    try:
        lh, _ = get(list_url)
    except Exception as e:
        print(list_url, "failed:", e)
        continue
    links = sorted(set(re.findall(r'href="(/live-cricket-score/[^"]+)"', lh)))
    print(f"{list_url}: {len(links)} match links")
    nd2 = next_data(lh)
    pp = nd2.get("props", {}).get("pageProps", {})
    print("  pageProps keys:", list(pp.keys())[:20])
    comps = Counter()
    for p, v in find(pp, r"competition|series|tournament"):
        if isinstance(v, dict) and v.get("title"):
            comps[v["title"]] += 1
        elif isinstance(v, str) and len(v) < 80 and not v.isdigit():
            comps[v] += 1
    print("  competitions:", dict(comps.most_common(40)))
    for l in links[:60]:
        print("   ", l)
