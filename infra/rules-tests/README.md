# Firestore rules tests

`firestore.json` is a Firebase Rules test suite (dashboard API keys and profile, server-only collections).
`publish-site.yml` runs it with `run.py` and releases the rules when every case passes. By hand (needs a token with
Firebase Rules access): `python3 infra/rules-tests/run.py --project cricsynthesis`, or:

```bash
T=$(gcloud auth print-access-token)
python3 -c "import json;print(json.dumps({'source':{'files':[{'name':'firestore.rules','content':open('infra/firestore.rules').read()}]},'testSuite':json.load(open('infra/rules-tests/firestore.json'))}))" > /tmp/rt.json
curl -sS -H "Authorization: Bearer $T" -H "Content-Type: application/json" -X POST \
  https://firebaserules.googleapis.com/v1/projects/cricsynthesis:test -d @/tmp/rt.json
```
Every result should be `SUCCESS`.
