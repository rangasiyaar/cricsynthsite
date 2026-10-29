"""Live-score probe: which public score endpoints answer from a cloud runner, and what their data looks like.

python infra/live/probe.py --out probe/      (run by .github/workflows/live-probe.yml; nothing is published)
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
LISTS = {
    "cb_live_page": "https://www.cricbuzz.com/cricket-match/live-scores",
    "cb_live_api": "https://www.cricbuzz.com/api/cricket-match/live-matches",
    "cb_home_api": "https://www.cricbuzz.com/match-api/livematches.json",
    "ci_current_api": "https://hs-consumer-api.espncricinfo.com/v1/pages/matches/current?lang=en&latest=true",
    "ci_live_page": "https://www.espncricinfo.com/live-cricket-score",
}
PER_MATCH = {
    "cb_commentary": "https://www.cricbuzz.com/api/cricket-match/commentary/{id}",
    "cb_scorecard_html": "https://www.cricbuzz.com/api/html/cricket-scorecard/{id}",
    "cb_mini": "https://www.cricbuzz.com/api/cricket-match/{id}/mini-scorecard",
    "cb_page": "https://www.cricbuzz.com/live-cricket-scores/{id}",
}


def get(url: str) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/html;q=0.9"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("content-type", ""), e.read()[:2000]
    except Exception as e:                                   # DNS, TLS, timeout
        return 0, type(e).__name__, str(e).encode()


def describe(name: str, status: int, ctype: str, body: bytes, out: Path) -> str:
    (out / f"{name}.txt").write_bytes(body)
    text = body.decode("utf-8", "replace")
    extra = ""
    if "json" in ctype or text[:1] in "{[":
        try:
            d = json.loads(text)
            extra = f" json keys: {list(d)[:15] if isinstance(d, dict) else f'list[{len(d)}]'}"
        except ValueError:
            pass
    else:
        links = len(set(re.findall(r"/live-cricket-scores/(\d+)", text)))
        extra = f" __NEXT_DATA__={'__NEXT_DATA__' in text} next_f={'self.__next_f' in text} match links={links}"
    line = f"{name}: {status} {ctype} {len(body)} bytes{extra}"
    print(line)
    return text


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("probe"))
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    texts = {}
    for name, url in LISTS.items():
        texts[name] = describe(name, *get(url), a.out)
        time.sleep(2)
    ids = list(dict.fromkeys(re.findall(r"/live-cricket-scores/(\d+)/([a-z0-9-]+)", texts.get("cb_live_page", ""))))
    print("cricbuzz matches on the live page:", ids[:15])
    for mid, slug in ids[:2]:
        for name, url in PER_MATCH.items():
            describe(f"{name}_{mid}", *get(url.format(id=mid) + (f"/{slug}" if name == "cb_page" else "")), a.out)
            time.sleep(2)


if __name__ == "__main__":
    main()
