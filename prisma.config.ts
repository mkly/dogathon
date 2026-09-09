import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` runs from npm postinstall in boxes that have no .env;
    // generate never connects, so a missing URL must not fail the install.
    // Migrate and seed still fail loudly against the placeholder.
    url:
      process.env.DATABASE_URL ??
      "postgresql://unset:unset@localhost:5432/unset",
    // Prisma 7 reads the shadow database from config rather than a migrate
    // diff CLI flag. It is only required by commands that replay migrations.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
