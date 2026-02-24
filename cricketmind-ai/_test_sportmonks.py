"""Test squad fallback for an upcoming fixture."""
from data.sportmonks_client import SportmonksClient

client = SportmonksClient()

# Get upcoming fixtures
fixtures = client.get_upcoming_fixtures()
print(f"Upcoming: {len(fixtures)} fixtures")
if not fixtures:
    print("No fixtures!")
    exit()

# Pick first fixture (Hong Kong vs Kuwait)
fix = fixtures[0]
fix_id = int(fix["id"])
print(f"\nTesting: {fix['name']} | {fix['date']} | ID={fix_id}")

# Try lineups first
print("\n--- Lineups ---")
lineups = client.get_fixture_lineups(fix_id)
print(f"Lineup teams: {len(lineups)}")

# Fallback to squads
print("\n--- Squad Fallback ---")
squads = client.get_fixture_squads(fix_id)
print(f"Squad teams: {len(squads)}")
for team in squads:
    print(f"\n  {team['teamName']}: {len(team['players'])} players")
    for p in team["players"]:
        print(f"    {p['name']} | {p['role']} | id={p['id']}")

# Test NZ vs SA  
print("\n\n=== NZ vs SA ===")
nz_fix = None
for f in fixtures:
    if "New Zealand" in f["name"]:
        nz_fix = f
        break

if nz_fix:
    fix_id = int(nz_fix["id"])
    print(f"Testing: {nz_fix['name']} | ID={fix_id}")
    squads = client.get_fixture_squads(fix_id)
    print(f"Squad teams: {len(squads)}")
    for team in squads:
        print(f"\n  {team['teamName']}: {len(team['players'])} players")
        for p in team["players"][:5]:
            print(f"    {p['name']} | {p['role']}")
        if len(team["players"]) > 5:
            print(f"    ... and {len(team['players']) - 5} more")
