import assert from "node:assert/strict";
import { createServer } from "node:net";
import test, { after, before } from "node:test";

import {
  createEmailConnectorAuthorization,
  decryptEmailConnectorOAuthSession,
  decryptEmailSecret,
  encryptEmailSecret,
  exchangeEmailConnectorCode,
  sendEmailWithConnector,
  sendOrganizationEmail,
  verifySmtpConfiguration,
  type StoredEmailConnector,
} from "./email-connectors.ts";

let encryptedAccessToken = "";
let encryptedRefreshToken = "";

const originalEnvironment = {
  encryption: process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY,
  gmailId: process.env.GOOGLE_CLIENT_ID,
  gmailSecret: process.env.GOOGLE_CLIENT_SECRET,
  microsoftId: process.env.MICROSOFT_CLIENT_ID,
  microsoftSecret: process.env.MICROSOFT_CLIENT_SECRET,
  microsoftTenant: process.env.MICROSOFT_TENANT_ID,
};

before(async () => {
  process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.GOOGLE_CLIENT_ID = "gmail-client";
  process.env.GOOGLE_CLIENT_SECRET = "gmail-secret";
  process.env.MICROSOFT_CLIENT_ID = "microsoft-client";
  process.env.MICROSOFT_CLIENT_SECRET = "microsoft-secret";
  process.env.MICROSOFT_TENANT_ID = "organizations";
  encryptedAccessToken = await encryptEmailSecret("access-token");
  encryptedRefreshToken = await encryptEmailSecret("refresh-token");
});

after(() => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("EMAIL_CONNECTOR_ENCRYPTION_KEY", originalEnvironment.encryption);
  restore("GOOGLE_CLIENT_ID", originalEnvironment.gmailId);
  restore("GOOGLE_CLIENT_SECRET", originalEnvironment.gmailSecret);
  restore("MICROSOFT_CLIENT_ID", originalEnvironment.microsoftId);
  restore("MICROSOFT_CLIENT_SECRET", originalEnvironment.microsoftSecret);
  restore("MICROSOFT_TENANT_ID", originalEnvironment.microsoftTenant);
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

  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.MICROSOFT_CLIENT_ID;
  delete process.env.MICROSOFT_CLIENT_SECRET;
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
    process.env.GOOGLE_CLIENT_ID = "gmail-client";
    process.env.GOOGLE_CLIENT_SECRET = "gmail-secret";
    process.env.MICROSOFT_CLIENT_ID = "microsoft-client";
    process.env.MICROSOFT_CLIENT_SECRET = "microsoft-secret";
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
  const key = process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY;
  delete process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY;
  try {
    assert.equal(
      (await sendEmailWithConnector(withoutKey, message, { fetch: refuse, transportFactory: refuseTransport }))?.dryRun,
      true,
    );
  } finally {
    process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY = key;
  }
});

test("routes organization email through the platform sender when no connector exists", async () => {
  const message = {
    to: "sponsor@example.com",
    subject: "Biscuit update",
    body: "Hello",
  };
  const smtpEnvironment = Object.fromEntries(
    ["APP_SMTP_HOST", "APP_SMTP_USER", "APP_SMTP_PASSWORD", "APP_EMAIL_FROM"]
      .map((key) => [key, process.env[key]]),
  );
  for (const key of Object.keys(smtpEnvironment)) delete process.env[key];

  let result;
  try {
    result = await sendOrganizationEmail("org-a", message, {
      findConnector: async () => null,
      sendEmailWithConnector: async () => {
        throw new Error("an organization connector must not be used");
      },
    });
  } finally {
    for (const [key, value] of Object.entries(smtpEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
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
      { to: "sponsor@example.com", subject: "SMTP pupdate", body: "Biscuit says hello" },
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /Subject: SMTP pupdate/u);
  assert.match(messages[0]!, /Biscuit says hello/u);
});
