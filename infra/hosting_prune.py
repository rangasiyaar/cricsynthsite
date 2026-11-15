"""Keep Firebase Hosting storage under the free-plan cap (10 GB per project).

Hosting keeps every deployed version for rollbacks, and the site deploys many times a day, so old versions fill the
quota and then every deploy is refused (HTTP 429). For each Hosting site in the project this:
  1. sets the site's release storage setting to keep the latest KEEP versions (Firebase then expires older ones), and
  2. deletes finalized versions beyond the newest KEEP straight away, never the one that is live.

    FIREBASE_TOKEN=$(gcloud auth print-access-token) python3 infra/hosting_prune.py --project <id> [--keep 10]
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request

API = "https://firebasehosting.googleapis.com/v1beta1"


def call(method: str, url: str, token: str, project: str, body: dict | None = None) -> dict:
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "x-goog-user-project": project,
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    return json.loads(raw) if raw else {}


def versions(site: str, token: str, project: str) -> list[dict]:
    out, page = [], ""
    while True:
        d = call("GET", f"{API}/sites/{site}/versions?pageSize=100" + (f"&pageToken={page}" if page else ""), token, project)
        out += d.get("versions", [])
        page = d.get("nextPageToken", "")
        if not page:
            return out


def prune(site: str, keep: int, token: str, project: str) -> None:
    try:
        call("PATCH", f"{API}/sites/{site}/config?updateMask=maxVersions", token, project, {"maxVersions": keep})
        print(f"{site}: release storage set to the latest {keep} versions")
    except urllib.error.HTTPError as e:
        print(f"{site}: could not set release storage ({e.code}); pruning by hand")
    live = call("GET", f"{API}/sites/{site}/channels/live", token, project).get("release", {}).get("version", {}).get("name")
    vs = [v for v in versions(site, token, project) if v.get("status") == "FINALIZED"]
    vs.sort(key=lambda v: v.get("createTime", ""), reverse=True)
    old = [v for v in vs[keep:] if v["name"] != live]
    for v in old:
        try:
            call("DELETE", f"{API}/{v['name']}", token, project)
        except urllib.error.HTTPError as e:          # e.g. a version another channel still serves
            print(f"{site}: kept {v['name'].rsplit('/', 1)[-1]} ({e.code})")
    print(f"{site}: {len(vs)} finalized versions, deleted {len(old)}, live {(live or '?').rsplit('/', 1)[-1]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--keep", type=int, default=10)
    a = ap.parse_args()
    token = os.environ["FIREBASE_TOKEN"]
    sites = [s["name"].rsplit("/", 1)[-1] for s in call("GET", f"{API}/projects/{a.project}/sites", token, a.project).get("sites", [])]
    for site in sites or [a.project]:
        prune(site, max(2, a.keep), token, a.project)


if __name__ == "__main__":
    main()
