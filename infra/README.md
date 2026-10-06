# Google Cloud / Firebase setup

Everything runs in one Google Cloud project with Firebase on top. Billing must be
linked (Cloud Run, Storage and BigQuery require it), but the design keeps usage
inside the free tiers — see [COSTS.md](COSTS.md) — and a kill-switch turns
billing off if spend ever reaches the budget.

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
| Budget | `cricsynthesis-zero-cost` | ₹100 / $1 a month: email at 1%, billing off at 100% |
| Kill-switch | Cloud Run function `billing-guard` | Unlinks billing when the budget is reached |

## If the kill-switch fires

The site and API stop (static hosting and Firestore reads may keep working within
free quotas). Check *Billing → Reports* to see what was charged, fix the cause,
then re-link billing in *Billing → Account management*.
