import assert from "node:assert/strict";
import test from "node:test";

import { sendAppEmail } from "./app-mailer.ts";
import { parseEnvironment } from "./env.ts";

const message = {
  to: "sponsor@example.com",
  subject: "Biscuit update",
  body: "<p>Hello</p>",
  contentType: "html" as const,
};

const configuredEnvironment = parseEnvironment({
  DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
  APP_SMTP_HOST: "smtp.example.com",
  APP_SMTP_PORT: "2525",
  APP_SMTP_SECURE: "true",
  APP_SMTP_USER: "platform-user",
  APP_SMTP_PASSWORD: "platform-password",
  APP_EMAIL_FROM: "Dogathon <hello@example.com>",
});

test("rejects header injection in recipients, From addresses, and subjects", async () => {
  await assert.rejects(() => sendAppEmail({ ...message, to: "valid@example.com\r\nBcc: bad@example.com" }, {
    env: configuredEnvironment,
  }));
  await assert.rejects(() => sendAppEmail(message, {
    env: {
      ...configuredEnvironment,
      APP_EMAIL_FROM: "hello@example.com\nBcc: bad@example.com",
    },
  }));
  await assert.rejects(() => sendAppEmail({ ...message, subject: "Hello\nBcc: bad@example.com" }, {
    env: configuredEnvironment,
  }));
});
