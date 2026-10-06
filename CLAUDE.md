# CricSynthesis — Project Guide

Cricket simulation & analytics platform. Fans get a free match centre (Pro adds
the full Scenario Lab); businesses get one analytics / simulation / graphics API.
We sell analytics and projections, never live scores or raw data.
**Zero-spend policy:** everything must fit Google Cloud / Firebase free tiers —
read `infra/COSTS.md` before adding any cloud resource.

> Branch `claude/cricsynthesis-platform` is the new product (Google Cloud).
> The previous Supabase-based implementation is kept for reference on
> `claude/peaceful-keller-rousis` (engine, renderer, admin UI to port from).

## Repository layout

```
cricsynthsite/
├── index.html, css/, js/, …   ← current static site (replaced by app/ before launch)
├── cricdata/                  ← Cricsheet ingest: JSON → Parquet → BigQuery (Cloud Run Job)
├── cricsim/                   ← simulation engine, player ratings, format rules (in progress)
├── infra/                     ← bootstrap.sh, budget kill-switch, Firestore rules, cost limits
├── firebase.json              ← Hosting (app + api front door) and Firestore config
└── .github/workflows/         ← test + deploy (keyless auth to Google Cloud)
```

## Platform (all Google, region us-central1)

| Concern | Service | Notes |
|---|---|---|
| Fan app | Firebase Hosting (static Next.js export) | Reads published data straight from Firestore |
| Auth | Firebase Auth | Google + email; no SMS (billed) |
| App data | Firestore | One doc per match tab; public docs carry `published: true` |
| API + admin | Cloud Run service `cricapi` | Served through the `api` Hosting site (Cloud Run has only 1 GB free egress) |
| Batch | Cloud Run Jobs + Cloud Scheduler | ingest weekly, simulate on demand / nightly |
| Ball-by-ball + analytics | BigQuery dataset `cricket` | Partitioned by month, clustered; always set `maximum_bytes_billed` |
| Files / models | Cloud Storage `<project>-data`, `<project>-models` | Lifecycle cleanup, soft-delete off |
| Scenario Lab | Runs in the browser (Web Worker) | Zero server cost |

## Data: Cricsheet only

- Source: `all_json.zip` + `register/people.csv` / `names.csv` (player registry IDs — no name matching needed).
- `cricdata` produces tables `matches`, `match_players`, `innings`, `deliveries`, `wickets`, `players`.
  Every delivery carries the state *before* the ball (team runs/wickets/legal balls, batter balls faced, bowler balls).
- Formats: `T20`, `T10`, `HUNDRED` (5-ball overs), `OD` (50-over), `MULTIDAY`. Limited-overs are simulated first.
- Wides don't count as balls faced; no-balls do. `retired hurt` / `retired not out` are not dismissals.
- Teams/venues get stable IDs via `cricdata/src/cricdata/aliases/*.json` (franchise renames, venue spellings).
- Cricsheet's data licence requires attribution — show it on the site and in API docs.

## Commands

```bash
uv sync --all-extras
uv run pytest cricdata/tests infra/billing_guard -q

# local ingest (Cricsheet must be reachable)
uv run cricdata download --kind all --dest data/raw
uv run cricdata build --zip data/raw/all_json.zip --people data/raw/people.csv --names data/raw/names.csv
uv run cricdata audit                       # → data/audit/coverage.md
```

## Google Cloud setup

One-time: follow `infra/README.md` (create project, Blaze, run `infra/bootstrap.sh`).
Deploys run from GitHub Actions with Workload Identity Federation (no keys); they
only run once the repo variable `GCP_ENABLED=true` is set.

## Rules for new work

- New cloud resource? Add its free-tier limit and our guard to `infra/COSTS.md` first.
- BigQuery: never `SELECT *` on `deliveries`; filter on `match_date`; set `maximum_bytes_billed`.
- Firestore: writes only from server code; public docs must include `published: true`; keep docs < 1 MB.
- Cloud Run: sizes come from `infra/limits.env`; scale to zero.
