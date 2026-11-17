"""Turn on Cloudflare Web Analytics (cookieless page-view counts) for the site, once.

With auto_install on, Cloudflare adds its small beacon to the site's HTML at the edge (the zone is proxied), so the site
code doesn't change. Idempotent: does nothing when the host already has a Web Analytics site.

    CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… python3 infra/cf_analytics.py --host cricsynthesis.in
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.request

API = "https://api.cloudflare.com/client/v4"


def call(method: str, path: str, token: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(f"{API}{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="cricsynthesis.in")
    a = ap.parse_args()
    token, acct = os.environ["CLOUDFLARE_API_TOKEN"], os.environ["CLOUDFLARE_ACCOUNT_ID"]
    sites = call("GET", f"/accounts/{acct}/rum/site_info/list?per_page=50", token).get("result") or []
    have = next((s for s in sites if s.get("host") == a.host or (s.get("ruleset") or {}).get("zone_name") == a.host), None)
    if have:
        print(f"Web Analytics already on for {a.host} (auto install: {have.get('auto_install')})")
        return
    zone = (call("GET", f"/zones?name={a.host}", token).get("result") or [{}])[0].get("id")
    if not zone:
        raise SystemExit(f"zone {a.host} not found on this account")
    r = call("POST", f"/accounts/{acct}/rum/site_info", token, {"host": a.host, "zone_tag": zone, "auto_install": True})
    print(f"Web Analytics turned on for {a.host}: {'ok' if r.get('success') else r.get('errors')}")


if __name__ == "__main__":
    main()
