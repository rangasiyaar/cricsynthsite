# CricSynthesis — Project Guide

Cricket simulation & analytics platform. Fans get each match's Overview free (Pro adds
the other match-centre tabs and the full Scenario Lab; `isProSection` in `components/MatchCentre.tsx`); businesses get one analytics / simulation / graphics API.
We sell analytics and projections, never live scores or raw data.
**Zero-spend policy:** everything must fit Google Cloud / Firebase free tiers —
read `infra/COSTS.md` before adding any cloud resource.

> Branch `claude/cricsynthesis-platform` is the new product (Google Cloud).
> The previous Supabase-based implementation is kept for reference on
> `claude/peaceful-keller-rousis` (engine, renderer, admin UI to port from).

## Repository layout

```
cricsynthsite/
├── cricdata/                  ← Cricsheet ingest: JSON → Parquet → BigQuery (Cloud Run Job)
├── cricsim/                   ← Pattern Lab, simulation engine (fit / simulate / summary / backtest), publish
│                                 (cricsim/social = Instagram carousels emailed for the 2-hours-before post: WBBL / NPL / Test-nation internationals)
├── cricapi/                   ← FastAPI: 56 endpoints in Analytics / Simulation & modelling / Graphics (extra.py) + admin
├── cricmcp/                   ← MCP server (42 tools, runs on the user's machine via uvx; installed from <site>/pypi/simple/)
├── edge/                      ← Hosted API + remote MCP on Cloudflare Workers (api. / mcp.cricsynthesis.in; infra/EDGE_PLAN.md)
├── app/                       ← Next.js static export: match centre, Scenario Lab (browser engine), Pattern Lab
│                                 (app/app/m/ = the Android app's screens: splash, sign-in, matches, match, Lab, account)
├── master/                    ← Admin console at master.cricsynthesis.in (Cloudflare Worker + static UI; deploy-master.yml)
├── mobile/                    ← Android app: Capacitor shell around app/app/m (see mobile/README.md; APK built in CI)
├── infra/                     ← bootstrap.sh, budget kill-switch, Firestore rules, cost limits
├── firebase.json              ← Hosting (app + api front door) and Firestore config
└── .github/workflows/         ← test + deploy (keyless auth to Google Cloud)
```

## Platform (all Google, region us-central1)

| Concern | Service | Notes |
|---|---|---|
| Website + fan app | Cloudflare Pages (static Next.js export) at cricsynthesis.in (Firebase Hosting until its free bandwidth ran out, Nov 2026; still deployed as a fallback) | Forecasts are static JSON built nightly (`publish-site.yml`); Firestore for accounts/Pro later |
| Auth | Firebase Auth (`app/lib/firebase.ts`) | Google + email; no SMS (billed). Pro = a paid CricSynthesis Pro subscription (`users/{uid}/billing/pro.proUntil`) or a `plan` custom claim set by our team (comps; approving API Plus / Business sets it too). No free beta since 18 Nov 2026 |
| Payments | Razorpay Subscriptions via the API Worker (`edge/src/billing.ts`: /billing/checkout, verify, cancel, status, webhook) | CricSynthesis Pro ₹349/month or ₹3,769/year, one free day per account (first charge 24 h later; Razorpay takes and refunds a fixed ₹5 to set up autopay, `AUTOPAY_CHECK` in `app/lib/pro.ts`); no promo codes or offers for now; copy and prices in `app/lib/pro.ts`; offer on `/pricing/` and `/pro/` (`components/ProOffer.tsx`) and in the app (`components/ProOfferApp.tsx`, the paywall for locked sections and the Lab), whose buttons go to our checkout page (`/checkout/?plan=`, `components/Checkout.tsx`; app `/m/checkout/`) that opens Razorpay's window, plan card on `/account/` and the app's Account; plans for every page in `app/lib/plans.ts` (API Free 200/day, API Plus ₹4,999/month 20,000/day incl. CricSynthesis Pro, Business by contact); keys are GitHub secrets `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` copied to the Worker by `deploy-worker.yml` (live keys since 20 Nov 2026; `billing-live-check.yml` checks them read-only); the billing doc is written only by the Worker |
| Account dashboard | `/account/` (`components/Dashboard.tsx`) | Overview, usage (`users/{uid}/usage/{day}`, written by the API in batches), API keys (read by the API when `CRICAPI_FIRESTORE_PROJECT` is set), subscription + upgrade requests (`users/{uid}/requests/{plan}`, approved server-side), profile + email preferences |
| App data | Firestore | One doc per match tab; public docs carry `published: true` |
| API + remote MCP | Cloudflare Worker `edge/` (free plan) at api.cricsynthesis.in and mcp.cricsynthesis.in | Reads the site's `/data` and its own prepared per-match files (`cricsim/edge.py`, built by `edge-data.yml`); never simulates. Same paths and shapes as `cricapi` (kept as the reference implementation and docs generator); dashboard keys checked in Firestore; the daily limit is per account (all keys + the MCP sign-in share one Usage counter, `counterId` in `edge/src/keys.ts`; plan = the higher of the key's and the account's `billing/admin` tier); parity with the MCP server's Python is tested |
| Batch | GitHub Actions (nightly `publish-site.yml`, weekly Pattern Lab) | data → fit → simulate → build → deploy; syncs model + forecasts to the models bucket for the API |
| Ball-by-ball + analytics | BigQuery dataset `cricket` | Partitioned by month, clustered; always set `maximum_bytes_billed` |
| Files / models | Cloud Storage `<project>-data`, `<project>-models` | Lifecycle cleanup, soft-delete off |
| Admin console | Cloudflare Worker `master/` at master.cricsynthesis.in | Google sign-in → `ADMIN_EMAILS` → 8-h `__Host-` session cookie; reads Firebase Auth + Firestore with the API Worker's service account, Cloudflare analytics and GitHub; snapshot in `adminSnapshot/latest` (cron every 6 h); per-endpoint usage from `eps.*` in `users/{uid}/usage/{day}`; GA4, Clarity, Search Console, Bing, Web Vitals, uptime (5-min cron, `adminUptime/{day}`), free-tier meters. Actions (approve/decline requests, key plans, revoke, disable, set subscription: CricSynthesis Free / CricSynthesis Pro / API Plus / Business API, tagged Paid / Trial / Assigned, for N days or no end date, recorded in `users/{uid}/billing/admin`; the 6-hourly cron moves ended ones back to Free) in `master/src/actions.ts`, each logged to `adminLog` |
| Account emails | Resend (`RESEND_API_KEY`, GitHub secret copied to both Workers) | Templates in `edge/src/emails.ts` (same layout as the sign-ups Apps Script's). API Worker (`edge/src/notify.ts`): Pro started / cancelled / payment failed (billing.ts `notify`, recorded on `billing/pro` so each goes once), new API key (`POST /account/key-created`, called by the dashboard), daily limit reached (first request over, if `notifyUsage`). Admin console: upgrade approved / declined, subscription given, account deleted (`user.delete`), and in the 6-hourly cron the 3-day ending reminder and "Pro has ended". Welcome, API request / upgrade confirmations and team notices, job applications and outcomes: the sign-ups Apps Script (outside the repo). No provider names in email text |
| Android app | Capacitor (`mobile/`), APK from `android.yml` | Screens are `app/app/m/`; data from the site's `/data/` (CORS on); Google sign-in via the native Firebase plugin when `GOOGLE_SERVICES_JSON` is set |
| Scenario Lab (MatchSynth Lab) | Runs in the browser (Web Worker) | Zero server cost; `lib/engine/full.ts` (browser port of `summary.py`) rebuilds every match-centre tab from the user's scenario |

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

- Optional analytics (GA4, later Clarity) load only after cookie consent: `lib/consent.ts` + `components/Consent.tsx`;
  send product events with `track()` from `lib/analytics.ts` (no personal data in params).
- `app/app/site.css` is the site theme; reuse its `cs-*` classes (hero, frames, metrics, steps, API block, nav/footer
  markup in `components/Shell.tsx`). App-only pieces in `globals.css` use the same tokens.

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
- Captain decisions (who bowls each over, `matchup` = bowler for the batter on strike, batting order by stage) are sim settings in
  `simulate.py`; the Captains lab workflow (`cricsim/engine/captains.py`) scores each variant per family (T20 / OD) on the same
  matches, incl. every fantasy C/VC rule. A setting made default must also go into `sim.ts` and `cricmcp/.../sim.py` (parity).

## Rules for new work

- New cloud resource? Add its free-tier limit and our guard to `infra/COSTS.md` first.
- BigQuery: never `SELECT *` on `deliveries`; filter on `match_date`; set `maximum_bytes_billed`.
- Accounts are 18+: `components/AgeGate.tsx` asks for the date of birth once after any sign-in (web, app, connect) and stores
  only `users/{uid}.adult` + `ageConfirmed` (never the date); under-18 sign-ins are deleted. Rules require `adult` for API keys and
  upgrade requests; the Worker's `/oauth/complete` (MCP connector) checks it too. The welcome email is sent only after confirmation.
- Firestore: writes only from server code, except a signed-in user's own `users/{uid}` profile fields (incl. the one-way `adult` flag) and
  `users/{uid}/keys/{k1..k5}` API keys (hash + prefix only, free plan only), email preferences and
  `users/{uid}/requests/{api-pro|api-business}` upgrade requests (file / cancel only). New accounts get a welcome email from
  the sign-ups Apps Script (kept outside the repo; never commit it): the sign-in page posts the uid (`app/lib/welcome.ts`),
  the script looks it up in Firebase Auth, logs it in the sheet's "Signups" tab (once per account) and sends from welcome@. Rules in `infra/firestore.rules`, tests in
  `infra/rules-tests/` (CI runs them, then releases the rules). Public docs must include `published: true`; keep docs < 1 MB.
- Cloud Run: sizes come from `infra/limits.env`; scale to zero.
