"""Explore ESPN schedule and alternative endpoints."""
import requests
import json

h = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
BASE = "https://site.api.espn.com/apis/site/v2/sports/cricket"

# Test 1: Try /schedule endpoint
print("TEST 1: /schedule endpoint (international)")
try:
    r = requests.get(f"{BASE}/8039/schedule", headers=h, timeout=15)
    print(f"  Status: {r.status_code}")
    if r.status_code == 200:
        d = r.json()
        print(f"  Keys: {list(d.keys())}")
        # Schedule often has events grouped by date
        for key in list(d.keys())[:5]:
            val = d[key]
            if isinstance(val, list):
                print(f"  {key}: {len(val)} items")
                if val and isinstance(val[0], dict):
                    print(f"    First item keys: {list(val[0].keys())}")
            elif isinstance(val, dict):
                print(f"  {key}: dict with keys {list(val.keys())[:5]}")
            else:
                print(f"  {key}: {str(val)[:100]}")
except Exception as e:
    print(f"  Error: {e}")

# Test 2: Try /scoreboard with 'limit' parameter
print("\nTEST 2: Scoreboard with limit=50")
for lid, lname in [("8039", "International"), ("8048", "IPL"), ("8038", "PSL")]:
    try:
        r = requests.get(f"{BASE}/{lid}/scoreboard", headers=h, timeout=15,
                         params={"limit": 50})
        d = r.json()
        events = d.get("events", [])
        print(f"  {lname}: {len(events)} events")
        for e in events[:3]:
            comps = e.get("competitions", [{}])
            status = comps[0].get("status", {}).get("type", {}).get("description", "") if comps else ""
            note = comps[0].get("note", "") if comps else ""
            short = e.get("shortName", "")
            name = e.get("name", "?")
            date = e.get("date", "?")
            print(f"    {name} | {date} | {status} | note={note} | short={short}")
    except Exception as e:
        print(f"  {lname}: Error: {e}")

# Test 3: Try scoreboard with calendar dates param
print("\nTEST 3: Scoreboard with calendar param")
try:
    r = requests.get(f"{BASE}/8039/scoreboard", headers=h, timeout=15,
                     params={"calendar": "true"})
    d = r.json()
    print(f"  Keys: {list(d.keys())}")
    leagues = d.get("leagues", [])
    if leagues:
        print(f"  Leagues: {len(leagues)}")
        for lg in leagues:
            cal = lg.get("calendar", [])
            slug = lg.get("slug", "")
            print(f"    League slug={slug}, calendar entries: {len(cal)}")
            for ci in cal[:3]:
                if isinstance(ci, dict):
                    print(f"      {json.dumps(ci)[:150]}")
                else:
                    print(f"      {str(ci)[:150]}")
except Exception as e:
    print(f"  Error: {e}")

# Test 4: Try different date formats
print("\nTEST 4: Date param formats")
for date_param in ["2026", "20260224", "2026-02-24", "20260225"]:
    try:
        r = requests.get(f"{BASE}/8039/scoreboard", headers=h, timeout=15,
                         params={"dates": date_param})
        d = r.json()
        events = d.get("events", [])
        print(f"  dates={date_param}: {len(events)} events")
        for e in events[:2]:
            print(f"    {e.get('name')} | {e.get('date')}")
    except Exception as e:
        print(f"  dates={date_param}: Error: {e}")

# Test 5: Fetch ALL leagues at once with default params
print("\nTEST 5: All leagues, all events")
all_events = []
leagues = {
    "8039": "International", "8048": "IPL", "8044": "BBL",
    "8038": "PSL", "8049": "CPL", "8051": "T20 Blast",
    "8171": "The Hundred", "8198": "SA20", "8131": "BPL", "8173": "LPL",
}
for lid, lname in leagues.items():
    try:
        r = requests.get(f"{BASE}/{lid}/scoreboard", headers=h, timeout=10)
        d = r.json()
        events = d.get("events", [])
        for e in events:
            e["_league"] = lname
            e["_league_id"] = lid
        all_events.extend(events)
        if events:
            print(f"  {lname} ({lid}): {len(events)} events")
    except:
        pass

print(f"\nTotal across all leagues: {len(all_events)} events")
for e in all_events:
    name = e.get("name", "?")
    date = e.get("date", "?")
    league = e.get("_league", "?")
    comps = e.get("competitions", [{}])
    status = comps[0].get("status", {}).get("type", {}).get("description", "") if comps else ""
    note = comps[0].get("note", "") if comps else ""
    print(f"  [{league}] {name} | {date} | {status} | note={note}")
