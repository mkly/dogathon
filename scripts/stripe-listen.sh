#!/usr/bin/env sh
# Forward Stripe webhooks to the local dev server. Stripe cannot reach
# localhost, and sponsorships only activate when checkout.session.completed
# arrives, so keep this running in its own terminal while testing checkout.
# Reads STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET from the environment,
# falling back to .env in the repo root, and warns when the CLI's signing
# secret differs from STRIPE_WEBHOOK_SECRET (the app rejects such events).
#
#   scripts/stripe-listen.sh
#   APP_URL=http://localhost:3001 scripts/stripe-listen.sh
set -eu

cd "$(dirname "$0")/.."

# Values already in the environment take precedence over .env.
env_secret_key="${STRIPE_SECRET_KEY:-}"
env_webhook_secret="${STRIPE_WEBHOOK_SECRET:-}"
env_app_url="${APP_URL:-}"
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
STRIPE_SECRET_KEY="${env_secret_key:-${STRIPE_SECRET_KEY:-}}"
STRIPE_WEBHOOK_SECRET="${env_webhook_secret:-${STRIPE_WEBHOOK_SECRET:-}}"
APP_URL="${env_app_url:-${APP_URL:-}}"

APP_URL="${APP_URL:-${BETTER_AUTH_URL:-http://localhost:3000}}"

if ! command -v stripe >/dev/null 2>&1; then
  echo "The Stripe CLI is not installed; see https://docs.stripe.com/stripe-cli" >&2
  exit 1
fi

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "STRIPE_SECRET_KEY is not set; add it to .env or export it first" >&2
  exit 1
fi

cli_secret="$(stripe listen --api-key "$STRIPE_SECRET_KEY" --print-secret)"
if [ "$cli_secret" != "${STRIPE_WEBHOOK_SECRET:-}" ]; then
  cat >&2 <<MSG
STRIPE_WEBHOOK_SECRET in .env does not match the Stripe CLI signing secret.
Set it to the value below and restart the dev server, or forwarded events will
fail signature verification:

  STRIPE_WEBHOOK_SECRET="$cli_secret"

MSG
fi

exec stripe listen \
  --api-key "$STRIPE_SECRET_KEY" \
  --forward-connect-to "${APP_URL%/}/api/stripe/webhook" \
  --forward-to "${APP_URL%/}/api/stripe/webhook"
