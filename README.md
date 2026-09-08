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

## Integrations

A rescue can link an animal page on any website or CMS to its matching Pawcast sponsor form. Use
the app base URL and organization slug, then pass the animal page's absolute URL as `source`:

```text
https://pawcast.example/happy-paws/sponsor?source=https%3A%2F%2Frescue.example%2Fdogs%2Fbiscuit
```

The app normalizes the source URL and looks it up in that organization's synced public roster. A
match redirects to the companion's sponsor page, including when the companion has since been
adopted. A missing or unknown source shows a rescue-branded message with a link to the public
roster instead of a 404. The embedded sponsor card behaves differently: it keeps visitors on the
host site by showing only a notice when it cannot find the companion.

For a CMS template, URL-encode the current page's canonical absolute URL and substitute it for
`ENCODED_PAGE_URL` in this framework-independent link:

```html
<a href="https://pawcast.example/happy-paws/sponsor?source=ENCODED_PAGE_URL">
  Sponsor this companion
</a>
```

### Embedded sponsor card

The framework-free sponsor card works in WordPress, static sites, and other CMS templates. Add a
container for each companion and load the script once from the Dogathon deployment:

```html
<div
  data-sponsor-org="happy-paws"
  data-sponsor-source="https://rescue.example/dogs/biscuit"
  data-sponsor-return="https://rescue.example/dogs/biscuit"
  data-sponsor-photo="hide"
  data-sponsor-name="hide"
  data-sponsor-details="hide"
  data-sponsor-intro="Help Biscuit thrive while they wait for a home."
></div>
<script src="https://pawcast.example/embed.js"></script>
```

`data-sponsor-org` is required. `data-sponsor-source` defaults to the current page URL with its
fragment removed. On a shared sponsorship page, an absolute HTTP(S) `source` query parameter takes
precedence over that default. `data-sponsor-return` defaults to the current page URL, including its
query string. Set
`data-sponsor-photo="hide"`, `data-sponsor-name="hide"`, or `data-sponsor-details="hide"` to omit
the companion photo, name, or breed / age / sex details respectively; a missing attribute or any
other value shows that part. Available companions also show a short explanation above the form. Set
`data-sponsor-intro="hide"` to omit it, or set the attribute to any other non-empty text to replace
the default explanation. Custom text is rendered as text, not HTML. The script does not use cookies or
dependencies. Its classes all begin with
`dogathon-sponsor-`, so a host site can override the bundled presentation without affecting
unrelated elements. Run the app locally and open `/embed-demo.html`; its `org`, `source`,
`photo=hide`, `name=hide`, `details=hide`, and `intro` query parameters make it easy to exercise a
synced companion and the display controls.

### Shared sponsorship page

A call-to-action on each animal page can link to one sponsorship page shared by every companion.
Put the CTA embed on the animal-page template and set `data-sponsor-info-url` to that shared page:

```html
<div
  data-sponsor-org="happy-paws"
  data-sponsor-mode="cta"
  data-sponsor-info-url="https://rescue.example/sponsor"
></div>
<script src="https://pawcast.example/embed.js"></script>
```

The script resolves the animal from the current page (or `data-sponsor-source`) and renders a
`Sponsor <name>` link whose URL includes the encoded source. CTA mode renders an unstyled link so it
inherits the host site's link and text styles. Target `.dogathon-sponsor-cta` in the host stylesheet
to customize its presentation. On the shared sponsorship page, use card mode without
`data-sponsor-source`:

```html
<div data-sponsor-org="happy-paws" data-sponsor-mode="card"></div>
<script src="https://pawcast.example/embed.js"></script>
```

The card reads the companion from the incoming `source` query parameter. Its checkout return URL
defaults to the full sponsorship-page URL, including that query parameter, so success, cancellation,
and error states return to the same companion view. Photo, name, details, and intro attributes apply
only to card mode; CTA mode shows only its link, or the existing status message when the companion
has already been sponsored or adopted.

The embed depends on these public endpoint contracts:

- `GET /api/public/{orgSlug}/companion?source={absolutePageUrl}` returns `{ id, name, breed,
  ageText, sex, photoUrl, monthlyCents, currency, status, companionUrl, sponsorUrl }`. `status` is
  `available`, `sponsored`, or `adopted`; an unknown organization or source returns `404` with
  `{ error }`.
- `POST /api/public/{orgSlug}/checkout` accepts either form-encoded or JSON `source`,
  `sponsorName`, `sponsorEmail`, and `returnTo`. `returnTo` must be an absolute URL on an origin
  configured for that organization. A form post redirects to Stripe with `303`; a JSON request
  returns `{ url }`.
- Successful and canceled checkout redirects add `sponsored=1` (plus `session_id`) or
  `checkout=canceled` to `returnTo`. Checkout errors add `error=invalid`, `error=rate-limited`,
  `error=unavailable`, or `error=billing`. JSON errors return the same code in `{ error }` with
  status `400`, `429`, `409`, or `502`, respectively.
- Cross-origin reads and JSON checkout calls require the page origin in the organization's allowed
  origins. Normal HTML form navigation does not require CORS, but its `returnTo` origin is still
  validated.

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
