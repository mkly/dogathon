import assert from "node:assert/strict";
import test from "node:test";

import {
  createOrganizationEmailSender,
  type StoredEmailConnector,
} from "./email-connectors.ts";
import { env } from "./env.ts";

function connector(
  type: "gmail" | "microsoft" | "smtp",
  overrides: Partial<StoredEmailConnector> = {},
): StoredEmailConnector {
  return {
    orgId: "org-a",
    type,
    fromEmail: "rescue@example.com",
    accessTokenEncrypted: null,
    refreshTokenEncrypted: null,
    accessTokenExpiresAt: null,
    smtpHost: null,
    smtpPort: null,
    smtpSecure: null,
    smtpUser: null,
    smtpPasswordEncrypted: null,
    verifiedAt: new Date(),
    ...overrides,
  };
}

test("routes organization email through the platform sender when no connector exists", async () => {
  const message = {
    to: "sponsor@example.com",
    subject: "Biscuit update",
    body: "Hello",
  };
  const smtpEnvironmentKeys = [
    "APP_SMTP_HOST",
    "APP_SMTP_USER",
    "APP_SMTP_PASSWORD",
    "APP_EMAIL_FROM",
  ] as const;
  const smtpEnvironment = smtpEnvironmentKeys.map((key) => [key, env[key]] as const);
  for (const [key] of smtpEnvironment) {
    env[key] = undefined;
  }

  let result;
  try {
    const send = await createOrganizationEmailSender("org-a", {
      findConnector: async () => null,
      sendEmailWithConnector: async () => {
        throw new Error("an organization connector must not be used");
      },
    });
    result = await send(message);
  } finally {
    for (const [key, value] of smtpEnvironment) {
      env[key] = value;
    }
  }

  assert.deepEqual(result, {
    dryRun: true,
    connector: "smtp",
    from: "",
    ...message,
    contentType: "plain",
  });
});

test("routes organization email through the platform sender when its connector is unverified", async () => {
  const unverified = connector("smtp", { verifiedAt: null });
  let usedPlatformSender = false;

  const send = await createOrganizationEmailSender("org-a", {
    findConnector: async () => unverified,
    sendAppEmail: async () => {
      usedPlatformSender = true;
      return null;
    },
    sendEmailWithConnector: async () => {
      throw new Error("an unverified connector must not be used");
    },
  });
  await send({ to: "sponsor@example.com", subject: "Biscuit update", body: "Hello" });

  assert.equal(usedPlatformSender, true);
});

test("routes organization email through its verified connector", async () => {
  const verified = connector("smtp");
  let usedConnector: StoredEmailConnector | undefined;

  const send = await createOrganizationEmailSender("org-a", {
    findConnector: async () => verified,
    sendAppEmail: async () => {
      throw new Error("the platform sender must not be used");
    },
    sendEmailWithConnector: async (selected) => {
      usedConnector = selected;
      return null;
    },
  });
  await send({ to: "sponsor@example.com", subject: "Biscuit update", body: "Hello" });

  assert.equal(usedConnector, verified);
});
