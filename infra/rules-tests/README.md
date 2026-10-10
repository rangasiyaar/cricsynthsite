# Firestore rules tests

`firestore.json` is a Firebase Rules test suite (dashboard API keys and profile, server-only collections).
Run it against `infra/firestore.rules` with the Rules API (needs a token with Firebase Rules access):

```bash
T=$(gcloud auth print-access-token)
python3 -c "import json;print(json.dumps({'source':{'files':[{'name':'firestore.rules','content':open('infra/firestore.rules').read()}]},'testSuite':json.load(open('infra/rules-tests/firestore.json'))}))" > /tmp/rt.json
curl -sS -H "Authorization: Bearer $T" -H "Content-Type: application/json" -X POST \
  https://firebaserules.googleapis.com/v1/projects/cricsynthesis:test -d @/tmp/rt.json
```
Every result should be `SUCCESS`.
