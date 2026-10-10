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
├── cricsim/                   ← Pattern Lab, simulation engine (fit / simulate / summary / backtest), publish
├── cricapi/                   ← FastAPI: 56 endpoints in Analytics / Simulation & modelling / Graphics (extra.py) + admin
├── cricmcp/                   ← MCP server (41 tools, runs on the user's machine via uvx; installed from <site>/pypi/simple/)
├── app/                       ← Next.js static export: match centre, Scenario Lab (browser engine), Pattern Lab
├── infra/                     ← bootstrap.sh, budget kill-switch, Firestore rules, cost limits
├── firebase.json              ← Hosting (app + api front door) and Firestore config
└── .github/workflows/         ← test + deploy (keyless auth to Google Cloud)
```

## Platform (all Google, region us-central1)

| Concern | Service | Notes |
|---|---|---|
| Website + fan app | Firebase Hosting (static Next.js export) at cricsynthesis.in | Forecasts are static JSON built nightly (`publish-site.yml`); Firestore for accounts/Pro later |
| Auth | Firebase Auth (`app/lib/firebase.ts`) | Google + email; no SMS (billed). Pro = any signed-in account during the beta |
| App data | Firestore | One doc per match tab; public docs carry `published: true` |
| API + admin | Cloud Run service `cricapi` | Served through the `api` Hosting site (Cloud Run has only 1 GB free egress) |
| Batch | GitHub Actions (nightly `publish-site.yml`, weekly Pattern Lab) | data → fit → simulate → build → deploy; syncs model + forecasts to the models bucket for the API |
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
- Cricsheet's data licence (ODC-BY) requires attribution: it lives only on the app's `/credits/` page (footer "Data credits")
  and the API catalog's `data_credits` link. Don't name data sources anywhere else on the site, cards or API.
- Batting hand / bowling style (not in Cricsheet) come from `player_meta` in the cricketdata R package
  (GPL-3, compiled from ESPNcricinfo, keyed by Cricsheet ID, snapshot Mar 2025): `cricdata attributes`
  → `attributes/attributes.parquet`. Newer players come from an overrides CSV (admin). Credited on `/credits/` only.

## Commands

```bash
uv sync --all-extras
uv run pytest cricdata/tests cricsim/tests cricapi/tests cricmcp/tests infra/billing_guard -q

# local ingest (Cricsheet must be reachable)
uv run cricdata download --kind all --dest data/raw
uv run cricdata build --zip data/raw/all_json.zip --people data/raw/people.csv --names data/raw/names.csv
uv run cricdata attributes                  # batting hand / bowling style
uv run cricdata audit                       # → data/audit/coverage.md
uv run python -m cricsim.patterns --parquet data/parquet   # Pattern Lab → data/patterns/report.md

# engine
uv run python -m cricsim.engine fit --parquet data/parquet --out data/models/latest
uv run python -m cricsim.engine backtest --parquet data/parquet --cutoff 2025-01-01
uv run python -m cricsim.publish --model data/models/latest --coverage data/coverage --out data/publish
uv run python -m cricsim.kit --model data/models/latest --out data/publish     # analytics kit for the MCP server
uv run cricapi                              # API on :8080 (CRICAPI_* env vars, see cricapi/main.py)
uv run python -m cricapi.reference > app/data-static/api-reference.json   # after API changes (/docs page; tested)
uv run python -m cricapi.examples --model data/models/latest --out app/data-static/api-examples.json   # sample calls (nightly in CI)

# app (reads data from public/data = a copy of data/publish)
cd app && npm ci && npm run dev             # npm test runs the browser-engine tests
```

## Google Cloud setup

One-time: follow `infra/README.md` (create project, Blaze, run `infra/bootstrap.sh`).
Deploys run from GitHub Actions with Workload Identity Federation (no keys); they
only run once the repo variable `GCP_ENABLED=true` is set.

## App design

- `app/app/site.css` is a verbatim copy of the website's `css/theme.css`; reuse its `cs-*` classes (hero, frames,
  metrics, steps, API block, nav/footer markup from `js/layout.js`). App-only pieces in `globals.css` use the same tokens.

## Engine rules

- Model-derived analytics live in `cricsim/engine/insight.py`; decision models (win probability, par, chase,
  toss, lineups, fantasy) in `cricsim/engine/modelling.py`. API routes are tagged with their category.

- `cricmcp/src/cricmcp/insight.py` ports `insight.py` to pure Python over the analytics kit (`cricsim/kit.py`);
  `test_insight_parity.py` checks them against each other. `cricmcp/.../graphics.py` is a verbatim copy of
  `cricapi/graphics.py` (tested). The MCP package is served from the site, not GitHub (`cricmcp/build_index.py`).
- `cricmcp/src/cricmcp/sim.py` is a third copy of the browser engine (pure Python, same RNG); `cricmcp/tests/test_parity.py`
  requires it to reproduce `sim.ts` exactly, so change both together.
- `cricsim/engine/states.py` is the single definition of outcome classes and situation buckets; the
  browser port `app/lib/engine/sim.ts` must mirror `simulate.py` — `test_browser_parity.py` enforces it.
- Only Pattern Lab effects that verified as real go into the ball model; myths stay out.
- Judge changes by the backtest (Engine workflow): result Brier, total-score PIT/coverage, player-run groups.

## Rules for new work

- New cloud resource? Add its free-tier limit and our guard to `infra/COSTS.md` first.
- BigQuery: never `SELECT *` on `deliveries`; filter on `match_date`; set `maximum_bytes_billed`.
- Firestore: writes only from server code; public docs must include `published: true`; keep docs < 1 MB.
- Cloud Run: sizes come from `infra/limits.env`; scale to zero.
