#!/usr/bin/env bash
# Deploy (or update) the weekly Cricsheet ingest as a Cloud Run Job + its schedule.
#   ./infra/deploy-ingest.sh <PROJECT_ID> <IMAGE>
set -euo pipefail
PROJECT_ID="${1:?project id}"
IMAGE="${2:?image, e.g. us-central1-docker.pkg.dev/P/cricsynthesis/cricdata:abc123}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=infra/limits.env
source "$HERE/limits.env"
JOB=cricdata-ingest
SA="cs-jobs@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud run jobs deploy "$JOB" --project="$PROJECT_ID" --region="$REGION" --image="$IMAGE" \
  --service-account="$SA" --cpu="$JOB_CPU" --memory="$JOB_MEMORY" \
  --task-timeout="$JOB_TASK_TIMEOUT_INGEST" --max-retries="$JOB_MAX_RETRIES" --tasks=1 \
  --args="ingest,--project,${PROJECT_ID},--dataset,cricket,--bucket,${PROJECT_ID}-data"

# The scheduler calls the Jobs API as cs-jobs, so it needs permission to start the job.
gcloud run jobs add-iam-policy-binding "$JOB" --project="$PROJECT_ID" --region="$REGION" \
  --member="serviceAccount:${SA}" --role=roles/run.invoker >/dev/null

# Weekly full rebuild, Monday 03:00 UTC (one of the 3 free Cloud Scheduler jobs).
URI="https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/jobs/${JOB}:run"
if gcloud scheduler jobs describe cricdata-weekly --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http cricdata-weekly --project="$PROJECT_ID" --location="$REGION" \
    --schedule="0 3 * * 1" --uri="$URI" --http-method=POST --oauth-service-account-email="$SA"
else
  gcloud scheduler jobs create http cricdata-weekly --project="$PROJECT_ID" --location="$REGION" \
    --schedule="0 3 * * 1" --time-zone="Etc/UTC" --uri="$URI" --http-method=POST \
    --oauth-service-account-email="$SA"
fi
echo "Deployed ${JOB}. Run it now with: gcloud run jobs execute ${JOB} --region=${REGION} --project=${PROJECT_ID}"
