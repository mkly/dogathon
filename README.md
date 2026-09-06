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
   npm run db:migrate
   ```

   Roster sync jobs are stored in pg-boss's `pgboss` schema. Prisma does not
   manage that schema: the application creates and migrates it when the lazy
   shared PgBoss instance first calls `boss.start()`.

4. Seed the demo organization, then start the app:

   ```bash
   npm run seed
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

## Volunteer photo storage

Local development needs no AWS account. When `S3_PHOTO_BUCKET` and
`AWS_REGION` are unset, volunteer photos are written beneath the gitignored
`.photos/` directory and served through the application.

Production requires `S3_PHOTO_BUCKET` and `AWS_REGION`. Configure AWS
credentials through `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (or the
hosting platform's AWS credential provider), and grant the application write
access to the bucket. Photo objects are public by design, so the bucket needs a
public-read bucket policy or a public CDN such as CloudFront. Set
`S3_PUBLIC_BASE_URL` to that CDN origin when applicable. Browser CORS rules are
not required because uploads go through the Dogathon server rather than
directly from the browser. When a roster sync begins using photos from a new
host, add that HTTPS host and its photo path to `images.remotePatterns` in
`next.config.ts`; unlisted hosts are intentionally rejected by the image
optimizer.

## Request limits

Photo uploads and volunteer check-in AI requests are limited to 20 requests per hour per signed-in user (or client IP when no session is present). Public sponsorship checkout creation is limited to 5 requests per hour on the same basis. These fixed-window counters are stored in PostgreSQL so the limits apply across Vercel instances. AI responses are capped at 240 tokens for a chat turn, 600 tokens for a check-in summary, and 900 tokens for sponsor-update composition.

## Styling

- Use CSS Modules only; do not use Tailwind or runtime CSS-in-JS.
- Each primitive in `src/components` owns exactly one CSS Module.
- Route pages compose primitives and keep a module only for page-specific layout.
- Keep tokens, resets, tone utilities, and focus rules only in `src/app/globals.css` and `src/app/felt.css`.
- Never restyle a primitive with a descendant selector from another module; pass `className` or a prop instead.

## Deploy to Vercel

Configure the variables from `.env.example` as Vercel project environment
variables before deploying. In particular, `DATABASE_URL` must point to a
production PostgreSQL database, `BETTER_AUTH_SECRET` must be a production
secret, `BETTER_AUTH_URL` must be the deployed app URL, and the S3 photo bucket
and region must be configured as described above. Set
`EMAIL_CONNECTOR_ENCRYPTION_KEY` to 32 random bytes encoded as base64 before an
organization connects email, and configure the Google and/or Microsoft OAuth
client variables for those connector choices; plain SMTP needs no app-wide
provider credentials. Configure the Stripe test keys plus the Firecrawl and
OpenAI-compatible model variables when those integrations are enabled. Vercel's
install step runs the existing `postinstall` script, which generates the Prisma
client.

Vercel Hobby only permits daily cron schedules, so the checked-in `vercel.json`
does not register any Vercel Cron Jobs. Generate a strong scheduler secret and
set it as the production `CRON_SECRET` environment variable in Vercel:

```bash
openssl rand -hex 32
npx vercel env add CRON_SECRET production
```

Configure an external server to call `POST /api/jobs/drain` every five minutes
and `GET /api/jobs/schedule-roster-sync` daily at 08:00 UTC. Both routes require
the same value in an `Authorization: Bearer <CRON_SECRET>` header and refuse
calls when `CRON_SECRET` is not configured.

On the external server, store the secret in a curl config readable only by the
cron user. Replace the example origin and secret below:

```bash
sudo install -d -m 700 /etc/dogathon
sudo sh -c 'cat > /etc/dogathon/cron.curl' <<'EOF'
silent
show-error
fail-with-body
connect-timeout = 15
max-time = 290
header = "Authorization: Bearer replace-with-the-production-cron-secret"
EOF
sudo chmod 600 /etc/dogathon/cron.curl
```

Then install these entries in root's crontab with `sudo crontab -e`:

```cron
*/5 * * * * /usr/bin/flock -n /tmp/dogathon-drain.lock /usr/bin/curl --config /etc/dogathon/cron.curl --request POST https://dogathon.example/api/jobs/drain
0 8 * * * /usr/bin/curl --config /etc/dogathon/cron.curl https://dogathon.example/api/jobs/schedule-roster-sync
```

The `flock` guard prevents overlapping drain invocations. Confirm the paths to
`flock` and `curl` with `command -v flock curl` on the scheduler server. Cron
uses that server's clock, so set the entry accordingly if 08:00 UTC is required
and the server is not configured for UTC.

The nightly route enqueues every organization with a saved adoption-page source
URL. Jobs become eligible one at a time, spaced by a fixed five minutes, and
pg-boss's exclusive queue policy skips an organization with a queued or running
job. Each drain invocation fetches and settles at most one eligible job and
uses a fixed 240-second budget within the route's 300-second maximum duration.

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
