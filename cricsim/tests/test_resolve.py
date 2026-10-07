from cricsim.resolve import match_name

POOL = [{"id": "np", "name": "N Pooran", "last": "2026-09-01", "n": 120, "names": {"N Pooran", "Nicholas Pooran"}},
        {"id": "sh", "name": "SD Hope", "last": "2026-09-01", "n": 90, "names": {"SD Hope"}},
        {"id": "jn", "name": "J Nkomo", "last": "2026-09-01", "n": 99, "names": {"J Nkomo"}}]


def test_full_name_and_initials():
    assert match_name("Nicholas Pooran", POOL)[0]["id"] == "np"
    assert match_name("Shai Hope", POOL)[0]["id"] == "sh"
    assert match_name("Josephine Nkomo", POOL)[0]["id"] == "jn"


def test_surname_alone_is_not_enough():
    assert match_name("Kamil Pooran", POOL)[0] is None
