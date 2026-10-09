#!/usr/bin/env bash
# CricSynthesis — Google setup without billing (Firebase Spark plan).
#
#   ./infra/bootstrap-free.sh <PROJECT_ID> <GITHUB_OWNER/REPO>
#
# Enough for the website: Firebase Hosting + keyless deploys from GitHub Actions (the nightly data,
# fit and simulation run on GitHub's runners). Nothing here can be billed. When billing is linked
# later, run infra/bootstrap.sh for the API, buckets, BigQuery and the budget kill-switch; it builds
# on what this script created. Safe to re-run.
set -euo pipefail

PROJECT_ID="${1:?usage: bootstrap-free.sh PROJECT_ID GITHUB_OWNER/REPO}"
GITHUB_REPO="${2:?GitHub repo, e.g. rangasiyaar/cricsynthsite}"

log() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
exists() { "$@" >/dev/null 2>&1; }

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

log "Enabling APIs (none of these need billing)"
gcloud services enable firebase.googleapis.com firebasehosting.googleapis.com firebaserules.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com

log "Firebase Hosting site ${PROJECT_ID}"
TOKEN="$(gcloud auth print-access-token)"
curl -fsS -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT_ID" \
  "https://firebasehosting.googleapis.com/v1beta1/projects/${PROJECT_ID}/sites/${PROJECT_ID}" >/dev/null \
  || { echo "Firebase is not enabled on ${PROJECT_ID}: add it at console.firebase.google.com first"; exit 1; }

log "Deployer service account (Hosting only)"
SA="cs-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
exists gcloud iam service-accounts describe "$SA" \
  || gcloud iam service-accounts create cs-deployer --display-name="GitHub Actions deployer"
for R in roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$R" \
    --condition=None >/dev/null
done

log "Keyless GitHub Actions deploys (Workload Identity Federation, limited to ${GITHUB_REPO})"
POOL="github"; PROVIDER="github-oidc"
exists gcloud iam workload-identity-pools describe "$POOL" --location=global \
  || gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
exists gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
  || gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global \
       --workload-identity-pool="$POOL" --issuer-uri="https://token.actions.githubusercontent.com" \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
       --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}" >/dev/null

cat <<EOF

✅ Done (free plan).
   Website           https://${PROJECT_ID}.web.app
   GitHub secrets    GCP_PROJECT_ID=${PROJECT_ID}
                     GCP_WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
                     GCP_DEPLOYER_SA=${SA}
   GitHub variable   GCP_ENABLED=true          (GCP_BILLING=true only after infra/bootstrap.sh)
EOF
