"""Smoke test of the live static site: pages, app data (with CORS), redirects, headers, the MCP install index.

    python3 infra/site_check.py https://cricsynthesis.in
Exits non-zero if any check fails.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://cricsynthesis.in").rstrip("/")
UA = {"User-Agent": "cricsynthesis-site-check", "Origin": "https://localhost"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


raw = urllib.request.build_opener(NoRedirect)
fails = []


def get(path, follow=True):
    req = urllib.request.Request(BASE + path, headers=UA)
    try:
        r = (urllib.request.urlopen if follow else raw.open)(req, timeout=30)
        return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))
    if not ok:
        fails.append(name)


for p in ("/", "/matches/", "/pricing/", "/developers/", "/app/", "/login/", "/m/matches/", "/privacy/", "/sitemap.xml", "/robots.txt", "/llms.txt"):
    s, h, b = get(p)
    check(f"page {p}", s == 200 and len(b) > 200, f"{s}, {len(b)} bytes")
s, h, b = get("/data/index.json")
ix = json.loads(b) if s == 200 else {}
check("app data /data/index.json", s == 200 and "matches" in ix, f"{s}, {len(ix.get('matches', []))} matches")
check("CORS on /data", h.get("Access-Control-Allow-Origin") == "*", h.get("Access-Control-Allow-Origin"))
if ix.get("matches"):
    mid = ix["matches"][0]["id"]
    s, _, b = get(f"/data/matches/{mid}.json")
    check("a match forecast", s == 200 and b"summary" in b, f"{s} {mid}")
    s, _, _ = get(f"/match/{mid}/")
    check("a match page", s == 200, f"{s}")
s, h, b = get("/data/results/index.json")
check("results data", s == 200, f"{s}")
s, h, b = get("/download/app.json")
check("app update file /download/app.json", s == 200 and b"version" in b, f"{s}")
check("CORS on app.json", h.get("Access-Control-Allow-Origin") == "*", h.get("Access-Control-Allow-Origin"))
s, h, _ = get("/download/cricsynthesis.apk", follow=False)
check("APK link redirects to GitHub", s in (301, 302, 307, 308) and "github.com" in h.get("Location", ""), f"{s} {h.get('Location', '')[:70]}")
s, h, _ = get("/results/", follow=False)
check("/results/ redirects to /matches/", s in (301, 308) and h.get("Location", "").rstrip("/").endswith("/matches"), f"{s} {h.get('Location')}")
s, h, _ = get("/login.html", follow=False)
check("old .html URL redirects", s in (301, 308), f"{s} {h.get('Location')}")
s, h, b = get("/pypi/simple/")
check("MCP install index /pypi/simple/", s == 200 and b"cricsynthesis" in b.lower(), f"{s}")
s, h, _ = get("/")
check("security headers", "max-age" in h.get("Strict-Transport-Security", "") and h.get("X-Frame-Options") == "DENY",
      f"HSTS={h.get('Strict-Transport-Security')}, XFO={h.get('X-Frame-Options')}")
s, _, _ = get("/no-such-page-here/")
check("missing page gives 404", s == 404, f"{s}")
print(f"\n{len(fails)} failed" if fails else "\nall checks passed")
sys.exit(1 if fails else 0)
