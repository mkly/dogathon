# Dogathon

A multitenant Next.js app using PostgreSQL, Prisma, and Better Auth organizations.

## Run locally

1. Copy `.env.example` to `.env` and replace `BETTER_AUTH_SECRET` with a random value of at least 32 characters. Set `INVITATION_EMAIL_WEBHOOK_URL` to an endpoint that accepts the invitation JSON payload when you want real email delivery; local development logs invitation links when it is unset.
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

## Stripe Connect billing

Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to test-mode values. In the
Stripe Dashboard, create a Connect webhook endpoint at `/api/stripe/webhook`
for `account.updated`, `checkout.session.completed`, and
`customer.subscription.deleted` events on connected accounts. An organization
owner can then open the staff room and use **Connect Stripe** to onboard an
Express account. Sponsorship Checkout sessions and subscriptions are created
on that organization's connected account.

## Deploy to Vercel

Configure the variables from `.env.example` as Vercel project environment
variables before deploying. In particular, `DATABASE_URL` must point to a
production PostgreSQL database, `BETTER_AUTH_SECRET` must be a production
secret, and `BETTER_AUTH_URL` must be the deployed app URL. Configure the
Stripe test keys plus the Arcade and OpenAI-compatible model variables when
those integrations are enabled. Vercel's
install step runs the existing `postinstall` script, which generates the Prisma
client.

Then authenticate the Vercel CLI with `npx vercel login`, or provide a
`VERCEL_TOKEN` for non-interactive environments, and run:

```bash
./deploy.sh
```

The script can be invoked from any directory and always deploys this repository
to production. Additional Vercel CLI options may be passed as arguments.

## Demo

The whole demo runs offline: with no `ARCADE_API_KEY` every email/SMS send and
page scrape is a logged dry run, and the roster syncs from the checked-in
captures in `seed/`. Real Arcade sends are a bonus when credentials are
present in `.env`.

### Setup

```bash
docker compose up -d          # PostgreSQL 17 on localhost:5432
npm install
npm run db:migrate -- --name init
npm run seed                  # Biscuit, his sponsors, care notes, settings
npm run dev
```

### The 90-second script

1. **Meet Biscuit** — open [http://localhost:3000](http://localhost:3000); the
   seeded resident Biscuit is on the public grid.
2. **Sponsor a dog** — open Biscuit's page and sponsor him for $25/month until
   adopted, choosing email, text, or both.
3. **Volunteer check-in** — from a phone (or
   [/volunteer](http://localhost:3000/volunteer)), pick a dog, add a photo and a
   one-liner, and send the pup-date.
4. **Staff room** — the staff room is behind sign-in: create a staff account
   once at [/sign-in](http://localhost:3000/sign-in) (Sign up, email +
   password), then create or accept an organization at `/organizations`. Compose
   a draft from the fresh notes — the staff API needs your session cookie, so
   run it from the browser console on /admin:
   `await fetch('/api/pupdates/compose', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({residentId:'demo-resident-biscuit'})})`
   — then approve it in /admin. The send fans out once per sponsor channel with
   the pinned postscript stitched on — dry-run logs unless Arcade credentials
   are set.
5. **Adoption day** — in the staff-room settings, set the source URL to
   `seed/dogs-page-A.html` and press **Sync now**: the roster of ~33 dogs
   syncs in and the available ones fill the public grid. Sponsor Hattie, flip the source to `seed/dogs-page-B.html`
   (where she is marked adopted), and sync again: her sponsorship closes and a
   graduation pupdate is queued as a draft for approval.
6. **The point** — staff writing time today: zero.

### Automated smoke test

With the app running against a migrated, seeded database:

```bash
npx tsx scripts/demo-smoke.ts
```

It walks every beat above end to end — the public sponsor form, the volunteer
note, compose, approve with the per-channel fan-out, and both roster syncs —
and fails loudly on the first broken step. Point it at another origin with
`DEMO_BASE_URL`. Because the staff routes require a session, it signs in before
the staff beats and creates that account on its first run; override it with
`DEMO_STAFF_EMAIL` / `DEMO_STAFF_PASSWORD`.

## Accounts

Users sign in with email and password at `/sign-in` (Better Auth, email
verification disabled). Organization owners can invite admins or volunteers;
the Better Auth `member` role is the volunteer role. Admin pages, actions, and
staff APIs require an owner/admin membership in the session's active
organization. `/volunteer` and its submit action require any active membership.
Every domain read and write is scoped to that organization.
