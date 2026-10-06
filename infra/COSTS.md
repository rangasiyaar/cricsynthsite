# Staying at ₹0

Google Cloud has no hard spending cap. We stay free by (1) designing every
service to fit its free tier, (2) capping each service where Google allows it,
(3) emailing at the first rupee and (4) switching billing off at ₹100 / $1.

Free-tier figures as published by Google (Oct 2026); re-check them if Google
changes its pricing pages.

| Service | Free each month | How we stay under |
|---|---|---|
| **Firebase Hosting** (fan app, API front door) | ~10 GB transfer, 10 GB storage | Static app; long-lived caching of JS/CSS/fonts; API responses cacheable at the CDN |
| **Firestore** | 1 GiB stored · 50k reads/day · 20k writes/day · 10 GiB egress | One doc per match tab (a page ≈ 2–4 reads); writes only from batch jobs; usage counters batched |
| **Cloud Run** (API + jobs) | 2M requests · 180k vCPU-s · 360k GiB-s · **1 GB egress** | Max 2 API instances, scale to zero, CPU only during requests; fans never hit Cloud Run (they read Firestore / Hosting); the Scenario Lab runs in the browser |
| **BigQuery** | 10 GiB storage · 1 TiB queries | Tables partitioned + clustered; every query sets `maximum_bytes_billed`; daily quota 50 GiB; load jobs are free |
| **Cloud Storage** | 5 GB-months (us-central1) | Raw Cricsheet zips expire after 21 days; soft-delete off; Parquet only |
| **Artifact Registry** | 0.5 GB | Only the two newest images kept |
| **Cloud Scheduler** | 3 jobs | Weekly ingest, nightly simulate refresh, nightly accuracy scoring |
| **Secret Manager** | 6 active versions | Only Upstash Redis URL + Firebase config |
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
