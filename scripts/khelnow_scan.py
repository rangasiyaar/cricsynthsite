"""Read-only scan of Khel Now finished matches against Cricsheet's recent matches.

    python3 scripts/khelnow_scan.py <cricsheet recently_played json zip> [max pages]

1. discovery: match pages in Khel Now's sitemaps, by date and competition
2. Cricsheet lag: recent Khel Now limited-overs results with no Cricsheet match yet
3. accuracy: for matches in both, ball-by-ball agreement (runs, extras, wickets), and how retired hurt,
   super overs and DLS show up
4. identity: Khel Now players linked to Cricsheet register ids by name within the same match
"""
import gzip
import io
import json
import re
import sys
import time
import unicodedata
import urllib.request
import zipfile
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
ZIP = sys.argv[1]
MAX_PAGES = int(sys.argv[2]) if len(sys.argv) > 2 else 220
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                      "september", "october", "november", "december"], 1)}
fetched = 0


def get(url: str) -> str:
    global fetched
    fetched += 1
    time.sleep(0.8)                      # polite: under ~1 request a second
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
        raw = r.read()
    if url.endswith(".gz") or raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return raw.decode("utf-8", "replace")


def words(s: str) -> list[str]:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s).split()


def slug_date(url: str):
    m = re.search(r"-(\d{1,2})(?:st|nd|rd|th)-([a-z]+)-(\d{4})", url)
    if m and m.group(2) in MONTHS:
        try:
            return date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))
        except ValueError:
            return None
    return None


# ── 1. discovery ──
print("== SITEMAPS ==")
pages, seen_maps = {}, set()
queue = ["https://khelnow.com/sitemap.xml", "https://khelnow.com/robots.txt"]
while queue and len(seen_maps) < 40:
    u = queue.pop(0)
    if u in seen_maps:
        continue
    seen_maps.add(u)
    try:
        body = get(u)
    except Exception as e:
        print(" ", u, "failed:", e)
        continue
    if u.endswith("robots.txt"):
        queue += re.findall(r"(?im)^sitemap:\s*(\S+)", body)
        continue
    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
    subs = [l for l in locs if re.search(r"sitemap|\.xml", l) and "live-cricket-score/" not in l]
    mats = [l for l in locs if "/live-cricket-score/" in l]
    print(f"  {u}: {len(locs)} locs, {len(subs)} sub-sitemaps, {len(mats)} match pages")
    if subs:
        kinds = Counter(re.sub(r"[-_]?\d+", "", s.rsplit("/", 1)[-1]) for s in subs)
        print("    sitemap kinds:", dict(kinds.most_common(60)))
    # follow only sitemaps that look like match / score pages (not team, player, news, video)
    def num(s):
        m = re.search(r"(\d+)\.xml", s)
        return int(m.group(1)) if m else 0
    for s in sorted(subs, key=num, reverse=True):
        name = s.rsplit("/", 1)[-1]
        if re.search(r"score|match|fixture|live|result|schedule", name, re.I):
            queue.append(s)
    if mats and len(pages) > 3000:
        queue = []
    for l in mats:
        pages[l] = slug_date(l)
print(f"match pages found: {len(pages)}; fetched {fetched} sitemap files")
if not pages:                                   # fall back to the paged live-score list
    print("\n== LIST PAGES (fallback) ==")
    for p in range(1, 4):
        for u in (f"https://khelnow.com/cricket/live-score?page={p}", f"https://khelnow.com/cricket/live-score/{p}"):
            try:
                h = get(u)
            except Exception as e:
                print(" ", u, "failed:", e)
                continue
            m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
            pp = json.loads(m.group(1)).get("props", {}).get("pageProps", {}) if m else {}
            ms = pp.get("initialMatches") or []
            hrefs = sorted(set(re.findall(r'href="(/live-cricket-score/[^"]+)"', h)))
            print(f"  {u}: {len(ms)} items, {len(hrefs)} hrefs, pagination {json.dumps(pp.get('initialPagination'))[:120]}")
            print("    first ids:", [(x.get('matchId'), x.get('dateStart')) for x in ms[:4]])
    # does a page answer by id alone?
    for u in ("https://khelnow.com/live-cricket-score/41339", "https://khelnow.com/live-cricket-score/x-41339"):
        try:
            h = get(u)
            print(" ", u, "->", len(h), "bytes; has match:", '"match_info"' in h)
        except Exception as e:
            print(" ", u, "failed:", e)
dated = {u: d for u, d in pages.items() if d}
if dated:
    print("date range:", min(dated.values()), "..", max(dated.values()))
recent = {u: d for u, d in dated.items() if date.today() - timedelta(days=30) <= d < date.today()}
print(f"future fixtures listed: {sum(1 for d in dated.values() if d >= date.today())}")
print(f"last 30 days: {len(recent)} match pages")
comp = Counter()
for u in recent:
    s = u.rsplit("/", 1)[-1]
    s = re.sub(r"-\d{1,2}(st|nd|rd|th)-[a-z]+-\d{4}.*$", "", s)
    s = s.split("-vs-", 1)[-1]
    comp[" ".join(s.split("-")[2:6]) or s] += 1
print("by competition-ish (last 30 days):")
for k, n in comp.most_common(40):
    print(f"  {n:4d}  {k}")


def next_data(html: str) -> dict:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    return json.loads(m.group(1)).get("props", {}).get("pageProps", {}).get("data", {}) if m else {}


# ── 2. Cricsheet's recent matches ──
z = zipfile.ZipFile(ZIP)
cs = []
for n in z.namelist():
    if n.endswith(".json"):
        d = json.loads(z.read(n))
        info = d["info"]
        if info.get("match_type") in ("T20", "IT20", "ODI", "ODM", "MDM", "Test") and info.get("dates"):
            cs.append((n, d))
print(f"\n== CRICSHEET recent zip: {len(cs)} matches; dates {min(d['info']['dates'][0] for _, d in cs)} .. "
      f"{max(d['info']['dates'][0] for _, d in cs)}")


def find_cs(url: str, d0: date):
    slug = url.rsplit("/", 1)[-1].replace("-", " ")
    sw = set(words(slug))
    best = None
    for n, d in cs:
        cd = date.fromisoformat(d["info"]["dates"][0])
        if abs((cd - d0).days) > 1:
            continue
        t1, t2 = d["info"]["teams"]
        hit = sum(1 for t in (t1, t2) if set(words(t)) and len(set(words(t)) & sw) >= max(1, len(set(words(t))) - 1))
        if hit == 2:
            best = (n, d)
    return best


# ── 3/4. compare ──
todo = sorted(recent.items(), key=lambda x: x[1], reverse=True)
stats = Counter()
lag = Counter()
how_out = Counter()
retired, superover, dls, unverified = [], [], [], []
ball_agree = []
link_total = link_hit = 0
link_examples, link_miss = [], []
for url, d0 in todo:
    if fetched >= MAX_PAGES:
        break
    try:
        data = next_data(get(url))
    except Exception as e:
        stats["fetch_failed"] += 1
        if stats["fetch_failed"] <= 5:
            print("  fetch failed:", url, e)
        continue
    mi = data.get("match_info") or {}
    if str(mi.get("status")) != "2":          # completed only
        stats["not_completed"] += 1
        continue
    fmt = mi.get("format_str") or "?"
    stats[f"completed {fmt}"] += 1
    if mi.get("verified") != "true":
        unverified.append(url)
    if str(mi.get("match_dls_affected")) == "true":
        dls.append((url, mi.get("result")))
    found = find_cs(url, d0) if fmt in ("T20", "T20I", "ODI", "List A", "T10", "100-ball") else None
    days_old = (date.today() - d0).days
    lag[(min(days_old, 30) // 3 * 3, bool(found))] += 1
    ins_list = data.get("matchInsights") or []
    for ins in ins_list:
        for inn in (ins.get("score_card") or {}).get("innings") or []:
            if str(inn.get("issuperover")) == "true":
                superover.append(url)
            for b in inn.get("batsmen") or []:
                how_out[b.get("dismissal") or "-"] += 1
                if "retired" in (b.get("how_out") or "").lower():
                    retired.append((url, b.get("name"), b.get("how_out"), b.get("dismissal")))
    if not found:
        continue
    stats["in both"] += 1
    n, csd = found
    # players: Khel Now XI v Cricsheet registry, per team
    sq = data.get("squad") or {}
    reg = csd["info"].get("registry", {}).get("people", {})
    cs_players = {p for t in csd["info"].get("players", {}).values() for p in t}
    for side in ("teama", "teamb"):
        for p in (sq.get(side) or {}).get("squads") or []:
            if p.get("playing11") != "true":
                continue
            link_total += 1
            kw = words(p.get("name"))
            cands = [c for c in cs_players if words(c) and kw and words(c)[-1] == kw[-1]
                     and words(c)[0][0] == kw[0][0]]
            if len(cands) == 1:
                link_hit += 1
                if len(link_examples) < 6:
                    link_examples.append(f"{p.get('name')} ({p.get('player_id')}) -> {cands[0]} ({reg.get(cands[0], '?')[:8]})")
            elif len(link_miss) < 15:
                link_miss.append(f"{p.get('name')} [{len(cands)} cands]")
    # balls: compare per innings in order
    cs_inns = [i for i in csd["innings"] if not i.get("super_over")]
    for k, ins in enumerate(ins_list[:len(cs_inns)]):
        kb = [c for c in ins.get("commentary") or [] if c.get("event") in ("ball", "wicket")]
        cb = [dv for ov in cs_inns[k].get("overs", []) for dv in ov["deliveries"]]
        def ksig(c):
            return (int(c.get("run") or 0), bool(c.get("wideball")), bool(c.get("noball")), c.get("event") == "wicket")
        def csig(dv):
            ex = dv.get("extras", {})
            return (dv["runs"]["total"], "wides" in ex, "noballs" in ex, bool(dv.get("wickets")))
        ks, cs_ = [ksig(c) for c in kb], [csig(dv) for dv in cb]
        same = sum(1 for a, b in zip(ks, cs_) if a == b)
        ball_agree.append((url.rsplit("/", 1)[-1][:60], k + 1, len(ks), len(cs_), same,
                           sum(x[0] for x in ks), sum(x[0] for x in cs_)))
        # how Cricsheet's retirements show in Khel Now
        for dv in cb:
            for w in dv.get("wickets", []):
                if "retired" in w["kind"]:
                    retired.append((url, w["player_out"], f"cricsheet: {w['kind']}", "-"))

print(f"\n== SCAN: {fetched} requests in total ==")
print("pages:", dict(stats))
print("\nCricsheet lag (days since match -> found in Cricsheet?):")
for (bucket, ok), n in sorted(lag.items()):
    print(f"  {bucket:2d}-{bucket + 2:2d} days  {'in Cricsheet' if ok else 'missing    '}  {n}")
print("\ndismissal values on batter rows:", dict(how_out.most_common(20)))
print("retired (Khel Now rows and Cricsheet wickets):", retired[:12])
print("super-over innings:", superover[:5])
print("DLS-affected:", dls[:5])
print(f"not verified: {len(unverified)} of {sum(v for k, v in stats.items() if k.startswith('completed'))}")
print("\nball-by-ball v Cricsheet (match, innings, khel balls, cricsheet balls, same signature, khel runs, cs runs):")
for row in ball_agree:
    print("  ", row)
tb = sum(r[3] for r in ball_agree)
ts = sum(r[4] for r in ball_agree)
print(f"TOTAL ball agreement: {ts}/{tb} ({100 * ts / max(1, tb):.1f}%); innings with equal runs: "
      f"{sum(r[5] == r[6] for r in ball_agree)}/{len(ball_agree)}")
print(f"\nplayer link (XI name -> Cricsheet player in same match): {link_hit}/{link_total} "
      f"({100 * link_hit / max(1, link_total):.0f}%)")
print("  examples:", link_examples)
print("  misses:", link_miss)
