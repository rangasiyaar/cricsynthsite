"""Run firestore.json against infra/firestore.rules with the Firebase Rules API; exit 1 unless every case passes.

    python3 infra/rules-tests/run.py --project <project>      # token from `gcloud auth print-access-token`
"""
import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    a = ap.parse_args()
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    body = {"source": {"files": [{"name": "firestore.rules", "content": (ROOT / "infra/firestore.rules").read_text()}]},
            "testSuite": json.loads((ROOT / "infra/rules-tests/firestore.json").read_text())}
    req = urllib.request.Request(f"https://firebaserules.googleapis.com/v1/projects/{a.project}:test",
                                 data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                                          "x-goog-user-project": a.project})
    try:
        res = json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        print(f"Rules API {e.code}: {e.read().decode()[:1500]}")
        return 1
    if "testResults" not in res:
        print(json.dumps(res)[:2000])
        return 1
    bad = [(i, t) for i, t in enumerate(res["testResults"]) if t.get("state") != "SUCCESS"]
    for i, t in bad:
        case = body["testSuite"]["testCases"][i]
        print(f"case {i} {case['expectation']} {case['request']['method']} {case['request']['path']}: "
              f"{t.get('state')} {t.get('debugMessages', '')}")
    print(f"{len(res['testResults']) - len(bad)}/{len(res['testResults'])} rules tests passed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
