# CricSynthesis / CricVeda — Project Guide

Cricket intelligence API platform. Zero-spend policy until revenue.

## Repository layout

```
cricsynthsite/                  ← git root (also the landing website)
├── index.html / css/ js/       ← cricsynthsite landing page (keep as-is)
├── docs.html                   ← API docs page
├── cricveda-core/              ← Python package: domain models, ML, features
├── cricveda-ingest/            ← Python package: data ingestion pipeline
├── cricveda-api/               ← Python package: FastAPI service
├── cricveda-web/               ← Next.js fan dashboard
├── supabase/                   ← DB schema SQL files
├── data/
│   ├── cricsheet/              ← gitignored — Cricsheet YAML files
│   ├── mappings/               ← dwillis CSV + manual overrides
│   └── models/                 ← gitignored — trained XGBoost JSON files
├── .github/workflows/          ← pipeline.yml, predict.yml, train.yml
└── pyproject.toml              ← uv workspace root
```

## Tech stack

| Layer | Tool |
|---|---|
| DB | Supabase (PostgreSQL, free tier) |
| API | FastAPI + uvicorn |
| ML | XGBoost (train locally / GitHub Actions; serve from Supabase Storage) |
| Dream team | PuLP linear programming |
| Cache | Upstash Redis |
| Frontend | Next.js 14 (App Router, Tailwind) |
| API docs | Scalar playground at `/docs`, ReDoc at `/redoc` |
| Hosting API | Render free tier (Docker) |
| Hosting web | Vercel free tier |
| Data pipeline | GitHub Actions cron (daily 2 AM UTC) |

## Running locally

```bash
# Python workspace
cd cricsynthsite
cp .env.example .env          # fill in SUPABASE_URL + SUPABASE_SERVICE_KEY

uv sync
uv pip install -e cricveda-core -e cricveda-ingest -e cricveda-api

# API
uv run uvicorn cricveda_api.main:app --reload
# → http://localhost:8000/docs  (Scalar playground)

# Next.js dashboard
cd cricveda-web
cp .env.example .env.local     # fill in NEXT_PUBLIC_API_URL + CRICVEDA_API_KEY
npm run dev
# → http://localhost:3000
```

## Data pipeline (run once to populate Supabase)

```bash
# 1. Run schema.sql + upcoming_matches.sql in Supabase SQL editor

# 2. Download Cricsheet data
curl -L https://cricsheet.org/downloads/t20s.zip -o /tmp/t20s.zip
unzip /tmp/t20s.zip -d data/cricsheet/t20i/

# 3. Download dwillis name mapping
curl -L https://raw.githubusercontent.com/dwillis/cricket-player-ids/main/cricsheet_to_espn.csv \
  -o data/mappings/cricsheet_to_espn.csv

# 4. Run pipeline
uv run python -m cricveda_ingest.loader --league t20i --data-dir data/cricsheet/t20i
uv run python -m cricveda_ingest.scraper --from-db
uv run python -m cricveda_ingest.name_mapper --all-unresolved
uv run python -m cricveda_ingest.compute_fantasy --all-missing
uv run python -m cricveda_ingest.validate

# 5. Train model (requires populated DB)
uv run python -m cricveda_core.models.train
```

## Tests

```bash
uv run pytest cricveda-core/tests/ -q
# 30 tests — scoring engine unit + hypothesis property tests
```

## Deployment (zero-cost)

### API → Render
1. Connect GitHub repo at render.com
2. Render auto-detects `render.yaml` → one-click deploy
3. Set env vars in Render dashboard (SUPABASE_URL, SUPABASE_SERVICE_KEY, UPSTASH_REDIS_URL)
4. Set up UptimeRobot to ping `https://your-app.onrender.com/health` every 5 min

### Web → Vercel
```bash
cd cricveda-web && npx vercel
```

### GitHub Actions secrets (Settings → Secrets → Actions)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `UPSTASH_REDIS_URL`

### Supabase Storage (for ML model)
- Create a public bucket named `cricveda-models`
- The `train.yml` workflow auto-uploads `player_fp_latest.json` after retraining
- The API downloads it on cold start

## Key architectural decisions

- **ML inference decoupled from API**: XGBoost runs in GitHub Actions, results stored in `predictions` table. API is lightweight (~150 MB RAM).
- **Three-tier name resolution**: dwillis CSV → RapidFuzz (85%) → manual overrides.
- **IPL 2024 holdout**: 74 matches never used in training — reserved as final test set.
- **Dream team optimizer**: PuLP LP, not ML — deterministic given predicted points.
- **Predictions cached 1 hour**: Supabase + Upstash Redis both hit before any computation.
