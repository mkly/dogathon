import assert from "node:assert/strict";
import test from "node:test";

import { memoryAdapter } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins";

import type { MailTransport, TransportFactory } from "./email-connectors.ts";
import { parseEnvironment } from "./env.ts";
import { sendMagicLinkEmail } from "./magic-link-email.ts";

test("magic-link sign-in sends the verification URL through sendAppEmail", async () => {
  let sentMessage: Parameters<MailTransport["sendMail"]>[0] | undefined;
  const transportFactory: TransportFactory = () => ({
    verify: async () => undefined,
    sendMail: async (input) => {
      sentMessage = input;
    },
  });
  const env = parseEnvironment({
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    APP_SMTP_HOST: "smtp.example.com",
    APP_SMTP_PORT: "2525",
    APP_SMTP_SECURE: "false",
    APP_SMTP_USER: "platform-user",
    APP_SMTP_PASSWORD: "platform-password",
    APP_EMAIL_FROM: "Dogathon <hello@example.com>",
  });
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "magic-link-test-secret-at-least-32-characters",
    database: memoryAdapter({
      account: [],
      session: [],
      user: [],
      verification: [],
    }),
    plugins: [
      magicLink({
        sendMagicLink: (data) => sendMagicLinkEmail(data, { env, transportFactory }),
      }),
    ],
  });

  const response = await auth.handler(new Request(
    "http://localhost:3000/api/auth/sign-in/magic-link",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        callbackURL: "/account",
        email: "sponsor@example.com",
      }),
    },
  ));

  assert.equal(response.status, 200);
  assert.equal(sentMessage?.to, "sponsor@example.com");
  assert.equal(sentMessage?.subject, "Sign in to your Dogathon sponsor account");
  assert.match(String(sentMessage?.text), /http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\?/);
  assert.match(String(sentMessage?.text), /callbackURL=%2Faccount/);
});
