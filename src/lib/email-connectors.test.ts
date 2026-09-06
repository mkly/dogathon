import assert from "node:assert/strict";
import { createServer } from "node:net";
import test, { after, before } from "node:test";

import {
  createEmailConnectorAuthorization,
  createOrganizationEmailSender,
  decryptEmailConnectorOAuthSession,
  decryptEmailSecret,
  encryptEmailSecret,
  exchangeEmailConnectorCode,
  sendEmailWithConnector,
  sendOrganizationEmail,
  verifySmtpConfiguration,
  type StoredEmailConnector,
} from "./email-connectors.ts";
import { env } from "./env.ts";

let encryptedAccessToken = "";
let encryptedRefreshToken = "";

const originalEnvironment = {
  encryption: env.EMAIL_CONNECTOR_ENCRYPTION_KEY,
  gmailId: env.GOOGLE_CLIENT_ID,
  gmailSecret: env.GOOGLE_CLIENT_SECRET,
  microsoftId: env.MICROSOFT_CLIENT_ID,
  microsoftSecret: env.MICROSOFT_CLIENT_SECRET,
  microsoftTenant: env.MICROSOFT_TENANT_ID,
  features: env.features,
};

before(async () => {
  env.EMAIL_CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  env.GOOGLE_CLIENT_ID = "gmail-client";
  env.GOOGLE_CLIENT_SECRET = "gmail-secret";
  env.MICROSOFT_CLIENT_ID = "microsoft-client";
  env.MICROSOFT_CLIENT_SECRET = "microsoft-secret";
  env.MICROSOFT_TENANT_ID = "organizations";
  env.features = Object.freeze({
    ...env.features,
    connectorEncryption: true,
    googleOAuth: true,
    microsoftOAuth: true,
  });
  encryptedAccessToken = await encryptEmailSecret("access-token");
  encryptedRefreshToken = await encryptEmailSecret("refresh-token");
});

after(() => {
  env.EMAIL_CONNECTOR_ENCRYPTION_KEY = originalEnvironment.encryption;
  env.GOOGLE_CLIENT_ID = originalEnvironment.gmailId;
  env.GOOGLE_CLIENT_SECRET = originalEnvironment.gmailSecret;
  env.MICROSOFT_CLIENT_ID = originalEnvironment.microsoftId;
  env.MICROSOFT_CLIENT_SECRET = originalEnvironment.microsoftSecret;
  env.MICROSOFT_TENANT_ID = originalEnvironment.microsoftTenant;
  env.features = originalEnvironment.features;
});

function connector(
  type: "gmail" | "microsoft" | "smtp",
  overrides: Partial<StoredEmailConnector> = {},
): StoredEmailConnector {
  return {
    orgId: "org-a",
    type,
    fromEmail: "rescue@example.com",
    accessTokenEncrypted: encryptedAccessToken,
    refreshTokenEncrypted: encryptedRefreshToken,
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    smtpHost: null,
    smtpPort: null,
    smtpSecure: null,
    smtpUser: null,
    smtpPasswordEncrypted: null,
    verifiedAt: new Date(),
    ...overrides,
  };
}

test("encrypts connector credentials as authenticated compact JWE", async () => {
  const encrypted = await encryptEmailSecret("not-plain-text");
  assert.notEqual(encrypted, "not-plain-text");
  assert.equal(encrypted.split(".").length, 5);
  assert.equal(await decryptEmailSecret(encrypted), "not-plain-text");
  const parts = encrypted.split(".");
  const tamperedCiphertext = Buffer.from(parts[3]!, "base64url");
  tamperedCiphertext[0] ^= 0x01;
  parts[3] = tamperedCiphertext.toString("base64url");
  await assert.rejects(
    decryptEmailSecret(parts.join(".")),
    /Stored email credential is invalid/u,
  );
});

test("builds PKCE authorization URLs and stores OAuth state in encrypted sessions", async () => {
  const gmailAuthorization = await createEmailConnectorAuthorization(
    "gmail",
    "https://dogathon.test",
    "org-a",
  );
  const gmailSession = await decryptEmailConnectorOAuthSession(gmailAuthorization.cookie);
  const gmail = new URL(gmailAuthorization.url);
  assert.equal(gmail.origin, "https://accounts.google.com");
  assert.equal(gmail.searchParams.get("access_type"), "offline");
  assert.equal(gmail.searchParams.get("state"), gmailSession.state);
  assert.equal(gmail.searchParams.get("code_challenge_method"), "S256");
  assert.ok(gmail.searchParams.get("code_challenge"));
  assert.equal(gmailSession.orgId, "org-a");
  assert.match(gmail.searchParams.get("scope") ?? "", /gmail\.send/u);

  const microsoftAuthorization = await createEmailConnectorAuthorization(
    "microsoft",
    "https://dogathon.test",
    "org-b",
  );
  const microsoftSession = await decryptEmailConnectorOAuthSession(microsoftAuthorization.cookie);
  const microsoft = new URL(microsoftAuthorization.url);
  assert.match(microsoft.pathname, /organizations\/oauth2\/v2\.0\/authorize$/u);
  assert.equal(microsoft.searchParams.get("state"), microsoftSession.state);
  assert.equal(microsoftSession.orgId, "org-b");
  assert.match(microsoft.searchParams.get("scope") ?? "", /offline_access/u);
  assert.match(microsoft.searchParams.get("scope") ?? "", /Mail\.Send/u);
});

test("completes Gmail and Microsoft OAuth flows against stubbed providers", async () => {
  const requests: string[] = [];
  const providerFetch = async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(url);
    if (url.includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "google-access", refresh_token: "google-refresh", expires_in: 1200, token_type: "Bearer" });
    }
    if (url.includes("openidconnect.googleapis.com")) {
      return Response.json({ email: "gmail@example.com" });
    }
    if (url.includes("login.microsoftonline.com")) {
      return Response.json({ access_token: "ms-access", refresh_token: "ms-refresh", expires_in: 1200, token_type: "Bearer" });
    }
    if (url.includes("graph.microsoft.com/v1.0/me")) {
      return Response.json({ mail: "microsoft@example.com" });
    }
    return new Response("unexpected request", { status: 500 });
  };

  const gmailAuthorization = await createEmailConnectorAuthorization("gmail", "https://dogathon.test", "org-a");
  const gmailSession = await decryptEmailConnectorOAuthSession(gmailAuthorization.cookie);
  const gmailCallback = new URL("https://dogathon.test/api/email-connectors/gmail/callback");
  gmailCallback.search = new URLSearchParams({ code: "code-a", state: gmailSession.state }).toString();
  const microsoftAuthorization = await createEmailConnectorAuthorization("microsoft", "https://dogathon.test", "org-b");
  const microsoftSession = await decryptEmailConnectorOAuthSession(microsoftAuthorization.cookie);
  const microsoftCallback = new URL("https://dogathon.test/api/email-connectors/microsoft/callback");
  microsoftCallback.search = new URLSearchParams({ code: "code-b", state: microsoftSession.state }).toString();
  const gmail = await exchangeEmailConnectorCode("gmail", gmailCallback, "https://dogathon.test", gmailSession, providerFetch as typeof fetch);
  const microsoft = await exchangeEmailConnectorCode("microsoft", microsoftCallback, "https://dogathon.test", microsoftSession, providerFetch as typeof fetch);
  assert.equal(gmail.fromEmail, "gmail@example.com");
  assert.equal(gmail.refreshToken, "google-refresh");
  assert.equal(microsoft.fromEmail, "microsoft@example.com");
  assert.equal(microsoft.refreshToken, "ms-refresh");
  assert.equal(requests.length, 4);
});

test("completes the Microsoft flow when the tenant returns a foreign-issuer ID token", async () => {
  // The organizations/common tenants sign ID tokens with the resolved tenant's
  // issuer, which never matches the literal tenant in our provider metadata.
  const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  const idToken = [
    segment({ alg: "RS256" }),
    segment({
      iss: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
      aud: "microsoft-client",
      sub: "user-a",
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
    "signature",
  ].join(".");
  const providerFetch = async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("login.microsoftonline.com")) {
      return Response.json({ access_token: "ms-access", refresh_token: "ms-refresh", expires_in: 1200, token_type: "Bearer", id_token: idToken });
    }
    if (url.includes("graph.microsoft.com/v1.0/me")) {
      return Response.json({ mail: "microsoft@example.com" });
    }
    return new Response("unexpected request", { status: 500 });
  };

  const authorization = await createEmailConnectorAuthorization("microsoft", "https://dogathon.test", "org-b");
  const session = await decryptEmailConnectorOAuthSession(authorization.cookie);
  const callback = new URL("https://dogathon.test/api/email-connectors/microsoft/callback");
  callback.search = new URLSearchParams({ code: "code-b", state: session.state }).toString();

  const tokens = await exchangeEmailConnectorCode("microsoft", callback, "https://dogathon.test", session, providerFetch as typeof fetch);
  assert.equal(tokens.fromEmail, "microsoft@example.com");
  assert.equal(tokens.refreshToken, "ms-refresh");
});

test("sends RFC-compliant MIME through Gmail and JSON through Microsoft", async () => {
  const calls: Request[] = [];
  const providerFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return request.url.includes("gmail")
      ? Response.json({ id: "message-a" })
      : new Response(null, { status: 202 });
  };
  const message = {
    to: "sponsor@example.com",
    subject: `${"Biscuit's café fundraiser 🐾 ".repeat(8)}update`,
    body: "Hello",
    contentType: "plain" as const,
  };

  await sendEmailWithConnector(connector("gmail"), message, { fetch: providerFetch as typeof fetch });
  await sendEmailWithConnector(connector("microsoft"), message, { fetch: providerFetch as typeof fetch });

  assert.match(calls[0]!.url, /gmail.*messages\/send/u);
  assert.equal(calls[0]!.headers.get("authorization"), "Bearer access-token");
  const gmailRequest = await calls[0]!.json() as { raw: string };
  const gmailMessage = Buffer.from(gmailRequest.raw, "base64url").toString("utf8");
  assert.match(gmailMessage, /^Date: .+$/mu);
  assert.match(gmailMessage, /^Message-ID: <.+>$/mu);
  assert.match(
    gmailMessage,
    /^Subject: =\?UTF-8\?[BQ]\?.+\?=\r\n[ \t]+=\?UTF-8\?[BQ]\?.+\?=/mu,
  );
  assert.match(calls[1]!.url, /graph\.microsoft\.com\/v1\.0\/me\/sendMail/u);
  assert.match(await calls[1]!.text(), /sponsor@example\.com/u);
});

test("describes the send for every connector type when its credentials are unset", async () => {
  const refuse = (() => {
    throw new Error("the dry-run path must not transmit");
  }) as unknown as typeof fetch;
  const refuseTransport = () => {
    throw new Error("the dry-run path must not open a socket");
  };
  const message = {
    to: "sponsor@example.com",
    subject: "Biscuit update",
    body: "<p>Hello</p>",
    contentType: "html" as const,
  };

  env.GOOGLE_CLIENT_ID = undefined;
  env.GOOGLE_CLIENT_SECRET = undefined;
  env.MICROSOFT_CLIENT_ID = undefined;
  env.MICROSOFT_CLIENT_SECRET = undefined;
  env.features = Object.freeze({
    ...env.features,
    googleOAuth: false,
    microsoftOAuth: false,
  });
  try {
    for (const provider of ["gmail", "microsoft"] as const) {
      assert.deepEqual(
        await sendEmailWithConnector(connector(provider), message, { fetch: refuse }),
        {
          dryRun: true,
          connector: provider,
          from: "rescue@example.com",
          to: "sponsor@example.com",
          subject: "Biscuit update",
          body: "<p>Hello</p>",
          contentType: "html",
        },
      );
    }
  } finally {
    env.GOOGLE_CLIENT_ID = "gmail-client";
    env.GOOGLE_CLIENT_SECRET = "gmail-secret";
    env.MICROSOFT_CLIENT_ID = "microsoft-client";
    env.MICROSOFT_CLIENT_SECRET = "microsoft-secret";
    env.features = Object.freeze({
      ...env.features,
      googleOAuth: true,
      microsoftOAuth: true,
    });
  }

  // SMTP carries no app-level env credentials, so an unconfigured org connector
  // is what "credentials unset" means for it.
  const smtp = await sendEmailWithConnector(
    connector("smtp", {
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      accessTokenExpiresAt: null,
    }),
    message,
    { fetch: refuse, transportFactory: refuseTransport },
  );
  assert.equal(smtp?.connector, "smtp");
  assert.equal(smtp?.dryRun, true);

  // A fully configured SMTP org still stays offline without the encryption key
  // that would let the stored password be read.
  const withoutKey = { ...connector("smtp"), smtpHost: "smtp.example.com", smtpPort: 587, smtpSecure: false, smtpUser: "u", smtpPasswordEncrypted: await encryptEmailSecret("p") };
  const key = env.EMAIL_CONNECTOR_ENCRYPTION_KEY;
  env.EMAIL_CONNECTOR_ENCRYPTION_KEY = undefined;
  env.features = Object.freeze({ ...env.features, connectorEncryption: false });
  try {
    assert.equal(
      (await sendEmailWithConnector(withoutKey, message, { fetch: refuse, transportFactory: refuseTransport }))?.dryRun,
      true,
    );
  } finally {
    env.EMAIL_CONNECTOR_ENCRYPTION_KEY = key;
    env.features = Object.freeze({ ...env.features, connectorEncryption: true });
  }
});

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
    result = await sendOrganizationEmail("org-a", message, {
      findConnector: async () => null,
      sendEmailWithConnector: async () => {
        throw new Error("an organization connector must not be used");
      },
    });
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

  await sendOrganizationEmail(
    "org-a",
    { to: "sponsor@example.com", subject: "Biscuit update", body: "Hello" },
    {
      findConnector: async () => unverified,
      sendAppEmail: async () => {
        usedPlatformSender = true;
        return null;
      },
      sendEmailWithConnector: async () => {
        throw new Error("an unverified connector must not be used");
      },
    },
  );

  assert.equal(usedPlatformSender, true);
});

test("routes organization email through its verified connector", async () => {
  const verified = connector("smtp");
  let usedConnector: StoredEmailConnector | undefined;

  await sendOrganizationEmail(
    "org-a",
    { to: "sponsor@example.com", subject: "Biscuit update", body: "Hello" },
    {
      findConnector: async () => verified,
      sendAppEmail: async () => {
        throw new Error("the platform sender must not be used");
      },
      sendEmailWithConnector: async (selected) => {
        usedConnector = selected;
        return null;
      },
    },
  );

  assert.equal(usedConnector, verified);
});

test("prepares a verified organization connector once for repeated sends", async () => {
  const verified = connector("microsoft");
  let prepared = 0;
  let sent = 0;
  const send = await createOrganizationEmailSender("org-a", {
    findConnector: async () => verified,
    prepareConnector: async (selected) => {
      prepared += 1;
      return selected;
    },
    sendEmailWithConnector: async () => {
      sent += 1;
      return null;
    },
  });

  await Promise.all([
    send({ to: "one@example.com", subject: "One", body: "Hello" }),
    send({ to: "two@example.com", subject: "Two", body: "Hello" }),
  ]);

  assert.equal(prepared, 1);
  assert.equal(sent, 2);
});

test("verifies and sends through a password-authenticated SMTP server", async () => {
  const messages: string[] = [];
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 localhost ESMTP\r\n");
    let buffer = "";
    let dataMode = false;
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (true) {
        if (dataMode) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end < 0) return;
          messages.push(buffer.slice(0, end));
          buffer = buffer.slice(end + 5);
          dataMode = false;
          socket.write("250 queued\r\n");
          continue;
        }
        const end = buffer.indexOf("\r\n");
        if (end < 0) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (/^EHLO /u.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH PLAIN /u.test(line)) socket.write("235 authenticated\r\n");
        else if (/^(MAIL FROM|RCPT TO):/u.test(line)) socket.write("250 ok\r\n");
        else if (line === "DATA") {
          dataMode = true;
          socket.write("354 end with dot\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const smtp = {
    host: "127.0.0.1",
    port: address.port,
    secure: false,
    user: "smtp-user",
    password: "smtp-password",
    fromEmail: "rescue@example.com",
  };

  try {
    await verifySmtpConfiguration(smtp);
    await sendEmailWithConnector(
      connector("smtp", {
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpSecure: smtp.secure,
        smtpUser: smtp.user,
        smtpPasswordEncrypted: await encryptEmailSecret(smtp.password),
      }),
      { to: "sponsor@example.com", subject: "SMTP update", body: "Biscuit says hello" },
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /Subject: SMTP update/u);
  assert.match(messages[0]!, /Biscuit says hello/u);
});
