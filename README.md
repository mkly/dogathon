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

Better Auth requires an email field internally. This scaffold derives a local-only placeholder from the username during sign-up; users only enter and authenticate with a username and password. Email verification is disabled.
