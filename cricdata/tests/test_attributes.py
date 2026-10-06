import csv

from cricdata.attributes import apply_overrides, batting_hand, bowling, normalise


def test_batting_hand():
    assert batting_hand("Right hand Bat") == "right"
    assert batting_hand("Left-hand bat") == "left"
    assert batting_hand("Right-arm offbreak") is None      # bowling style in the wrong column
    assert batting_hand(None) is None


def test_bowling_styles():
    assert bowling("Left arm Fast medium") == ("left", "pace", "fast_medium")
    assert bowling("Right-arm medium-fast") == ("right", "pace", "medium_fast")
    assert bowling("Right arm Fast") == ("right", "pace", "fast")
    assert bowling("Right arm Offbreak") == ("right", "off_spin", None)
    assert bowling("Legbreak Googly") == ("right", "leg_spin", None)
    assert bowling("Slow Left arm Orthodox") == ("left", "left_arm_orthodox", None)
    assert bowling("Left arm Wrist spin") == ("left", "left_arm_wrist", None)
    assert bowling("Right arm Medium, Right arm Offbreak") == ("right", "pace", "medium")   # primary style
    assert bowling("Right arm Slow") == ("right", "slow", None)
    assert bowling("Right arm Bowler") == ("right", None, None)
    assert bowling("(Unknown Arm) Slow") == (None, "slow", None)
    assert bowling(None) == (None, None, None)


def test_normalise_and_overrides(tmp_path):
    t = normalise([{"cricsheet_id": "a1", "batting_style": "Left hand Bat", "bowling_style": "Legbreak"},
                   {"cricsheet_id": "a1", "batting_style": "Right hand Bat", "bowling_style": None},   # dup
                   {"cricsheet_id": None, "batting_style": "Right hand Bat", "bowling_style": None}])
    assert t.num_rows == 1 and t.column("bowling_kind").to_pylist() == ["leg_spin"]
    ov = tmp_path / "ov.csv"
    with ov.open("w", newline="") as fh:
        w = csv.DictWriter(fh, ["player_id", "batting_hand", "bowling_arm", "bowling_kind"])
        w.writeheader()
        w.writerow({"player_id": "a1", "batting_hand": "right"})
        w.writerow({"player_id": "new", "batting_hand": "left", "bowling_arm": "left", "bowling_kind": "pace"})
    rows = {r["player_id"]: r for r in apply_overrides(t, ov).to_pylist()}
    assert rows["a1"]["batting_hand"] == "right" and rows["a1"]["bowling_kind"] == "leg_spin"
    assert rows["new"]["source"] == "override" and rows["new"]["bowling_kind"] == "pace"
