#!/usr/bin/env sh
# Drain eligible jobs from every supported queue by calling POST /api/jobs/drain,
# the same request the production cron makes every five minutes. Reads CRON_SECRET and BETTER_AUTH_URL
# from the environment, falling back to .env in the repo root.
#
#   scripts/drain-jobs.sh              # one job
#   scripts/drain-jobs.sh --all        # keep draining until every queue is empty
#   APP_URL=https://dogathon.example scripts/drain-jobs.sh
set -eu

cd "$(dirname "$0")/.."

# Values already in the environment take precedence over .env.
env_cron_secret="${CRON_SECRET:-}"
env_app_url="${APP_URL:-}"
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
CRON_SECRET="${env_cron_secret:-${CRON_SECRET:-}}"
APP_URL="${env_app_url:-${APP_URL:-}}"

APP_URL="${APP_URL:-${BETTER_AUTH_URL:-http://localhost:3000}}"

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET is not set; add it to .env or export it first" >&2
  exit 1
fi

drain_once() {
  curl --silent --show-error --fail-with-body \
    --request POST \
    --header "Authorization: Bearer ${CRON_SECRET}" \
    --max-time 310 \
    "${APP_URL%/}/api/jobs/drain"
}

if [ "${1:-}" = "--all" ]; then
  while :; do
    body="$(drain_once)"
    echo "$body"
    case "$body" in
      '{"drained":false}' | '{"drained":false,'*) break ;;
    esac
  done
else
  drain_once
  echo
fi
