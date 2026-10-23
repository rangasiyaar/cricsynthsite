from cricsim.resolve import match_name

POOL = [{"id": "np", "name": "N Pooran", "last": "2026-09-01", "n": 120, "names": {"N Pooran", "Nicholas Pooran"}},
        {"id": "sh", "name": "SD Hope", "last": "2026-09-01", "n": 90, "names": {"SD Hope"}},
        {"id": "jn", "name": "J Nkomo", "last": "2026-09-01", "n": 99, "names": {"J Nkomo"}},
        {"id": "kusal", "name": "BKG Mendis", "last": "2026-09-27", "n": 320, "names": {"BKG Mendis", "Kusal Mendis"}},
        {"id": "kamindu", "name": "PHKD Mendis", "last": "2026-09-20", "n": 90, "names": {"PHKD Mendis"}},
        {"id": "vu", "name": "Vathila Udara", "last": "2026-09-05", "n": 19, "names": {"Vathila Udara"}},
        {"id": "hn", "name": "Hassan Nawaz", "last": "2026-10-03", "n": 28, "names": {"Hassan Nawaz"}},
        {"id": "sm", "name": "Salman Mirza", "last": "2026-02-24", "n": 16, "names": {"Salman Mirza"}},
        {"id": "aw", "name": "Abdul Wahid", "last": "2025-07-22", "n": 12, "names": {"Abdul Wahid"}},
        {"id": "sa", "name": "Syed Aziz", "last": "2026-09-24", "n": 150, "names": {"Syed Aziz"}}]


def test_full_name_and_initials():
    assert match_name("Nicholas Pooran", POOL)[0]["id"] == "np"
    assert match_name("Shai Hope", POOL)[0]["id"] == "sh"
    assert match_name("Josephine Nkomo", POOL)[0]["id"] == "jn"


def test_surname_alone_is_not_enough():
    assert match_name("Kamil Pooran", POOL)[0] is None


def test_first_name_must_agree():
    assert match_name("Lahiru Udara", POOL)[0] is None            # "l" is in "Vathila", but that's another player
    assert match_name("Hasan Nawaz", POOL)[0]["id"] == "hn"         # spelling variant, same initial
    assert match_name("Mohammad Salman Mirza", POOL)[0]["id"] == "sm"   # extra given name
    assert match_name("Aqeel Wahid", POOL)[0] is None               # same initial, different first name


def test_shorter_record_name_within_the_team():
    assert match_name("Syed Aziz Mubarak", POOL)[0] is None
    assert match_name("Syed Aziz Mubarak", POOL, shorter=True)[0]["id"] == "sa"
    assert match_name("Syed Mubarak", POOL, shorter=True)[0] is None


def test_player_taken_in_the_xi_is_skipped():
    assert match_name("Kusal Mendis", POOL)[0]["id"] == "kusal"
    assert match_name("Kamindu Mendis", POOL, {"kusal"})[0]["id"] == "kamindu"


def test_fixture_alternate_spellings_are_tried(tmp_path, monkeypatch):
    import json

    from cricsim import resolve
    cands = {"India": [{"id": "kg", "name": "K Goud", "last": "2026-09-01", "n": 20, "names": {"K Goud"}},
                       {"id": "sm", "name": "S Mandhana", "last": "2026-09-01", "n": 400, "names": {"S Mandhana"}}]}
    seen = []

    def fake(con, parquet, team, gender):
        seen.append(team)
        return cands.get(team, []) if team else [c for v in cands.values() for c in v]
    monkeypatch.setattr(resolve, "candidates", fake)
    fx = {"id": "x", "gender": "female", "teams": [
        {"name": "India Women", "players": ["Smriti Mandhana", "Kranti Gaud"], "aka": {"Kranti Gaud": ["Kranti Goud"]}},
        {"name": "Zimbabwe Women", "players": []}]}
    (tmp_path / "fx.json").write_text(json.dumps(fx))
    resolve.main.callback(tmp_path, tmp_path / "fx.json", tmp_path / "out.json")
    out = json.loads((tmp_path / "out.json").read_text())
    assert out["teams"][0]["players"] == ["sm", "kg"] and "India" in seen
