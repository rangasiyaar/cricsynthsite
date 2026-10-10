from cricsim.resolve import match_name

POOL = [{"id": "np", "name": "N Pooran", "last": "2026-09-01", "n": 120, "names": {"N Pooran", "Nicholas Pooran"}},
        {"id": "sh", "name": "SD Hope", "last": "2026-09-01", "n": 90, "names": {"SD Hope"}},
        {"id": "jn", "name": "J Nkomo", "last": "2026-09-01", "n": 99, "names": {"J Nkomo"}},
        {"id": "kusal", "name": "BKG Mendis", "last": "2026-09-27", "n": 320, "names": {"BKG Mendis", "Kusal Mendis"}},
        {"id": "kamindu", "name": "PHKD Mendis", "last": "2026-09-20", "n": 90, "names": {"PHKD Mendis"}},
        {"id": "vu", "name": "Vathila Udara", "last": "2026-09-05", "n": 19, "names": {"Vathila Udara"}},
        {"id": "hn", "name": "Hassan Nawaz", "last": "2026-10-03", "n": 28, "names": {"Hassan Nawaz"}},
        {"id": "sm", "name": "Salman Mirza", "last": "2026-02-24", "n": 16, "names": {"Salman Mirza"}}]


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


def test_player_taken_in_the_xi_is_skipped():
    assert match_name("Kusal Mendis", POOL)[0]["id"] == "kusal"
    assert match_name("Kamindu Mendis", POOL, {"kusal"})[0]["id"] == "kamindu"
