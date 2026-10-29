"""Live-score probe, step 2: the data embedded in a live match page (Next.js flight chunks), printed by key.

python infra/live/probe2.py      (run by .github/workflows/live-probe.yml)
"""
from __future__ import annotations

import json
import re
import sys
import time

sys.path.insert(0, "infra/live")
from probe import get  # noqa: E402

KEYS = ("miniscore", "batsmanStriker", "batsmanNonStriker", "bowlerStriker", "inningsScoreList", "matchHeader",
        "matchScoreDetails", "currentRunRate", "overs", "scoreCard", "batTeamDetails", "playersData", "state")


def flight(html: str) -> str:
    """The joined text of every self.__next_f.push([1,"..."]) chunk."""
    out = []
    for m in re.finditer(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html):
        try:
            out.append(json.loads(m.group(1)))
        except ValueError:
            pass
    return "".join(out)


def main() -> None:
    _, _, body = get("https://www.cricbuzz.com/cricket-match/live-scores")
    html = body.decode("utf-8", "replace")
    ids = list(dict.fromkeys(re.findall(r"/live-cricket-scores/(\d+)/([a-z0-9-]+)", html)))
    live = [(i, s) for i, s in ids if "t20" in s or "odi" in s or "match" in s][:3]
    print("probing", live)
    for mid, slug in live:
        for kind in ("live-cricket-scores", "live-cricket-scorecard"):
            time.sleep(2)
            status, _, body = get(f"https://www.cricbuzz.com/{kind}/{mid}/{slug}")
            text = flight(body.decode("utf-8", "replace"))
            print(f"\n===== {kind} {mid} {slug}: {status}, flight {len(text)} chars")
            for k in KEYS:
                i = text.find(f'"{k}"')
                print(f"--- {k} @ {i}: {text[i:i + 700] if i >= 0 else '-'}")


if __name__ == "__main__":
    main()
