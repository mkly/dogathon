import assert from "node:assert/strict";
import { createServer } from "node:net";
import test, { after, before } from "node:test";

import {
  decryptEmailSecret,
  emailConnectorAuthorizationUrl,
  encryptEmailSecret,
  exchangeEmailConnectorCode,
  sendEmailWithConnector,
  verifySmtpConfiguration,
  type StoredEmailConnector,
} from "./email-connectors.ts";

const originalEnvironment = {
  encryption: process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY,
  gmailId: process.env.GMAIL_CLIENT_ID,
  gmailSecret: process.env.GMAIL_CLIENT_SECRET,
  microsoftId: process.env.MICROSOFT_CLIENT_ID,
  microsoftSecret: process.env.MICROSOFT_CLIENT_SECRET,
  microsoftTenant: process.env.MICROSOFT_TENANT_ID,
};

before(() => {
  process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.GMAIL_CLIENT_ID = "gmail-client";
  process.env.GMAIL_CLIENT_SECRET = "gmail-secret";
  process.env.MICROSOFT_CLIENT_ID = "microsoft-client";
  process.env.MICROSOFT_CLIENT_SECRET = "microsoft-secret";
  process.env.MICROSOFT_TENANT_ID = "organizations";
});

after(() => {
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("EMAIL_CONNECTOR_ENCRYPTION_KEY", originalEnvironment.encryption);
  restore("GMAIL_CLIENT_ID", originalEnvironment.gmailId);
  restore("GMAIL_CLIENT_SECRET", originalEnvironment.gmailSecret);
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
    accessTokenEncrypted: encryptEmailSecret("access-token"),
    refreshTokenEncrypted: encryptEmailSecret("refresh-token"),
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

test("encrypts connector credentials with authenticated encryption", () => {
  const encrypted = encryptEmailSecret("not-plain-text");
  assert.notEqual(encrypted, "not-plain-text");
  assert.equal(decryptEmailSecret(encrypted), "not-plain-text");
  assert.throws(() => decryptEmailSecret(`${encrypted.slice(0, -1)}x`));
});

test("builds provider authorization URLs with offline access and state", () => {
  const gmail = new URL(emailConnectorAuthorizationUrl("gmail", "https://dogathon.test", "state-a"));
  assert.equal(gmail.origin, "https://accounts.google.com");
  assert.equal(gmail.searchParams.get("access_type"), "offline");
  assert.equal(gmail.searchParams.get("state"), "state-a");
  assert.match(gmail.searchParams.get("scope") ?? "", /gmail\.send/u);

  const microsoft = new URL(emailConnectorAuthorizationUrl("microsoft", "https://dogathon.test", "state-b"));
  assert.match(microsoft.pathname, /organizations\/oauth2\/v2\.0\/authorize$/u);
  assert.equal(microsoft.searchParams.get("state"), "state-b");
  assert.match(microsoft.searchParams.get("scope") ?? "", /offline_access/u);
  assert.match(microsoft.searchParams.get("scope") ?? "", /Mail\.Send/u);
});

test("completes Gmail and Microsoft OAuth flows against stubbed providers", async () => {
  const requests: string[] = [];
  const providerFetch = async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "google-access", refresh_token: "google-refresh", expires_in: 1200 });
    }
    if (url.includes("openidconnect.googleapis.com")) {
      return Response.json({ email: "gmail@example.com" });
    }
    if (url.includes("login.microsoftonline.com")) {
      return Response.json({ access_token: "ms-access", refresh_token: "ms-refresh", expires_in: 1200 });
    }
    if (url.includes("graph.microsoft.com/v1.0/me")) {
      return Response.json({ mail: "microsoft@example.com" });
    }
    return new Response("unexpected request", { status: 500 });
  };

  const gmail = await exchangeEmailConnectorCode("gmail", "code-a", "https://dogathon.test", providerFetch as typeof fetch);
  const microsoft = await exchangeEmailConnectorCode("microsoft", "code-b", "https://dogathon.test", providerFetch as typeof fetch);
  assert.equal(gmail.fromEmail, "gmail@example.com");
  assert.equal(gmail.refreshToken, "google-refresh");
  assert.equal(microsoft.fromEmail, "microsoft@example.com");
  assert.equal(microsoft.refreshToken, "ms-refresh");
  assert.equal(requests.length, 4);
});

test("sends through Gmail and Microsoft provider APIs", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const providerFetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return String(input).includes("gmail")
      ? Response.json({ id: "message-a" })
      : new Response(null, { status: 202 });
  };
  const message = {
    to: "sponsor@example.com",
    subject: "Biscuit update",
    body: "Hello",
    contentType: "plain" as const,
  };

  await sendEmailWithConnector(connector("gmail"), message, { fetch: providerFetch as typeof fetch });
  await sendEmailWithConnector(connector("microsoft"), message, { fetch: providerFetch as typeof fetch });

  assert.match(calls[0]!.url, /gmail.*messages\/send/u);
  assert.equal(
    calls[0]!.init?.headers && (calls[0]!.init.headers as Record<string, string>).Authorization,
    "Bearer access-token",
  );
  assert.match(calls[1]!.url, /graph\.microsoft\.com\/v1\.0\/me\/sendMail/u);
  assert.match(String(calls[1]!.init?.body), /sponsor@example\.com/u);
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
        smtpPasswordEncrypted: encryptEmailSecret(smtp.password),
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
