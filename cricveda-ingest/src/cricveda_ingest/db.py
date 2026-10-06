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


def fetch_all(
    table: str,
    columns: str = "*",
    *,
    order: str,
    where=None,
    page_size: int = 1000,
) -> list[dict]:
    """Every matching row, fetched page by page.

    Supabase's API returns at most 1,000 rows per request, so a bare
    `.select().execute()` silently truncates large tables. `order` must be a
    unique column (e.g. the primary key) so pages don't overlap or skip rows.
    `where` is an optional function that adds filters to the query builder.
    """
    client = get_client()
    rows: list[dict] = []
    start = 0
    while True:
        q = client.table(table).select(columns)
        if where is not None:
            q = where(q)
        page = q.order(order).range(start, start + page_size - 1).execute().data
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size
