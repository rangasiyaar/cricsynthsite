#!/usr/bin/env bash
# CricSynthesis — one-time Google Cloud / Firebase setup, designed to stay inside free tiers.
#
#   ./infra/bootstrap.sh <PROJECT_ID> <BILLING_ACCOUNT_ID> <GITHUB_OWNER/REPO>
#
# Safe to re-run: every step checks before creating. Run it in Cloud Shell
# (free, already signed in) or anywhere with gcloud logged in as a project
# Owner who is also a Billing Account Administrator. See infra/README.md.
set -euo pipefail

PROJECT_ID="${1:?usage: bootstrap.sh PROJECT_ID BILLING_ACCOUNT_ID GITHUB_OWNER/REPO}"
BILLING_ACCOUNT="${2:?billing account id, e.g. 0X0X0X-0X0X0X-0X0X0X}"
GITHUB_REPO="${3:?GitHub repo, e.g. rangasiyaar/cricsynthsite}"

# us-central1 is one of the regions where Cloud Storage's Always Free tier applies,
# and keeping every service in one region avoids cross-region transfer charges.
REGION="us-central1"
DATASET="cricket"
DATA_BUCKET="${PROJECT_ID}-data"
MODELS_BUCKET="${PROJECT_ID}-models"
AR_REPO="cricsynthesis"
BUDGET_TOPIC="billing-alerts"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

log "Linking billing account (needed for Cloud Run, Storage, BigQuery — usage stays in free tiers)"
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT" >/dev/null

log "Enabling APIs"
gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  bigquery.googleapis.com storage.googleapis.com firestore.googleapis.com \
  cloudscheduler.googleapis.com pubsub.googleapis.com eventarc.googleapis.com \
  cloudfunctions.googleapis.com billingbudgets.googleapis.com cloudbilling.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  secretmanager.googleapis.com firebase.googleapis.com firebasehosting.googleapis.com \
  identitytoolkit.googleapis.com

log "Firestore (Native mode, ${REGION}) — the first database gets the free quota"
if ! exists gcloud firestore databases describe --database='(default)'; then
  gcloud firestore databases create --location="$REGION" --type=firestore-native --delete-protection
fi

log "Cloud Storage buckets (no public access, no soft-delete storage charges)"
for B in "$DATA_BUCKET" "$MODELS_BUCKET"; do
  if ! exists gcloud storage buckets describe "gs://$B"; then
    gcloud storage buckets create "gs://$B" --location="$REGION" --default-storage-class=STANDARD \
      --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0
  fi
done
gcloud storage buckets update "gs://$DATA_BUCKET" --lifecycle-file="$HERE/gcs-lifecycle-data.json" >/dev/null
gcloud storage buckets update "gs://$MODELS_BUCKET" --lifecycle-file="$HERE/gcs-lifecycle-models.json" >/dev/null

log "BigQuery dataset ${DATASET} (${REGION})"
if ! exists bq --location="$REGION" show --dataset "${PROJECT_ID}:${DATASET}"; then
  bq --location="$REGION" mk --dataset --description "Cricsheet ball-by-ball + analytics" "${PROJECT_ID}:${DATASET}"
fi

log "Artifact Registry (keeps only the newest images — free tier is 0.5 GB)"
if ! exists gcloud artifacts repositories describe "$AR_REPO" --location="$REGION"; then
  gcloud artifacts repositories create "$AR_REPO" --repository-format=docker --location="$REGION" \
    --description="CricSynthesis containers"
fi
gcloud artifacts repositories set-cleanup-policies "$AR_REPO" --location="$REGION" \
  --policy="$HERE/artifact-cleanup.json" --no-dry-run >/dev/null

log "Service accounts (least privilege)"
make_sa() { exists gcloud iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com" \
  || gcloud iam service-accounts create "$1" --display-name="$2"; }
grant() { gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$1@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="$2" --condition=None >/dev/null; }
make_sa cs-api "CricSynthesis API (Cloud Run service)"
make_sa cs-jobs "CricSynthesis batch jobs (ingest, train, simulate)"
make_sa cs-deployer "GitHub Actions deployer"
make_sa cs-billing-guard "Disables billing if the budget is exceeded"

for R in roles/datastore.user roles/bigquery.dataViewer roles/bigquery.jobUser roles/run.invoker; do grant cs-api "$R"; done
for R in roles/datastore.user roles/bigquery.dataEditor roles/bigquery.jobUser; do grant cs-jobs "$R"; done
for R in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser \
         roles/firebasehosting.admin roles/cloudscheduler.admin roles/firebaserules.admin \
         roles/datastore.indexAdmin roles/serviceusage.serviceUsageConsumer; do grant cs-deployer "$R"; done
# The nightly publish (GitHub Actions) uploads the model, forecasts and Pattern Lab report here.
gcloud storage buckets add-iam-policy-binding "gs://$MODELS_BUCKET" \
  --member="serviceAccount:cs-deployer@${PROJECT_ID}.iam.gserviceaccount.com" --role=roles/storage.objectAdmin >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$DATA_BUCKET" \
  --member="serviceAccount:cs-jobs@${PROJECT_ID}.iam.gserviceaccount.com" --role=roles/storage.objectAdmin >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://$MODELS_BUCKET" \
  --member="serviceAccount:cs-jobs@${PROJECT_ID}.iam.gserviceaccount.com" --role=roles/storage.objectAdmin >/dev/null
# The API mounts this bucket at /srv/data; it writes only its API-key store (keys/).
gcloud storage buckets add-iam-policy-binding "gs://$MODELS_BUCKET" \
  --member="serviceAccount:cs-api@${PROJECT_ID}.iam.gserviceaccount.com" --role=roles/storage.objectUser >/dev/null
# The API starts simulation jobs when an admin presses "Simulate".
grant cs-api roles/run.developer

log "API admin secret (Secret Manager: 6 free active versions)"
if ! exists gcloud secrets describe cricapi-admin-key; then
  head -c 32 /dev/urandom | base64 | tr -d '/+=\n' | gcloud secrets create cricapi-admin-key \
    --replication-policy=user-managed --locations="$REGION" --data-file=-
fi
gcloud secrets add-iam-policy-binding cricapi-admin-key \
  --member="serviceAccount:cs-api@${PROJECT_ID}.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null

log "Firebase Hosting sites: ${PROJECT_ID} (website + app) and ${PROJECT_ID}-api (API front door)"
TOKEN="$(gcloud auth print-access-token)"
hosting() { curl -fsS -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT_ID" "$@"; }
SITES="https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT_ID}/sites"
hosting "$SITES/${PROJECT_ID}" >/dev/null \
  || { echo "Firebase is not enabled on ${PROJECT_ID}: add it at console.firebase.google.com first"; exit 1; }
hosting "$SITES/${PROJECT_ID}-api" >/dev/null 2>&1 \
  || hosting -X POST -H "Content-Type: application/json" -d '{}' "$SITES?siteId=${PROJECT_ID}-api" >/dev/null

log "Keyless GitHub Actions deploys (Workload Identity Federation, limited to ${GITHUB_REPO})"
POOL="github"; PROVIDER="github-oidc"
exists gcloud iam workload-identity-pools describe "$POOL" --location=global \
  || gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
exists gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
  || gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global \
       --workload-identity-pool="$POOL" --issuer-uri="https://token.actions.githubusercontent.com" \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
       --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
gcloud iam service-accounts add-iam-policy-binding "cs-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

log "Budget alerts + automatic billing shut-off"
exists gcloud pubsub topics describe "$BUDGET_TOPIC" || gcloud pubsub topics create "$BUDGET_TOPIC"
CURRENCY="$(gcloud billing accounts describe "$BILLING_ACCOUNT" --format='value(currencyCode)')"
case "$CURRENCY" in
  INR) BUDGET="100INR" ;;   # ≈ $1
  USD) BUDGET="1USD" ;;
  *)   BUDGET="1${CURRENCY}" ;;
esac
if ! gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" --format='value(displayName)' | grep -qx "cricsynthesis-zero-cost"; then
  gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" --display-name="cricsynthesis-zero-cost" \
    --budget-amount="$BUDGET" --filter-projects="projects/${PROJECT_ID}" \
    --threshold-rule=percent=0.01 --threshold-rule=percent=0.5 --threshold-rule=percent=1.0 \
    --threshold-rule=percent=0.5,basis=forecasted-spend \
    --notifications-rule-pubsub-topic="projects/${PROJECT_ID}/topics/${BUDGET_TOPIC}"
fi
# The guard needs permission to unlink billing from this project (this is the only way
# Google lets you hard-stop spending). Granted on the billing account, by you.
gcloud billing accounts add-iam-policy-binding "$BILLING_ACCOUNT" \
  --member="serviceAccount:cs-billing-guard@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/billing.admin >/dev/null
gcloud functions deploy billing-guard --gen2 --region="$REGION" --runtime=python312 \
  --source="$HERE/billing_guard" --entry-point=on_budget_message --trigger-topic="$BUDGET_TOPIC" \
  --service-account="cs-billing-guard@${PROJECT_ID}.iam.gserviceaccount.com" \
  --memory=256Mi --max-instances=1 --set-env-vars="PROJECT_ID=${PROJECT_ID}"

cat <<EOF

✅ Done.
   Region            ${REGION}
   BigQuery dataset  ${PROJECT_ID}:${DATASET}
   Buckets           gs://${DATA_BUCKET}  gs://${MODELS_BUCKET}
   Hosting           https://${PROJECT_ID}.web.app (site)  https://${PROJECT_ID}-api.web.app (API)
   Budget            ${BUDGET}/month — email at 1%, billing switched off at 100%
   GitHub secrets    GCP_PROJECT_ID=${PROJECT_ID}
                     GCP_WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
                     GCP_DEPLOYER_SA=cs-deployer@${PROJECT_ID}.iam.gserviceaccount.com

Remaining manual steps are in infra/README.md (Firebase Auth providers, BigQuery daily query cap).
EOF
