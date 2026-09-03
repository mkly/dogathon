import assert from "node:assert/strict";
import test from "node:test";

import { parseEnvironment } from "./env.ts";

test("parses typed environment values and applies normalized defaults", () => {
  const parsed = parseEnvironment({
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    BETTER_AUTH_URL: "https://dogathon.example///",
    APP_SMTP_PORT: "2525",
    APP_SMTP_SECURE: "yes",
    ROSTER_SYNC_DRAIN_BUDGET_MS: "120000",
  });

  assert.equal(parsed.BETTER_AUTH_URL, "https://dogathon.example");
  assert.equal(parsed.OPENAI_BASE_URL, "https://api.openai.com/v1");
  assert.equal(parsed.OPENAI_MODEL, "gpt-4o-mini");
  assert.equal(parsed.FIRECRAWL_BASE_URL, "https://api.firecrawl.dev/v2");
  assert.equal(parsed.MICROSOFT_TENANT_ID, "common");
  assert.equal(parsed.APP_SMTP_PORT, 2525);
  assert.equal(parsed.APP_SMTP_SECURE, true);
  assert.equal(parsed.ROSTER_SYNC_DRAIN_BUDGET_MS, 120_000);
  assert.equal(parsed.ROSTER_SYNC_SCHEDULE_STAGGER_MS, 300_000);
});

test("reports missing and invalid environment variables by name", () => {
  assert.throws(
    () => parseEnvironment({ NODE_ENV: "preview" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DATABASE_URL: is required/u);
      assert.match(error.message, /NODE_ENV:/u);
      return true;
    },
  );
});

test("requires an authentication secret in production", () => {
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    }),
    /BETTER_AUTH_SECRET: is required in production/u,
  );
});

test("empty optional credentials remain absent for dry-run behavior", () => {
  const parsed = parseEnvironment({
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    OPENAI_API_KEY: "",
    STRIPE_SECRET_KEY: "  ",
    GOOGLE_CLIENT_ID: "",
  });

  assert.equal(parsed.OPENAI_API_KEY, undefined);
  assert.equal(parsed.STRIPE_SECRET_KEY, undefined);
  assert.equal(parsed.GOOGLE_CLIENT_ID, undefined);
});

test("rejects a malformed connector encryption key", () => {
  assert.throws(
    () => parseEnvironment({
      DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
      EMAIL_CONNECTOR_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
    }),
    /EMAIL_CONNECTOR_ENCRYPTION_KEY: must be 32 random bytes encoded as base64/u,
  );
});
