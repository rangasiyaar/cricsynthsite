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
├── sdk/                        ← GraphSynth broadcast SDK + OBS/vMix/CasparCG overlay (static)
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
# 1. In the Supabase SQL editor run, in order:
#    schema.sql, auth_schema.sql, upcoming_matches.sql, platform_v2.sql, predictions_v2.sql,
#    matchsynth_v2.sql, graphsynth_v2.sql
#    then make yourself an admin:
#    UPDATE user_profiles SET is_admin = TRUE WHERE email = 'you@example.com';

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

# 5. Train models (requires populated DB) — also trains the v2 range models,
#    scores them on the IPL 2024 holdout and uploads them to Supabase Storage
uv run python -m cricveda_core.models.train
uv run python -m cricveda_core.matchsynth.train      # MatchSynth ball-outcome model

# 6. Predict / pre-simulate upcoming fixtures (needs fixtures + squads from the admin panel)
uv run python -m cricveda_core.predictions.batch --dry-run
uv run python -m cricveda_core.matchsynth.batch --dry-run
```

## Tests

```bash
uv run pytest cricveda-core/tests/ cricveda-api/tests/ -q
# core: scoring engine unit + hypothesis property tests
# api: keys, plans/entitlements, daily quotas, CORS, admin fixtures (in-memory store, no Supabase needed)
```

## Accounts, plans and admin

- One API key per account (`cs_live_…`), sent as `X-API-Key` or `Authorization`.
- The account's plan (`plans` / `subscriptions` tables) decides which products it can call
  and its daily request limit. Free: CricVeda. Pro: + MatchSynth. Enterprise: + GraphSynth.
- Admins (`user_profiles.is_admin`) manage fixtures, squads and user plans at
  `app.cricsynthesis.in/admin`.

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
- **CricVeda v2 predictions are pre-computed**: `predict.yml` runs hourly in match hours,
  re-predicting only fixtures whose squad changed; `/v2/predictions/*` just reads
  `player_predictions`. Ranges are XGBoost multi-quantile models (P10/median/P90).
- **MatchSynth is a factored ball model + vectorised Monte Carlo**: P(0/1/2/3/4/6/W/extra) =
  situation baseline × batter × bowler × batter-vs-bowler-type × chase pressure, each player
  factor shrunk toward average. 10k T20 simulations ≈ 0.7s locally (several seconds on Render
  free), so the default `/v2/simulate/match` result is pre-computed into `match_simulations`.
  Auction ₹ values need `MATCHSYNTH_CRORE_PER_WIN` (calibrate against past auction prices);
  without it the API returns wins added only.
- **GraphSynth needs no paid feed**: live graphics read `live_snapshots`, fed by customers pushing
  their own scoring (`POST /v2/graphics/state`, private to their account) or admin manual scoring
  (`/admin/fixtures/<id>/live`, public). A paid feed plugs in later as a `LiveFeed`
  (`cricveda_core/graphsynth/live.py`). Graphics are pure SVG; PNG via resvg-py with bundled
  Barlow fonts (`graphsynth/fonts`, OFL — family names fixed so `font-family: Barlow` matches).
- **Supabase returns ≤1,000 rows per request**: bulk loads must use `cricveda_ingest.db.fetch_all`.
- **PuLP pinned below 4**: 4.x drops the bundled CBC solver the XI optimizer needs.
- **Sign-in lives on the dashboard app**: `login.html` links to `app.cricsynthesis.in/login?provider=google`, so the OAuth round trip starts and ends on one origin.
