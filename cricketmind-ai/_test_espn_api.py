"""Test ESPN public API endpoints for cricket data."""
import requests
import json

h = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

# 1. Scoreboard (current/upcoming matches)
print("=" * 60)
print("1. SCOREBOARD (league 8039 = international)")
print("=" * 60)
r = requests.get(
    "https://site.api.espn.com/apis/site/v2/sports/cricket/8039/scoreboard",
    headers=h, timeout=10,
)
d = r.json()
print(f"Status: {r.status_code}, Keys: {list(d.keys())}")
events = d.get("events", [])
print(f"Events: {len(events)}")

for i, e in enumerate(events[:3]):
    print(f"\n  [{i}] {e.get('name')} | {e.get('date')}")
    comps = e.get("competitions", [])
    if comps:
        c = comps[0]
        venue = c.get("venue", {})
        print(f"      Venue: {venue.get('fullName', 'N/A')}")
        print(f"      Status: {c.get('status', {}).get('type', {}).get('description')}")
        # Toss
        notes = c.get("notes", [])
        for n in notes:
            print(f"      Note: {n.get('headline', '')} {n.get('text', '')}")
        # Teams and rosters
        for t in c.get("competitors", []):
            team_name = t.get("team", {}).get("displayName", "Unknown")
            roster = t.get("roster", [])
            lineup = t.get("lineup", [])
            print(f"      Team: {team_name} | Roster: {len(roster)} | Lineup: {len(lineup)}")
            if roster:
                for p in roster[:3]:
                    pid = p.get("playerId", p.get("id", ""))
                    pname = p.get("athlete", {}).get("displayName", p.get("fullName", "?"))
                    print(f"        - {pname} (ID: {pid})")

# 2. Try different league IDs
print("\n" + "=" * 60)
print("2. TESTING OTHER LEAGUE IDS")
print("=" * 60)
league_ids = [
    ("8039", "International"),
    ("8048", "IPL"),
    ("8044", "BBL"),
]
for lid, lname in league_ids:
    r2 = requests.get(
        f"https://site.api.espn.com/apis/site/v2/sports/cricket/{lid}/scoreboard",
        headers=h, timeout=10,
    )
    ev_count = len(r2.json().get("events", []))
    print(f"  {lid} ({lname}): {r2.status_code} — {ev_count} events")

# 3. Try match detail endpoint
print("\n" + "=" * 60)
print("3. MATCH DETAIL")
print("=" * 60)
if events:
    eid = events[0].get("id")
    r3 = requests.get(
        f"https://site.api.espn.com/apis/site/v2/sports/cricket/8039/summary?event={eid}",
        headers=h, timeout=10,
    )
    print(f"Match detail for ID {eid}: {r3.status_code}")
    if r3.status_code == 200:
        md = r3.json()
        print(f"Keys: {list(md.keys())}")
        # Check for roster/squad data
        rosters = md.get("rosters", [])
        print(f"Rosters: {len(rosters)}")
        if rosters:
            for roster in rosters[:2]:
                team_name = roster.get("team", {}).get("displayName", "?")
                players = roster.get("roster", [])
                print(f"  {team_name}: {len(players)} players")
                for p in players[:3]:
                    ath = p.get("athlete", {})
                    print(f"    - {ath.get('displayName', '?')} | {ath.get('position', {}).get('name', '?')}")
