"""Storage behind the API. Local files today; Firestore / Cloud Storage implement the same methods later.

    KeyStore      API keys (stored as SHA-256 hashes) → plan, owner
    Usage         per-key daily request counter
    Content       published match docs, engine packs, index, Pattern Lab report, admin coverage files
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
import threading
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

    def lookup(self, key: str) -> dict | None:
        return self._keys.get(hash_key(key))

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


class Usage:
    """In-memory daily counter (one Cloud Run instance at a time; a Firestore counter replaces it later)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._counts: dict[tuple[str, str], int] = {}

    def hit(self, key_hash: str) -> int:
        day = datetime.now(timezone.utc).date().isoformat()
        with self._lock:
            self._counts = {k: v for k, v in self._counts.items() if k[1] == day}
            n = self._counts.get((key_hash, day), 0) + 1
            self._counts[(key_hash, day)] = n
        return n


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
