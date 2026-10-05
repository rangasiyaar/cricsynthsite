"""API keys, subscription entitlements, daily quotas and CORS."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from cricveda_api.auth import ApiPrincipal, hash_key, require_product


def test_missing_key_is_401(client):
    r = client.get("/v2/account")
    assert r.status_code == 401


def test_invalid_key_is_403(client):
    r = client.get("/v2/account", headers={"X-API-Key": "cs_live_nope"})
    assert r.status_code == 403


def test_new_keys_have_live_prefix_and_store_no_raw_key(fake_store, new_key):
    raw = new_key()
    assert raw.startswith("cs_live_")
    stored = next(iter(fake_store.keys.values()))
    assert raw not in str(stored)
    assert stored["key_prefix"] == raw[:12]


def test_valid_key_returns_account_and_rate_headers(client, new_key):
    raw = new_key(plan="pro")
    r = client.get("/v2/account", headers={"X-API-Key": raw})
    assert r.status_code == 200
    body = r.json()
    assert body["plan"] == "pro"
    assert body["products"] == ["cricveda", "matchsynth"]
    assert body["used_today"] == 1
    assert r.headers["X-RateLimit-Limit"] == "50"
    assert r.headers["X-RateLimit-Remaining"] == "49"
    assert int(r.headers["X-RateLimit-Reset"]) > 0
    assert r.headers["X-Request-ID"].startswith("req_")
    assert r.headers["X-Response-Time"].endswith("ms")
    assert body["request_id"] == r.headers["X-Request-ID"]


def test_authorization_header_works_with_and_without_bearer(client, new_key):
    raw = new_key()
    assert client.get("/v2/account", headers={"Authorization": raw}).status_code == 200
    assert client.get("/v2/account", headers={"Authorization": f"Bearer {raw}"}).status_code == 200


def test_daily_limit_returns_429_with_retry_after(client, new_key):
    raw = new_key()  # free plan in tests: 3/day
    for _ in range(3):
        assert client.get("/v2/account", headers={"X-API-Key": raw}).status_code == 200
    r = client.get("/v2/account", headers={"X-API-Key": raw})
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0
    assert r.headers["X-RateLimit-Remaining"] == "0"


def test_limit_is_per_account_across_keys(client, new_key):
    a = new_key(user_id="u")
    b = new_key(user_id="u")
    for raw in (a, b, a):
        assert client.get("/v2/account", headers={"X-API-Key": raw}).status_code == 200
    assert client.get("/v2/account", headers={"X-API-Key": b}).status_code == 429


def test_legacy_bcrypt_key_works_and_is_upgraded(client, fake_store):
    raw = "legacy-key-123"
    fake_store.keys["k1"] = {"key_id": "k1", "user_id": "user-1", "key_hash": hash_key(raw)}
    assert client.get("/v2/account", headers={"X-API-Key": raw}).status_code == 200
    assert fake_store.keys["k1"]["key_sha256"]
    from cricveda_api.auth import clear_cache
    clear_cache()
    before = fake_store.calls["list_legacy_keys"]
    assert client.get("/v2/account", headers={"X-API-Key": raw}).status_code == 200
    assert fake_store.calls["list_legacy_keys"] == before  # found by SHA-256 now


def test_expired_or_inactive_subscription_falls_back_to_free(client, fake_store, new_key):
    raw = new_key(user_id="u2", plan="enterprise")
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    fake_store.set_subscription("u2", "enterprise", current_period_end=past)
    assert client.get("/v2/account", headers={"X-API-Key": raw}).json()["plan"] == "free"
    from cricveda_api.auth import clear_cache
    clear_cache()
    fake_store.set_subscription("u2", "enterprise", status="past_due")
    assert client.get("/v2/account", headers={"X-API-Key": raw}).json()["plan"] == "free"


def _product_app(product: str) -> FastAPI:
    test_app = FastAPI()

    @test_app.get("/p")
    async def p(principal: ApiPrincipal = Depends(require_product(product))):
        return {"plan": principal.plan_id}

    return test_app


def test_product_entitlements_follow_plan(fake_store, new_key):
    free = new_key(user_id="f")
    pro = new_key(user_id="p", plan="pro")
    ent = new_key(user_id="e", plan="enterprise")
    ms = TestClient(_product_app("matchsynth"))
    gs = TestClient(_product_app("graphsynth"))
    cv = TestClient(_product_app("cricveda"))
    assert cv.get("/p", headers={"X-API-Key": free}).status_code == 200
    r = ms.get("/p", headers={"X-API-Key": free})
    assert r.status_code == 403 and "does not include matchsynth" in r.json()["detail"]
    assert ms.get("/p", headers={"X-API-Key": pro}).status_code == 200
    assert gs.get("/p", headers={"X-API-Key": pro}).status_code == 403
    assert gs.get("/p", headers={"X-API-Key": ent}).status_code == 200


def test_v1_endpoints_require_cricveda(client):
    r = client.get("/v1/oracle/win-probability?format=T20&innings=1&over=10&wickets=2&runs=80")
    assert r.status_code == 401


def test_cors_preflight_allows_dashboard_requests(client):
    r = client.options("/v1/user/keys", headers={
        "Origin": "https://app.cricsynthesis.in",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert r.status_code == 200
    assert "POST" in r.headers["access-control-allow-methods"]
    assert "authorization" in r.headers["access-control-allow-headers"].lower()


def test_cors_exposes_rate_limit_headers(client, new_key):
    raw = new_key()
    r = client.get("/v2/account", headers={"X-API-Key": raw, "Origin": "https://example.com"})
    exposed = r.headers["access-control-expose-headers"]
    assert "X-RateLimit-Remaining" in exposed and "X-Request-ID" in exposed


def test_refused_product_calls_do_not_use_quota(fake_store, new_key):
    free = new_key(user_id="q")
    ms = TestClient(_product_app("matchsynth"))
    for _ in range(5):
        assert ms.get("/p", headers={"X-API-Key": free}).status_code == 403
    assert sum(fake_store.usage.values()) == 0
