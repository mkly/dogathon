# Dogathon

A multitenant Next.js app using PostgreSQL, Prisma, and Better Auth organizations.

## Run locally

1. Copy `.env.example` to `.env` and replace `BETTER_AUTH_SECRET` with a random value of at least 32 characters. Configure the `APP_SMTP_*` and `APP_EMAIL_FROM` variables when you want real email delivery; local development logs invitation links when the platform SMTP credentials are unset.
2. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Install dependencies and initialize the database:

   ```bash
   npm install
   npm run db:migrate -- --name init
   ```

4. Seed the demo organization, then start the app:

   ```bash
   npm run seed
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

Configure the variables from `.env.example` as Vercel project environment
variables before deploying. In particular, `DATABASE_URL` must point to a
production PostgreSQL database, `BETTER_AUTH_SECRET` must be a production
secret, and `BETTER_AUTH_URL` must be the deployed app URL. Set
`EMAIL_CONNECTOR_ENCRYPTION_KEY` to 32 random bytes encoded as base64 before an
organization connects email, and configure the Google and/or Microsoft OAuth
client variables for those connector choices; plain SMTP needs no app-wide
provider credentials. Configure the Stripe test keys plus the Firecrawl and
OpenAI-compatible model variables when those integrations are enabled. Vercel's
install step runs the existing `postinstall` script, which generates the Prisma
client.

The checked-in `vercel.json` invokes `GET /api/jobs/drain` every five minutes
and `GET /api/jobs/schedule-roster-sync` daily at 08:00 UTC. Set `CRON_SECRET`
in the Vercel project; Vercel sends it to both routes as an Authorization Bearer
token, and both refuse calls when neither it nor the legacy
`ROSTER_SYNC_DRAIN_SECRET` is configured. `POST /api/jobs/drain` remains
available for manual schedulers using the same authentication.

The nightly route enqueues every organization with a saved adoption-page source
URL. Jobs become eligible one at a time, spaced by
`ROSTER_SYNC_SCHEDULE_STAGGER_MS` (five minutes by default), and an organization
with a queued or running job is skipped. Each drain invocation runs at most one
eligible job, heartbeats its lease while it works, and uses
`ROSTER_SYNC_DRAIN_BUDGET_MS` (240 seconds by default) within the route's
300-second maximum duration.

Register these exact OAuth redirect URLs with the enabled providers, replacing
the origin with the deployed app URL:

- `/api/email-connectors/gmail/callback`
- `/api/email-connectors/microsoft/callback`

Then authenticate the Vercel CLI with `npx vercel login`, or provide a
`VERCEL_TOKEN` for non-interactive environments, and run:

```bash
./deploy.sh
```

The script can be invoked from any directory and always deploys this repository
to production. Additional Vercel CLI options may be passed as arguments.
