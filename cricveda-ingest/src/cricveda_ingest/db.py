from __future__ import annotations

import os

from dotenv import load_dotenv
from supabase import Client, create_client

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        load_dotenv()
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client


def reset_client() -> None:
    """Force a new client on next call (useful in tests)."""
    global _client
    _client = None
