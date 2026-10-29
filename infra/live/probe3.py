"""Live probe, step 3: schedule, squads / playing XIs and a finished match's full scorecard, printed by key.

uv run python infra/live/probe3.py [finished_id] [upcoming_id]      (run by .github/workflows/live-probe.yml)
"""
from __future__ import annotations

import json
import re
import sys
import time

from cricsim.live import BASE, first, flight, get, objects


def show(label: str, o, n: int = 1500) -> None:
    print(f"--- {label}: {json.dumps(o)[:n] if o is not None else '-'}")


def keys_near(text: str, words: tuple[str, ...]) -> None:
    for w in words:
        i = text.find(f'"{w}"')
        print(f"--- {w} @ {i}: {text[i:i + 900] if i >= 0 else '-'}")


def main() -> None:
    fin = sys.argv[1] if len(sys.argv) > 1 else None
    up = sys.argv[2] if len(sys.argv) > 2 else None
    for url in (f"{BASE}/cricket-schedule/upcoming-series/all", f"{BASE}/cricket-schedule/upcoming-series/international",
                f"{BASE}/cricket-schedule/upcoming-series/league", f"{BASE}/cricket-schedule/upcoming-series/women"):
        time.sleep(2)
        try:
            text = flight(get(url))
        except Exception as e:                                   # noqa: BLE001
            print(f"===== {url}: {e}")
            continue
        mi = objects(text, "matchInfo")
        print(f"\n===== {url}: flight {len(text)} chars, {len(mi)} matchInfo")
        for m in mi[:3]:
            show("matchInfo", m, 900)
        if not mi:
            keys_near(text, ("matchScheduleMap", "scheduleAdWrapper", "matchScheduleList", "seriesName", "matchId"))
        if not up and mi:
            later = [m for m in mi if m.get("state") in ("Upcoming", "Preview")]
            up = str((later or mi)[0]["matchId"])
    if not fin:
        html = get(f"{BASE}/cricket-match/live-scores")
        done = [m for m in objects(flight(html), "matchInfo") if (m.get("state") or "").lower() == "complete"]
        fin = str(done[0]["matchId"]) if done else None
    print(f"\nfinished {fin}, upcoming {up}")
    for mid, kinds in ((fin, ("live-cricket-scorecard", "cricket-match-squads")), (up, ("cricket-match-squads", "live-cricket-scores"))):
        if not mid:
            continue
        for kind in kinds:
            time.sleep(2)
            text = flight(get(f"{BASE}/{kind}/{mid}"))
            print(f"\n===== {kind} {mid}: flight {len(text)} chars")
            head = first(text, "matchHeader", int(mid))
            show("matchHeader", head, 2500)
            if kind == "live-cricket-scorecard":
                m = re.search(r'"scoreCard":\s*(?=\[)', text)
                if m:
                    cards = json.JSONDecoder().raw_decode(text, m.end())[0]
                    c = cards[0]
                    print("innings keys:", list(c))
                    for k in ("batTeamDetails", "bowlTeamDetails", "scoreDetails", "extrasData", "wicketsData", "ppData"):
                        show(k, c.get(k), 1800)
            else:
                keys_near(text, ("playerDetails", "playingXI", "players", "playing XI", "bench", "squads", "isPlaying",
                                  "role", "venueInfo", "matchStartTimestamp", "seriesName"))


if __name__ == "__main__":
    main()
