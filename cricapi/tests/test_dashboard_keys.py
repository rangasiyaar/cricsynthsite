"""Keys made in the account dashboard (Firestore) are accepted by the API; revoked ones are not."""
from cricapi.store import KeyStore, hash_key


def test_remote_lookup_used_after_local_keys(tmp_path):
    ks = KeyStore(tmp_path / "keys.json")
    local = ks.create("ops", "pro")
    remote = {hash_key("cs_live_dash0000000000000000000000000"): {"hash": hash_key("cs_live_dash0000000000000000000000000"), "owner": "uid1", "plan": "free"}}
    ks.remote = remote.get
    assert ks.lookup(local)["plan"] == "pro"
    assert ks.lookup("cs_live_dash0000000000000000000000000")["owner"] == "uid1"
    assert ks.lookup("cs_live_nope0000000000000000000000000") is None


def test_malformed_keys_never_reach_the_remote_lookup(tmp_path):
    ks = KeyStore(tmp_path / "keys.json")
    calls = []
    ks.remote = lambda h: calls.append(h)
    for junk in ["", "abc", "cs_live_short", "cs_test_" + "a" * 32, "cs_live_" + "a" * 32 + "!", "x" * 5000]:
        assert ks.lookup(junk) is None
    assert calls == []
    ks.lookup("cs_live_" + "a" * 32)
    assert len(calls) == 1


def test_remote_lookups_are_cached_bounded_and_rate_limited(tmp_path):
    ks = KeyStore(tmp_path / "keys.json")
    reads = []
    find = ks._cached_lookup(lambda h: reads.append(h) or [], ttl=60, max_cache=50, reads_per_min=10)
    assert find("h1") is None and find("h1") is None
    assert reads == ["h1"]                                   # the miss is cached
    for i in range(100):
        find(f"x{i}")
    assert len(reads) == 10                                  # budget: 10 reads a minute, then refuse
