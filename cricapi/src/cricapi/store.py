"""Storage behind the API. Local files today; Firestore / Cloud Storage implement the same methods later.

    KeyStore      API keys (stored as SHA-256 hashes) → plan, owner; also looks up keys users create in the
                  account dashboard (Firestore users/{uid}/keys/{slot}) when a Firestore lookup is attached
    Usage         per-key daily request counter; dashboard keys also get per-day usage written to Firestore
                  (users/{uid}/usage/{YYYY-MM-DD}), batched about once a minute to stay inside the free write quota
    Content       published match docs, engine packs, index, Pattern Lab report, admin coverage files
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

PLANS = {
    "free": {"daily_requests": 200, "max_simulations": 2_000, "watermark": True},
    "pro": {"daily_requests": 5_000, "max_simulations": 20_000, "watermark": False},
    "business": {"daily_requests": 50_000, "max_simulations": 50_000, "watermark": False},
}
SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class KeyStore:
    def __init__(self, path: Path | None):
        self.path = path
        self._lock = threading.Lock()
        self._keys: dict[str, dict] = {}
        if path and path.exists():
            self._keys = {k["hash"]: k for k in json.loads(path.read_text()).get("keys", [])}

    remote = None     # callable(hash) -> dict | None, set by attach_firestore()

    def lookup(self, key: str) -> dict | None:
        h = hash_key(key)
        rec = self._keys.get(h)
        if rec is None and self.remote is not None:
            rec = self.remote(h)
        return rec

    def attach_firestore(self, project: str, ttl: float = 60.0) -> None:
        """Accept keys created in the account dashboard. Revoked keys stop working within `ttl` seconds."""
        from google.cloud import firestore            # optional dependency, installed on Cloud Run only
        db = firestore.Client(project=project)
        cache: dict[str, tuple[float, dict | None]] = {}

        def find(h: str) -> dict | None:
            now = time.monotonic()
            hit = cache.get(h)
            if hit and now - hit[0] < ttl:
                return hit[1]
            docs = list(db.collection_group("keys").where("hash", "==", h).limit(1).stream())
            rec = None
            if docs:
                d = docs[0].to_dict() or {}
                if not d.get("revoked") and d.get("plan") in PLANS:
                    rec = {"hash": h, "owner": docs[0].reference.parent.parent.id, "slot": docs[0].id,
                           "plan": d["plan"], "source": "dashboard"}
            cache[h] = (now, rec)
            return rec
        self.remote = find

    def create(self, owner: str, plan: str) -> str:
        if plan not in PLANS:
            raise ValueError(f"unknown plan {plan}")
        key = "cs_live_" + secrets.token_urlsafe(24)
        rec = {"hash": hash_key(key), "owner": owner, "plan": plan,
               "created": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        with self._lock:
            self._keys[rec["hash"]] = rec
            self._save()
        return key

    def _save(self) -> None:
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps({"keys": list(self._keys.values())}, indent=1))


CATEGORY_SLUGS = {"Analytics": "analytics", "Simulation & modelling": "simulation", "Graphics": "graphics"}


class Usage:
    """Daily request counter per key (in memory: one Cloud Run instance at a time). Requests made with dashboard keys
    are also collected per account, day, key and endpoint category, for `drain()` / the Firestore writer."""

    def __init__(self):
        self._lock = threading.Lock()
        self._counts: dict[tuple[str, str], int] = {}
        self._pending: dict[tuple[str, str], dict] = {}
        self.collect = False

    def hit(self, key_hash: str, owner: str | None = None, slot: str | None = None, category: str | None = None) -> int:
        now = datetime.now(timezone.utc)
        day = now.date().isoformat()
        with self._lock:
            self._counts = {k: v for k, v in self._counts.items() if k[1] == day}
            n = self._counts.get((key_hash, day), 0) + 1
            self._counts[(key_hash, day)] = n
            if self.collect and owner and slot:
                p = self._pending.setdefault((owner, day), {"total": 0, "keys": {}, "cats": {}, "last": {}})
                p["total"] += 1
                p["keys"][slot] = p["keys"].get(slot, 0) + 1
                cat = CATEGORY_SLUGS.get(category or "", "other")
                p["cats"][cat] = p["cats"].get(cat, 0) + 1
                p["last"][slot] = now
        return n

    def drain(self) -> dict[tuple[str, str], dict]:
        """Counts collected since the last drain, keyed by (account, day)."""
        with self._lock:
            out, self._pending = self._pending, {}
        return out

    def attach_firestore(self, project: str, every: float = 60.0) -> None:
        """Write collected usage to users/{uid}/usage/{day} (increments) and the key's lastUsed, every `every` s."""
        from google.cloud import firestore
        db = firestore.Client(project=project)
        self.collect = True

        def flush() -> None:
            pending = self.drain()
            if not pending:
                return
            batch, ops = db.batch(), 0
            for (uid, day), p in pending.items():
                user = db.collection("users").document(uid)
                batch.set(user.collection("usage").document(day), {
                    "day": day, "total": firestore.Increment(p["total"]),
                    "keys": {k: firestore.Increment(v) for k, v in p["keys"].items()},
                    "cats": {k: firestore.Increment(v) for k, v in p["cats"].items()},
                    "updated": firestore.SERVER_TIMESTAMP}, merge=True)
                ops += 1
                for slot, when in p["last"].items():
                    batch.set(user.collection("keys").document(slot), {"lastUsed": when}, merge=True)
                    ops += 1
                if ops >= 450:
                    batch.commit()
                    batch, ops = db.batch(), 0
            if ops:
                batch.commit()

        def loop() -> None:
            while True:
                time.sleep(every)
                try:
                    flush()
                except Exception:          # never take the API down over a usage write; counts retry next round
                    pass

        threading.Thread(target=loop, daemon=True, name="usage-writer").start()
        import atexit
        atexit.register(lambda: flush())


class Content:
    def __init__(self, publish_dir: Path, coverage_dir: Path, patterns_file: Path | None = None):
        self.publish_dir, self.coverage_dir, self.patterns_file = publish_dir, coverage_dir, patterns_file

    @staticmethod
    def _read(path: Path) -> dict | None:
        return json.loads(path.read_text()) if path.exists() else None

    def index(self) -> dict:
        return self._read(self.publish_dir / "index.json") or {"matches": []}

    def match(self, match_id: str) -> dict | None:
        return self._read(self.publish_dir / "matches" / f"{match_id}.json") if SAFE_ID.match(match_id) else None

    def pack(self, match_id: str) -> dict | None:
        return self._read(self.publish_dir / "matches" / f"{match_id}.pack.json") if SAFE_ID.match(match_id) else None

    def patterns(self) -> dict | None:
        return self._read(self.patterns_file) if self.patterns_file else None

    # admin coverage
    def coverage(self, match_id: str) -> dict | None:
        return self._read(self.coverage_dir / "matches" / f"{match_id}.json") if SAFE_ID.match(match_id) else None

    def coverage_list(self) -> list[dict]:
        d = self.coverage_dir / "matches"
        return [json.loads(p.read_text()) for p in sorted(d.glob("*.json"))] if d.exists() else []

    def put_coverage(self, match_id: str, doc: dict) -> None:
        if not SAFE_ID.match(match_id):
            raise ValueError("bad id")
        d = self.coverage_dir / "matches"
        d.mkdir(parents=True, exist_ok=True)
        (d / f"{match_id}.json").write_text(json.dumps(doc, indent=1))

    def delete_coverage(self, match_id: str) -> bool:
        p = self.coverage_dir / "matches" / f"{match_id}.json"
        if SAFE_ID.match(match_id) and p.exists():
            p.unlink()
            for f in (self.publish_dir / "matches").glob(f"{match_id}.*"):
                f.unlink()
            return True
        return False
