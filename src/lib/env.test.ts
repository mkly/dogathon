import assert from "node:assert/strict";
import test from "node:test";

import { parseEnvironment } from "./env.ts";

test("parses typed environment values and applies normalized defaults", () => {
  const parsed = parseEnvironment({
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    BETTER_AUTH_URL: "https://dogathon.example///",
    APP_SMTP_PORT: "2525",
    APP_SMTP_SECURE: "yes",
  });

  assert.equal(parsed.BETTER_AUTH_URL, "https://dogathon.example");
  assert.equal(parsed.OPENAI_BASE_URL, "https://api.openai.com/v1");
  assert.equal(parsed.OPENAI_MODEL, "gpt-4o-mini");
  assert.equal(parsed.FIRECRAWL_BASE_URL, "https://api.firecrawl.dev/v2");
  assert.equal(parsed.MICROSOFT_TENANT_ID, "common");
  assert.equal(parsed.APP_SMTP_PORT, 2525);
  assert.equal(parsed.APP_SMTP_SECURE, true);
  assert.ok(Object.isFrozen(parsed.features));
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

test("requires authentication and connector-encryption secrets in production", () => {
  assert.throws(
    () => parseEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /BETTER_AUTH_SECRET: is required in production/u);
      assert.match(
        error.message,
        /EMAIL_CONNECTOR_ENCRYPTION_KEY: is required in production/u,
      );
      return true;
    },
  );
});

test("computes every capability flag once from parsed credentials", () => {
  const encryptionKey = Buffer.alloc(32, 7).toString("base64");
  const parsed = parseEnvironment({
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    OPENAI_API_KEY: "openai-key",
    FIRECRAWL_API_KEY: "firecrawl-key",
    STRIPE_SECRET_KEY: "stripe-key",
    CRON_SECRET: "scheduler-key",
    APP_SMTP_HOST: "smtp.example.com",
    APP_SMTP_PORT: "2525",
    APP_EMAIL_FROM: "hello@example.com",
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    MICROSOFT_CLIENT_ID: "microsoft-id",
    MICROSOFT_CLIENT_SECRET: "microsoft-secret",
    EMAIL_CONNECTOR_ENCRYPTION_KEY: encryptionKey,
  });

  assert.deepEqual(parsed.features, {
    ai: true,
    firecrawl: true,
    stripe: true,
    scheduler: true,
    platformSmtp: true,
    googleOAuth: true,
    microsoftOAuth: true,
    connectorEncryption: true,
  });

  parsed.OPENAI_API_KEY = undefined;
  assert.equal(parsed.features.ai, true);
});

test("keeps every capability false when its complete credential group is absent", () => {
  const parsed = parseEnvironment({
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    APP_SMTP_HOST: "smtp.example.com",
    APP_SMTP_PORT: "2525",
    GOOGLE_CLIENT_ID: "incomplete-google-client",
    MICROSOFT_CLIENT_SECRET: "incomplete-microsoft-client",
  });

  assert.deepEqual(parsed.features, {
    ai: false,
    firecrawl: false,
    stripe: false,
    scheduler: false,
    platformSmtp: false,
    googleOAuth: false,
    microsoftOAuth: false,
    connectorEncryption: false,
  });
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
