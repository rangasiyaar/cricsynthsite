"""Keys made in the account dashboard (Firestore) are accepted by the API; revoked ones are not."""
from cricapi.store import KeyStore, hash_key


def test_remote_lookup_used_after_local_keys(tmp_path):
    ks = KeyStore(tmp_path / "keys.json")
    local = ks.create("ops", "pro")
    remote = {hash_key("cs_live_dash"): {"hash": hash_key("cs_live_dash"), "owner": "uid1", "plan": "free"}}
    ks.remote = remote.get
    assert ks.lookup(local)["plan"] == "pro"
    assert ks.lookup("cs_live_dash")["owner"] == "uid1"
    assert ks.lookup("cs_live_nope") is None
