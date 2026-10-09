# Google Cloud / Firebase setup

Everything runs in one Google Cloud project with Firebase on top. Billing must be
linked (Cloud Run, Storage and BigQuery require it), but the design keeps usage
inside the free tiers — see [COSTS.md](COSTS.md) — and a kill-switch turns
billing off if spend ever reaches the budget.

## Free plan first (no billing)

The website needs no billing: Firebase Hosting runs on the free Spark plan and the nightly
data/fit/simulate work runs on GitHub Actions. Create the Firebase project, then run

```bash
./infra/bootstrap-free.sh <PROJECT_ID> rangasiyaar/cricsynthsite
```

add the three secrets it prints and the variable `GCP_ENABLED=true` to the GitHub repo, and run
**Publish site**. The API, buckets, BigQuery and the budget kill-switch need billing: when you
link a billing account, follow the steps below and set `GCP_BILLING=true` as well.

## Your one-time steps (≈ 20 minutes)

1. **Create the project.** <https://console.firebase.google.com> → *Add project* →
   name it `cricsynthesis` (note the project ID it shows, e.g. `cricsynthesis-a1b2c`).
   Google Analytics: off (not needed).
2. **Upgrade to Blaze.** Firebase console → ⚙ → *Usage and billing* → *Details & settings* →
   *Modify plan* → Blaze, and pick (or create) your billing account.
3. **Open Cloud Shell** (free, already signed in): <https://shell.cloud.google.com>.
4. **Run the bootstrap** — creates everything else, sets the budget and the kill-switch:
   ```bash
   git clone https://github.com/rangasiyaar/cricsynthsite.git && cd cricsynthsite
   git checkout claude/cricsynthesis-platform
   gcloud billing accounts list          # copy your ACCOUNT_ID
   ./infra/bootstrap.sh <PROJECT_ID> <ACCOUNT_ID> rangasiyaar/cricsynthsite
   ```
   You need to be project Owner and Billing Account Administrator (you are, if you
   created both).
5. **Sign-in providers.** Firebase console → *Authentication* → *Get started* →
   enable **Google** (and **Email/Password** if you want it). Add your domains under
   *Settings → Authorized domains*: `cricsynthesis.in`, `www.cricsynthesis.in`.
6. **BigQuery daily cap.** Console → *IAM & Admin → Quotas* → filter
   `BigQuery API · Query usage per day` → set **50 GiB/day** (free tier is 1 TiB/month).
7. **GitHub secrets** for deploys (repo → Settings → Secrets → Actions): paste the three
   values the bootstrap prints (`GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`).
   No service-account keys are created or stored anywhere.
8. **Make yourself an admin** after your first sign-in to the app — the API exposes a
   one-time `cricapi admin grant <email>` command (added with the API phase).

9. **Turn deploys on.** Repo → Settings → Secrets and variables → Actions → *Variables* →
   `GCP_ENABLED` = `true`. Then run, in this order (Actions tab → *Run workflow*):
   **Pattern Lab** (patterns page data) → **Publish site** (data, model, forecasts, website) →
   **Deploy API**. After that *Publish site* runs nightly at 03:00 IST and *Pattern Lab* weekly.
10. **Your domain.** Firebase console → *Hosting*:
    - site `<PROJECT_ID>` → *Add custom domain* → `cricsynthesis.in` (and `www.cricsynthesis.in`,
      redirecting to it);
    - site `<PROJECT_ID>-api` → *Add custom domain* → `api.cricsynthesis.in`.
    Add the DNS records Firebase shows at your domain registrar (A/TXT records; SSL is issued
    automatically, free). Until DNS switches, the site is at `https://<PROJECT_ID>.web.app`.

## What runs where

| Piece | Where | When |
|---|---|---|
| Website + app (home, match centre, Scenario Lab, Pattern Lab, developers, credits) | Firebase Hosting, site `<PROJECT_ID>` | Rebuilt nightly and on every push to `app/` or `cricsim/fixtures/` |
| Data → fit → simulate | GitHub Actions (`publish-site.yml`) | Nightly; upcoming fixtures come from `cricsim/fixtures/*.json` |
| API | Cloud Run `cricapi` behind Hosting site `<PROJECT_ID>-api` | Deployed on push to `cricapi/` or `cricsim/src/`; reads `gs://<PROJECT_ID>-models` mounted at `/srv/data` |
| Pattern Lab report | GitHub Actions (`pattern-lab.yml`) → `gs://<PROJECT_ID>-models/patterns/` | Weekly |

## What the bootstrap creates

| Resource | Name | Notes |
|---|---|---|
| Region | `us-central1` | Free-tier region for Cloud Storage; everything co-located |
| Firestore | `(default)`, Native mode | First database gets the free quota |
| Buckets | `<project>-data`, `<project>-models` | Private, soft-delete off, lifecycle cleanup |
| BigQuery | dataset `cricket` | Ball-by-ball data and analytics |
| Artifact Registry | `cricsynthesis` | Keeps only the newest two images (0.5 GB free) |
| Service accounts | `cs-api`, `cs-jobs`, `cs-deployer`, `cs-billing-guard` | Least privilege |
| GitHub access | Workload Identity pool `github` | Keyless, limited to this repository |
| Hosting sites | `<PROJECT_ID>`, `<PROJECT_ID>-api` | Website/app and API front door |
| Secret | `cricapi-admin-key` | Admin routes of the API (`gcloud secrets versions access latest --secret=cricapi-admin-key`) |
| Budget | `cricsynthesis-zero-cost` | ₹100 / $1 a month: email at 1%, billing off at 100% |
| Kill-switch | Cloud Run function `billing-guard` | Unlinks billing when the budget is reached |

## If the kill-switch fires

The site and API stop (static hosting and Firestore reads may keep working within
free quotas). Check *Billing → Reports* to see what was charged, fix the cause,
then re-link billing in *Billing → Account management*.
