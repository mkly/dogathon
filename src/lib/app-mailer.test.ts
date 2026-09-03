import assert from "node:assert/strict";
import test from "node:test";

import { sendAppEmail } from "./app-mailer.ts";
import type { MailTransport, TransportFactory } from "./email-connectors.ts";

const message = {
  to: "sponsor@example.com",
  subject: "Biscuit update",
  body: "<p>Hello</p>",
  contentType: "html" as const,
};

const configuredEnvironment = {
  APP_SMTP_HOST: "smtp.example.com",
  APP_SMTP_PORT: "2525",
  APP_SMTP_SECURE: "true",
  APP_SMTP_USER: "platform-user",
  APP_SMTP_PASSWORD: "platform-password",
  APP_EMAIL_FROM: "Dogathon <hello@example.com>",
};

test("describes platform mail when any required SMTP credential is empty", async () => {
  const refuseTransport = () => {
    throw new Error("the dry-run path must not create a transport");
  };

  for (const key of [
    "APP_SMTP_HOST",
    "APP_SMTP_USER",
    "APP_SMTP_PASSWORD",
    "APP_EMAIL_FROM",
  ] as const) {
    const env = { ...configuredEnvironment, [key]: "" };
    assert.deepEqual(
      await sendAppEmail(message, { env, transportFactory: refuseTransport }),
      {
        dryRun: true,
        connector: "smtp",
        from: key === "APP_EMAIL_FROM" ? "" : "Dogathon <hello@example.com>",
        to: "sponsor@example.com",
        subject: "Biscuit update",
        body: "<p>Hello</p>",
        contentType: "html",
      },
    );
  }
});

test("sends platform mail through the shared SMTP transport path", async () => {
  let transportOptions: Parameters<TransportFactory>[0] | undefined;
  let sentMessage: Parameters<MailTransport["sendMail"]>[0] | undefined;
  const transportFactory: TransportFactory = (options) => {
    transportOptions = options;
    return {
      verify: async () => undefined,
      sendMail: async (input) => {
        sentMessage = input;
      },
    };
  };

  assert.equal(
    await sendAppEmail(message, { env: configuredEnvironment, transportFactory }),
    null,
  );
  assert.deepEqual(transportOptions, {
    host: "smtp.example.com",
    port: 2525,
    secure: true,
    auth: { user: "platform-user", pass: "platform-password" },
  });
  assert.deepEqual(sentMessage, {
    from: "Dogathon <hello@example.com>",
    to: "sponsor@example.com",
    subject: "Biscuit update",
    html: "<p>Hello</p>",
  });
});

test("coerces SMTP environment values and preserves validation messages", async () => {
  let transportOptions: Parameters<TransportFactory>[0] | undefined;
  const transportFactory: TransportFactory = (options) => {
    transportOptions = options;
    return { verify: async () => undefined, sendMail: async () => undefined };
  };

  await sendAppEmail(message, {
    env: { ...configuredEnvironment, APP_SMTP_PORT: "", APP_SMTP_SECURE: " off " },
    transportFactory,
  });
  assert.equal(transportOptions?.port, 587);
  assert.equal(transportOptions?.secure, false);

  await assert.rejects(
    () => sendAppEmail(message, {
      env: { ...configuredEnvironment, APP_SMTP_SECURE: "sometimes" },
      transportFactory,
    }),
    /APP_SMTP_SECURE must be a boolean/u,
  );
  await assert.rejects(
    () => sendAppEmail(message, {
      env: { ...configuredEnvironment, APP_SMTP_PORT: "70000" },
      transportFactory,
    }),
    /APP_SMTP_PORT must be an integer between 1 and 65535/u,
  );
});

test("rejects header injection in recipients, From addresses, and subjects", async () => {
  await assert.rejects(() => sendAppEmail({ ...message, to: "valid@example.com\r\nBcc: bad@example.com" }, {
    env: configuredEnvironment,
  }));
  await assert.rejects(() => sendAppEmail(message, {
    env: { ...configuredEnvironment, APP_EMAIL_FROM: "hello@example.com\nBcc: bad@example.com" },
  }));
  await assert.rejects(() => sendAppEmail({ ...message, subject: "Hello\nBcc: bad@example.com" }, {
    env: configuredEnvironment,
  }));
});
