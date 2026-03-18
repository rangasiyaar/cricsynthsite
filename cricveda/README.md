## CricVeda

This subproject is a Next.js App Router application for the CricVeda product.

Structure (high level):

- `src/app` – routes (landing, docs, playground, dashboard, matches, players, API routes, auth)
- `src/lib` – core logic (DB, cache, analytics, auth, middleware)
- `src/scripts` – data pipeline scripts (CricSheet ingest, scraping, precompute)
- `data/cricsheet` – raw CricSheet downloads
- `.github/workflows` – scheduled jobs for scraping and precomputation

The implementation files are currently minimal stubs and can be filled in as we build out CricVeda.

