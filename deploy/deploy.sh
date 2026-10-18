#!/usr/bin/env bash
# Run from a clean checkout after the one-time setup in deploy/README.md.
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-between-511505}"
REGION="${REGION:-australia-southeast1}"
SERVICE="${SERVICE:-between-web}"
RELEASE_REF="${1:-HEAD}"
command -v gcloud >/dev/null || { echo 'Run in Google Cloud Shell or install the Google Cloud CLI.' >&2; exit 1; }
cd "$(git rev-parse --show-toplevel)"
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Commit or preserve local changes before deploying; only committed files are uploaded.' >&2
  exit 1
fi
RELEASE_SHA="$(git rev-parse --verify "${RELEASE_REF}^{commit}")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
git archive "$RELEASE_SHA" Dockerfile .dockerignore deploy work-memory \
  docs/results/grace-monthly-contributions/report.html | tar -x -C "$STAGE"
printf '%s\n' "$RELEASE_SHA" > "$STAGE/deploy/revision.txt"
printf 'Deploying %s to %s / %s / %s\n' "$RELEASE_SHA" "$PROJECT_ID" "$REGION" "$SERVICE"
gcloud run deploy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
  --source="$STAGE" \
  --build-service-account="projects/$PROJECT_ID/serviceAccounts/between-build@$PROJECT_ID.iam.gserviceaccount.com" \
  --service-account="between-web@$PROJECT_ID.iam.gserviceaccount.com" \
  --port=8080 --cpu=1 --memory=512Mi --concurrency=40 --timeout=60 \
  --min=0 --max=2 --cpu-throttling --ingress=all --no-invoker-iam-check \
  --revision-suffix="git-${RELEASE_SHA:0:8}-$(date -u +%H%M%S)" --quiet
# A prior rollback may have pinned traffic to an older revision.
gcloud run services update-traffic "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --to-latest --quiet
SERVICE_URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
node deploy/smoke.mjs "$SERVICE_URL" "$RELEASE_SHA"
printf 'Verified website: %s\nRelease: %s\n' "$SERVICE_URL" "$RELEASE_SHA"
