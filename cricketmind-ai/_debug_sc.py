"""Debug: inspect Sportmonks scorecard data structure."""
from data.sportmonks_client import SportmonksClient

sm = SportmonksClient()
recent = sm.get_recent_fixtures(limit=1)
if not recent:
    print("No recent fixtures")
    exit()

fid = int(recent[0]["id"])
print(f"Fixture: {recent[0]['name']} (ID: {fid})")

sc = sm.get_fixture_scorecard(fid)
batting = sc.get("batting", [])
bowling = sc.get("bowling", [])
runs = sc.get("runs", [])

print(f"\n=== RUNS ({len(runs)}) ===")
for r in runs:
    t = r.get("team", {})
    tn = t.get("name", "?") if isinstance(t, dict) else "?"
    print(f"  team={tn}  team_id={r.get('team_id')}  inning={r.get('inning')}  score={r.get('score')}/{r.get('wickets')}  overs={r.get('overs')}")

print(f"\n=== BATTING ({len(batting)}) ===")
for i, b in enumerate(batting[:5]):
    bm = b.get("batsman", {})
    nm = bm.get("fullname", "?") if isinstance(bm, dict) else "?"
    print(f"  [{i}] name={nm}  team_id={b.get('team_id')}  scoreboard_id={b.get('scoreboard_id')}  sort={b.get('sort')}  score={b.get('score')}")
    print(f"       ALL KEYS: {sorted(b.keys())}")

print(f"\n=== BOWLING ({len(bowling)}) ===")
for i, bw in enumerate(bowling[:5]):
    bo = bw.get("bowler", {})
    nm = bo.get("fullname", "?") if isinstance(bo, dict) else "?"
    print(f"  [{i}] name={nm}  team_id={bw.get('team_id')}  scoreboard_id={bw.get('scoreboard_id')}  sort={bw.get('sort')}  wickets={bw.get('wickets')}")
    print(f"       ALL KEYS: {sorted(bw.keys())}")
