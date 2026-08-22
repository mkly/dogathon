# Dogathon

A minimal Next.js app using PostgreSQL, Prisma, and Better Auth with username/password authentication.

## Run locally

1. Copy `.env.example` to `.env` and replace `BETTER_AUTH_SECRET` with a random value of at least 32 characters.
2. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Install dependencies and initialize the database:

   ```bash
   npm install
   npm run db:migrate -- --name init
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000).

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
   password), which lands you in [/admin](http://localhost:3000/admin). Compose
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

Staff sign in with email and password at `/sign-in` (Better Auth, email
verification disabled); `/admin`, the admin settings action, and the staff API
routes (`/api/sync`, `/api/pupdates/*`, `/api/arcade/gmail/*`) all reject
anonymous requests. Volunteers get no account at all — `/volunteer` and its
submit stay open on the shared link, as do the public sponsor pages.
