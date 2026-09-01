import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import nodemailer from "nodemailer";

import { prisma } from "./prisma.ts";

export type EmailConnectorKind = "gmail" | "microsoft" | "smtp";

export type EmailInput = {
  to: string;
  subject: string;
  body: string;
  contentType?: "plain" | "html";
};

/**
 * The absent-credential convention: with nothing configured to send through,
 * delivery describes the message instead of transmitting it. See .env.example.
 */
export type DescribedSend = {
  dryRun: true;
  connector: EmailConnectorKind;
  from: string;
  to: string;
  subject: string;
  body: string;
  contentType: "plain" | "html";
};

export type StoredEmailConnector = {
  orgId: string;
  type: EmailConnectorKind;
  fromEmail: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  accessTokenExpiresAt: Date | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  smtpUser: string | null;
  smtpPasswordEncrypted: string | null;
  verifiedAt: Date | null;
};

export type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
};

type Fetcher = typeof fetch;
export type MailTransport = {
  verify(): Promise<unknown>;
  sendMail(input: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<unknown>;
};
export type TransportFactory = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}) => MailTransport;

const GMAIL_SCOPE = "openid email https://www.googleapis.com/auth/gmail.send";
const MICROSOFT_SCOPE = "openid email profile offline_access User.Read Mail.Send";

function encryptionKey(): Buffer {
  const encoded = process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY;
  if (!encoded) throw new Error("EMAIL_CONNECTOR_ENCRYPTION_KEY is required");

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("EMAIL_CONNECTOR_ENCRYPTION_KEY must be 32 random bytes encoded as base64");
  }
  return key;
}

function hasEncryptionKey(): boolean {
  const encoded = process.env.EMAIL_CONNECTOR_ENCRYPTION_KEY;
  return Boolean(encoded) && Buffer.from(encoded!, "base64").length === 32;
}

export function encryptEmailSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptEmailSecret(value: string): string {
  const [ivEncoded, tagEncoded, ciphertextEncoded, extra] = value.split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded || extra) {
    throw new Error("Stored email credential is invalid");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivEncoded, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function createOAuthState(): { state: string; hash: string; expiresAt: Date } {
  const state = randomBytes(32).toString("base64url");
  return {
    state,
    hash: hashOAuthState(state),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
}

function microsoftTenant(): string {
  return process.env.MICROSOFT_TENANT_ID?.trim() || "common";
}

function oauthCredentials(provider: Exclude<EmailConnectorKind, "smtp">) {
  if (provider === "gmail") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required");
    }
    return { clientId, clientSecret };
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are required");
  }
  return { clientId, clientSecret };
}

function hasOAuthCredentials(provider: Exclude<EmailConnectorKind, "smtp">): boolean {
  return provider === "gmail"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

function describeSend(connector: StoredEmailConnector, input: EmailInput): DescribedSend {
  return {
    dryRun: true,
    connector: connector.type,
    from: connector.fromEmail,
    to: input.to,
    subject: input.subject,
    body: input.body,
    contentType: input.contentType === "html" ? "html" : "plain",
  };
}

function smtpCredentialsPresent(connector: StoredEmailConnector): boolean {
  return Boolean(
    connector.smtpHost &&
      connector.smtpPort &&
      connector.smtpSecure !== null &&
      connector.smtpUser &&
      connector.smtpPasswordEncrypted,
  );
}

export function oauthCallbackUrl(origin: string, provider: Exclude<EmailConnectorKind, "smtp">) {
  return new URL(`/api/email-connectors/${provider}/callback`, origin).toString();
}

export function emailConnectorAuthorizationUrl(
  provider: Exclude<EmailConnectorKind, "smtp">,
  origin: string,
  state: string,
): string {
  const { clientId } = oauthCredentials(provider);
  const callback = oauthCallbackUrl(origin, provider);

  if (provider === "gmail") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: "code",
      scope: GMAIL_SCOPE,
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    }).toString();
    return url.toString();
  }

  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenant())}/oauth2/v2.0/authorize`,
  );
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_SCOPE,
    state,
  }).toString();
  return url.toString();
}

type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  fromEmail: string;
};

async function jsonResponse<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${action} failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response.json() as Promise<T>;
}

export async function exchangeEmailConnectorCode(
  provider: Exclude<EmailConnectorKind, "smtp">,
  code: string,
  origin: string,
  fetcher: Fetcher = fetch,
): Promise<OAuthTokens> {
  const { clientId, clientSecret } = oauthCredentials(provider);
  const redirectUri = oauthCallbackUrl(origin, provider);
  const tokenUrl = provider === "gmail"
    ? "https://oauth2.googleapis.com/token"
    : `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenant())}/oauth2/v2.0/token`;
  const scope = provider === "gmail" ? GMAIL_SCOPE : MICROSOFT_SCOPE;
  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    ...(provider === "microsoft" ? { scope } : {}),
  });
  const tokens = await jsonResponse<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }>(
    await fetcher(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    }),
    `${provider} token exchange`,
  );
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(`${provider} did not return both access and refresh tokens`);
  }

  let fromEmail: string | null | undefined;
  if (provider === "gmail") {
    const profile = await jsonResponse<{ email?: string }>(
      await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }),
      "Gmail profile lookup",
    );
    fromEmail = profile.email;
  } else {
    const profile = await jsonResponse<{ mail?: string | null; userPrincipalName?: string }>(
      await fetcher("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }),
      "Microsoft profile lookup",
    );
    fromEmail = profile.mail ?? profile.userPrincipalName;
  }
  if (!fromEmail || !fromEmail.includes("@")) {
    throw new Error(`${provider} account did not return a sender email address`);
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
    fromEmail,
  };
}

async function refreshAccessToken(
  connector: StoredEmailConnector,
  fetcher: Fetcher,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  if (!connector.refreshTokenEncrypted || connector.type === "smtp") {
    throw new Error(`${connector.type} is not connected`);
  }
  const { clientId, clientSecret } = oauthCredentials(connector.type);
  const currentRefreshToken = decryptEmailSecret(connector.refreshTokenEncrypted);
  const tokenUrl = connector.type === "gmail"
    ? "https://oauth2.googleapis.com/token"
    : `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenant())}/oauth2/v2.0/token`;
  const response = await jsonResponse<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  }>(
    await fetcher(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: currentRefreshToken,
        grant_type: "refresh_token",
        ...(connector.type === "microsoft" ? { scope: MICROSOFT_SCOPE } : {}),
      }),
    }),
    `${connector.type} token refresh`,
  );
  if (!response.access_token) {
    throw new Error(`${connector.type} token refresh returned no access token`);
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? currentRefreshToken,
    expiresAt: new Date(Date.now() + (response.expires_in ?? 3600) * 1000),
  };
}

function defaultTransportFactory(options: Parameters<TransportFactory>[0]): MailTransport {
  return nodemailer.createTransport(options);
}

function smtpConfiguration(connector: StoredEmailConnector): SmtpConfiguration {
  if (
    connector.type !== "smtp" ||
    !connector.smtpHost ||
    !connector.smtpPort ||
    connector.smtpSecure === null ||
    !connector.smtpUser ||
    !connector.smtpPasswordEncrypted
  ) {
    throw new Error("SMTP connector is incomplete");
  }
  return {
    host: connector.smtpHost,
    port: connector.smtpPort,
    secure: connector.smtpSecure,
    user: connector.smtpUser,
    password: decryptEmailSecret(connector.smtpPasswordEncrypted),
    fromEmail: connector.fromEmail,
  };
}

function smtpTransport(config: SmtpConfiguration, factory: TransportFactory): MailTransport {
  return factory({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
}

export function validateEmailHeaders(input: EmailInput, from: string): void {
  if (!input.to.includes("@") || /[\r\n]/u.test(input.to) || /[\r\n]/u.test(from)) {
    throw new Error("Email connector received an invalid email address");
  }
  if (/[\r\n]/u.test(input.subject)) {
    throw new Error("Email subject must be a single line");
  }
}

export async function sendSmtpEmail(
  config: SmtpConfiguration,
  input: EmailInput,
  factory: TransportFactory = defaultTransportFactory,
): Promise<void> {
  await smtpTransport(config, factory).sendMail({
    from: config.fromEmail,
    to: input.to,
    subject: input.subject,
    ...(input.contentType === "html" ? { html: input.body } : { text: input.body }),
  });
}

export async function verifySmtpConfiguration(
  config: SmtpConfiguration,
  factory: TransportFactory = defaultTransportFactory,
): Promise<void> {
  await smtpTransport(config, factory).verify();
}

function mimeMessage(input: EmailInput, from: string): string {
  const subject = Buffer.from(input.subject, "utf8").toString("base64");
  const body = Buffer.from(input.body, "utf8").toString("base64").replace(/.{76}/gu, "$&\r\n");
  return [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${subject}?=`,
    "MIME-Version: 1.0",
    `Content-Type: ${input.contentType === "html" ? "text/html" : "text/plain"}; charset=UTF-8`,
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
}

export async function sendEmailWithConnector(
  connector: StoredEmailConnector,
  input: EmailInput,
  dependencies: { fetch?: Fetcher; transportFactory?: TransportFactory } = {},
): Promise<DescribedSend | null> {
  validateEmailHeaders(input, connector.fromEmail);

  const fetcher = dependencies.fetch ?? fetch;
  if (!hasEncryptionKey()) return describeSend(connector, input);

  if (connector.type === "smtp") {
    if (!smtpCredentialsPresent(connector)) return describeSend(connector, input);
    const config = smtpConfiguration(connector);
    await sendSmtpEmail(config, input, dependencies.transportFactory);
    return null;
  }

  if (!hasOAuthCredentials(connector.type) || !connector.refreshTokenEncrypted) {
    return describeSend(connector, input);
  }

  let accessToken = connector.accessTokenEncrypted
    ? decryptEmailSecret(connector.accessTokenEncrypted)
    : null;
  if (
    !accessToken ||
    !connector.accessTokenExpiresAt ||
    connector.accessTokenExpiresAt <= new Date(Date.now() + 60_000)
  ) {
    const refreshed = await refreshAccessToken(connector, fetcher);
    accessToken = refreshed.accessToken;
    await prisma.emailConnector.update({
      where: { orgId: connector.orgId },
      data: {
        accessTokenEncrypted: encryptEmailSecret(refreshed.accessToken),
        refreshTokenEncrypted: encryptEmailSecret(refreshed.refreshToken),
        accessTokenExpiresAt: refreshed.expiresAt,
      },
    });
  }

  if (connector.type === "gmail") {
    const raw = Buffer.from(mimeMessage(input, connector.fromEmail), "utf8").toString("base64url");
    await jsonResponse(
      await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }),
      "Gmail send",
    );
    return null;
  }

  const response = await fetcher("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: input.contentType === "html" ? "HTML" : "Text",
          content: input.body,
        },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Microsoft send failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return null;
}

export async function sendOrganizationEmail(
  orgId: string,
  input: EmailInput,
): Promise<DescribedSend | null> {
  const connector = await prisma.emailConnector.findUnique({ where: { orgId } });
  if (!connector || !connector.verifiedAt) {
    throw new Error("This organization has no verified email connector");
  }
  return sendEmailWithConnector(connector, input);
}

export async function getEmailConnectorStatus(orgId: string) {
  const connector = await prisma.emailConnector.findUnique({
    where: { orgId },
    select: { type: true, fromEmail: true, verifiedAt: true },
  });
  return connector
    ? {
        connected: connector.verifiedAt !== null,
        type: connector.type,
        fromEmail: connector.fromEmail,
      }
    : { connected: false as const, type: null, fromEmail: null };
}
