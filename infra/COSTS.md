# Staying at ₹0

Google Cloud has no hard spending cap. We stay free by (1) designing every
service to fit its free tier, (2) capping each service where Google allows it,
(3) emailing at the first rupee and (4) switching billing off at ₹100 / $1.

Free-tier figures as published by Google (Oct 2026); re-check them if Google
changes its pricing pages.

| Service | Free each month | How we stay under |
|---|---|---|
| **Firebase Hosting** (website + app at cricsynthesis.in, API front door) | 10 GB storage · 360 MB/day transfer | Static export; forecasts are static JSON (≈60 KB per match, 10-min cache); JS/CSS/fonts cached for a year; only the newest release is needed |
| **Firestore** (database created Oct 2026, us-central1) | 1 GiB stored · 50k reads/day · 20k writes/day · 10 GiB egress | One doc per match tab (a page ≈ 2–4 reads); writes from batch jobs, plus the account dashboard (a few small docs per user: profile + up to 5 API keys, rules-enforced); the API caches key lookups for 60 s; usage counters batched |
| **Cloud Run** (API + jobs) | 2M requests · 180k vCPU-s · 360k GiB-s · **1 GB egress** | Max 2 API instances, scale to zero, CPU only during requests; fans never hit Cloud Run (they read Firestore / Hosting); the Scenario Lab runs in the browser |
| **BigQuery** | 10 GiB storage · 1 TiB queries | Tables partitioned + clustered; every query sets `maximum_bytes_billed`; daily quota 50 GiB; load jobs are free |
| **Cloud Storage** | 5 GB-months · 5k class A / 50k class B ops (us-central1) | Raw Cricsheet zips expire after 21 days; soft-delete off; Parquet only; models bucket holds one model + the current forecasts (nightly rsync, a few dozen writes), mounted read-mostly by the API |
| **Artifact Registry** | 0.5 GB | Only the two newest images kept |
| **Cloud Scheduler** | 3 jobs | Weekly ingest, nightly simulate refresh, nightly accuracy scoring |
| **Secret Manager** | 6 active versions | `cricapi-admin-key` (one version) |
| **GitHub Actions** (not Google) | Free on public repos; 2,000 min/month on private | Nightly publish ≈ 12–15 min (data + fit + simulate + build), weekly Pattern Lab; the heavy batch work never runs on Google |
| **Firebase Auth** | Google / email sign-in | No phone (SMS) auth — SMS is billed |
| **Upstash Redis** (not Google) | Free tier | API usage counters, flushed to Firestore in batches |

## Watch-list

- **Cloud Run egress (1 GB).** Heaviest risk. API customers are served through the
  `api` Firebase Hosting site; large responses are gzip-compressed and paginated.
- **Firestore reads.** A viral match page is the risk — 50k reads/day ≈ 15–25k page
  views. Beyond that Firestore bills cents per 100k reads; the budget catches it.
- **BigQuery scans.** Never `SELECT *` on deliveries; always filter on the
  partition column.

## Monitoring

- Budget emails at ₹1 (1%) and 50% (actual and forecast).
- Billing → Reports, grouped by SKU, weekly for the first month after launch.
