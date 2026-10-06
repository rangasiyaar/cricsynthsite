"""fetch_all pages past Supabase's 1,000-row response cap."""
from __future__ import annotations

import cricveda_ingest.db as db


class _Q:
    def __init__(self, rows, cap):
        self.rows, self.cap, self.filters, self.window = rows, cap, [], None

    def select(self, *_):
        return self

    def order(self, *_):
        return self

    def gt(self, col, v):
        self.filters.append((col, v))
        return self

    def range(self, a, b):
        self.window = (a, b)
        return self

    def execute(self):
        rows = [r for r in self.rows if all(r[c] > v for c, v in self.filters)]
        a, b = self.window
        return type("R", (), {"data": rows[a:b + 1][: self.cap]})()


class _Client:
    def __init__(self, rows, cap=1000):
        self.rows, self.cap, self.calls = rows, cap, 0

    def table(self, _):
        self.calls += 1
        return _Q(self.rows, self.cap)


def test_fetch_all_reads_every_page(monkeypatch):
    rows = [{"id": i} for i in range(2503)]
    client = _Client(rows)
    monkeypatch.setattr(db, "get_client", lambda: client)
    got = db.fetch_all("t", order="id")
    assert [r["id"] for r in got] == list(range(2503))
    assert client.calls == 3


def test_fetch_all_exact_multiple_and_filter(monkeypatch):
    client = _Client([{"id": i} for i in range(2000)])
    monkeypatch.setattr(db, "get_client", lambda: client)
    assert len(db.fetch_all("t", order="id")) == 2000
    got = db.fetch_all("t", order="id", where=lambda q: q.gt("id", 1499))
    assert len(got) == 500
