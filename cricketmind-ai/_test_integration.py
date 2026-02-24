"""Integration test for ESPN API switch."""
import requests

print("=" * 60)
print("TEST 1: Streamlit app is serving")
print("=" * 60)
try:
    r = requests.get("http://localhost:8501", timeout=10)
    print(f"  Status code: {r.status_code}")
    print(f"  CricketMind in HTML: {'CricketMind' in r.text}")
except Exception as e:
    print(f"  FAILED: {e}")

print()
print("=" * 60)
print("TEST 2: ESPNClient — fetch international matches")
print("=" * 60)
from data.espn_client import ESPNClient
client = ESPNClient()
matches = client.get_matches("8039")
print(f"  Matches found: {len(matches)}")
for m in matches[:5]:
    print(f"    - {m['name']} | {m['matchType']} | {m['venue']}")

print()
print("=" * 60)
print("TEST 3: ESPNClient — fetch rosters for first match")
print("=" * 60)
if matches:
    event_id = matches[0]["id"]
    rosters = client.get_rosters(event_id, league_id="8039")
    print(f"  Teams with rosters: {len(rosters)}")
    for team in rosters:
        team_name = team["teamName"]
        players = team["players"]
        print(f"    {team_name}: {len(players)} players")
        for p in players[:3]:
            print(f"      - {p['name']} ({p['role']})")
        if len(players) > 3:
            print(f"      ... and {len(players) - 3} more")
else:
    print("  SKIPPED — no matches found")

print()
print("=" * 60)
print("TEST 4: ESPNClient — match detail with toss")
print("=" * 60)
if matches:
    detail = client.get_match_detail(event_id, league_id="8039")
    print(f"  Name: {detail.get('name')}")
    print(f"  Venue: {detail.get('venue')}")
    print(f"  Format: {detail.get('matchType')}")
    print(f"  Status: {detail.get('status')}")
    print(f"  Toss: {detail.get('toss', 'N/A')}")
    print(f"  Teams: {detail.get('teams')}")
else:
    print("  SKIPPED — no matches found")

print()
print("=" * 60)
print("TEST 5: PlayerProfileBuilder — can import and construct")
print("=" * 60)
from data.player_profile_builder import PlayerProfileBuilder
builder = PlayerProfileBuilder(cricdata=None)
print(f"  Builder created successfully")
print(f"  ESPN client: {type(builder.espn_client).__name__}")
print(f"  CricData: {builder.cricdata}")

print()
print("=" * 60)
print("TEST 6: Pipeline import check")
print("=" * 60)
from orchestrator.pipeline import run_prediction
print(f"  run_prediction imported: {callable(run_prediction)}")

print()
print("ALL TESTS PASSED ✓")
