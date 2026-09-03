import { CompactEncrypt, compactDecrypt } from "jose";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import * as oauth from "oauth4webapi";

import { sendAppEmail } from "./app-mailer.ts";
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
function protectedResourceFetcher(fetcher: Fetcher) {
  return (
    url: string,
    options: oauth.CustomFetchOptions<string, oauth.ProtectedResourceRequestBody>,
  ) => fetcher(url, options as unknown as RequestInit);
}

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
export const EMAIL_CONNECTOR_OAUTH_COOKIE = "dogathon-email-connector-oauth";
export const EMAIL_CONNECTOR_OAUTH_COOKIE_PATH = "/api/email-connectors/";
const OAUTH_COOKIE_LIFETIME_SECONDS = 10 * 60;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encryptionKey(): Uint8Array {
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

export async function encryptEmailSecret(value: string): Promise<string> {
  return new CompactEncrypt(textEncoder.encode(value))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(encryptionKey());
}

export async function decryptEmailSecret(value: string): Promise<string> {
  // Resolve the key outside the catch so a misconfigured
  // EMAIL_CONNECTOR_ENCRYPTION_KEY still reports itself instead of being
  // reported as an unreadable stored credential.
  const key = encryptionKey();
  try {
    const { plaintext, protectedHeader } = await compactDecrypt(value, key);
    if (protectedHeader.alg !== "dir" || protectedHeader.enc !== "A256GCM") {
      throw new Error("Unexpected JWE algorithms");
    }
    return textDecoder.decode(plaintext);
  } catch {
    throw new Error("Stored email credential is invalid");
  }
}

type OAuthSession = {
  provider: Exclude<EmailConnectorKind, "smtp">;
  state: string;
  codeVerifier: string;
  orgId: string;
  expiresAt: number;
};

function isOAuthSession(value: unknown): value is OAuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<OAuthSession>;
  return (session.provider === "gmail" || session.provider === "microsoft")
    && typeof session.state === "string"
    && typeof session.codeVerifier === "string"
    && typeof session.orgId === "string"
    && typeof session.expiresAt === "number";
}

export async function decryptEmailConnectorOAuthSession(value: string): Promise<OAuthSession> {
  const decoded = JSON.parse(await decryptEmailSecret(value)) as unknown;
  if (!isOAuthSession(decoded) || decoded.expiresAt <= Date.now()) {
    throw new Error("Email connector OAuth session is invalid or expired");
  }
  return decoded;
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

/**
 * Multi-tenant Microsoft ("common" / "organizations") signs ID tokens with the
 * resolved tenant's issuer, which can never equal the literal tenant segment in
 * the hand-built authorization server metadata, so oauth4webapi rejects every
 * token response that carries one. Nothing here reads OIDC claims — the sender
 * address comes from Graph — so drop the ID token before it is validated.
 */
function withoutIdToken(fetcher: Fetcher): Fetcher {
  return async (input, init) => {
    const response = await fetcher(input, init);
    if (!response.ok) return response;
    const body = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || body.id_token === undefined) return response;
    delete body.id_token;
    return Response.json(body, { status: response.status });
  };
}

function oauthConfiguration(provider: Exclude<EmailConnectorKind, "smtp">) {
  const { clientId, clientSecret } = oauthCredentials(provider);
  const tenant = microsoftTenant();
  const authorizationServer: oauth.AuthorizationServer = provider === "gmail"
    ? {
        issuer: "https://accounts.google.com",
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://oauth2.googleapis.com/token",
        userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
      }
    : {
        // Microsoft common/organizations tenants do not have a stable issuer
        // suitable for discovery, so keep the provider metadata explicit.
        issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
        authorization_endpoint:
          `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
        token_endpoint:
          `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      };
  return {
    authorizationServer,
    client: { client_id: clientId } satisfies oauth.Client,
    clientAuthentication: oauth.ClientSecretPost(clientSecret),
    scope: provider === "gmail" ? GMAIL_SCOPE : MICROSOFT_SCOPE,
  };
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

export async function createEmailConnectorAuthorization(
  provider: Exclude<EmailConnectorKind, "smtp">,
  origin: string,
  orgId: string,
): Promise<{ url: string; cookie: string }> {
  const { authorizationServer, client, scope } = oauthConfiguration(provider);
  const callback = oauthCallbackUrl(origin, provider);
  const state = oauth.generateRandomState();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier);
  const url = new URL(authorizationServer.authorization_endpoint!);
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: callback,
    response_type: "code",
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...(provider === "gmail"
      ? { access_type: "offline", include_granted_scopes: "true", prompt: "consent" }
      : { response_mode: "query" }),
  }).toString();
  const cookie = await encryptEmailSecret(JSON.stringify({
    provider,
    state,
    codeVerifier,
    orgId,
    expiresAt: Date.now() + OAUTH_COOKIE_LIFETIME_SECONDS * 1000,
  } satisfies OAuthSession));
  return { url: url.toString(), cookie };
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
  callbackUrl: URL,
  origin: string,
  session: OAuthSession,
  fetcher: Fetcher = fetch,
): Promise<OAuthTokens> {
  const { authorizationServer, client, clientAuthentication } = oauthConfiguration(provider);
  const redirectUri = oauthCallbackUrl(origin, provider);
  const callbackParameters = oauth.validateAuthResponse(
    authorizationServer,
    client,
    callbackUrl,
    session.state,
  );
  const tokenResponse = await oauth.authorizationCodeGrantRequest(
    authorizationServer,
    client,
    clientAuthentication,
    callbackParameters,
    redirectUri,
    session.codeVerifier,
    { [oauth.customFetch]: provider === "microsoft" ? withoutIdToken(fetcher) : fetcher },
  );
  const tokens = await oauth.processAuthorizationCodeResponse(
    authorizationServer,
    client,
    tokenResponse,
  );
  if (!tokens.refresh_token) {
    throw new Error(`${provider} did not return both access and refresh tokens`);
  }

  let fromEmail: string | null | undefined;
  if (provider === "gmail") {
    const profile = await jsonResponse<{ email?: string }>(
      await oauth.protectedResourceRequest(
        tokens.access_token,
        "GET",
        new URL(authorizationServer.userinfo_endpoint!),
        undefined,
        undefined,
        { [oauth.customFetch]: protectedResourceFetcher(fetcher) },
      ),
      "Gmail profile lookup",
    );
    fromEmail = profile.email;
  } else {
    const profile = await jsonResponse<{ mail?: string | null; userPrincipalName?: string }>(
      await oauth.protectedResourceRequest(
        tokens.access_token,
        "GET",
        new URL("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName"),
        undefined,
        undefined,
        { [oauth.customFetch]: protectedResourceFetcher(fetcher) },
      ),
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
  const { authorizationServer, client, clientAuthentication, scope } =
    oauthConfiguration(connector.type);
  const currentRefreshToken = await decryptEmailSecret(connector.refreshTokenEncrypted);
  const tokenResponse = await oauth.refreshTokenGrantRequest(
    authorizationServer,
    client,
    clientAuthentication,
    currentRefreshToken,
    {
      ...(connector.type === "microsoft" ? { additionalParameters: { scope } } : {}),
      [oauth.customFetch]: connector.type === "microsoft" ? withoutIdToken(fetcher) : fetcher,
    },
  );
  const response = await oauth.processRefreshTokenResponse(
    authorizationServer,
    client,
    tokenResponse,
  );
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? currentRefreshToken,
    expiresAt: new Date(Date.now() + (response.expires_in ?? 3600) * 1000),
  };
}

function defaultTransportFactory(options: Parameters<TransportFactory>[0]): MailTransport {
  return nodemailer.createTransport(options);
}

async function smtpConfiguration(connector: StoredEmailConnector): Promise<SmtpConfiguration> {
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
    password: await decryptEmailSecret(connector.smtpPasswordEncrypted),
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
    const config = await smtpConfiguration(connector);
    await sendSmtpEmail(config, input, dependencies.transportFactory);
    return null;
  }

  if (!hasOAuthCredentials(connector.type) || !connector.refreshTokenEncrypted) {
    return describeSend(connector, input);
  }

  let accessToken = connector.accessTokenEncrypted
    ? await decryptEmailSecret(connector.accessTokenEncrypted)
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
        accessTokenEncrypted: await encryptEmailSecret(refreshed.accessToken),
        refreshTokenEncrypted: await encryptEmailSecret(refreshed.refreshToken),
        accessTokenExpiresAt: refreshed.expiresAt,
      },
    });
  }

  if (connector.type === "gmail") {
    const message = await new MailComposer({
      from: connector.fromEmail,
      to: input.to,
      subject: input.subject,
      ...(input.contentType === "html" ? { html: input.body } : { text: input.body }),
    }).compile().build();
    const raw = message.toString("base64url");
    await jsonResponse(
      await oauth.protectedResourceRequest(
        accessToken,
        "POST",
        new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages/send"),
        new Headers({ "Content-Type": "application/json" }),
        JSON.stringify({ raw }),
        { [oauth.customFetch]: protectedResourceFetcher(fetcher) },
      ),
      "Gmail send",
    );
    return null;
  }

  const response = await oauth.protectedResourceRequest(
    accessToken,
    "POST",
    new URL("https://graph.microsoft.com/v1.0/me/sendMail"),
    new Headers({ "Content-Type": "application/json" }),
    JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: input.contentType === "html" ? "HTML" : "Text",
          content: input.body,
        },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
    }),
    { [oauth.customFetch]: protectedResourceFetcher(fetcher) },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Microsoft send failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return null;
}

export async function sendOrganizationEmail(
  orgId: string,
  input: EmailInput,
  dependencies: {
    findConnector?: (orgId: string) => Promise<StoredEmailConnector | null>;
    sendAppEmail?: (input: EmailInput) => Promise<DescribedSend | null>;
    sendEmailWithConnector?: (
      connector: StoredEmailConnector,
      input: EmailInput,
    ) => Promise<DescribedSend | null>;
  } = {},
): Promise<DescribedSend | null> {
  const findConnector = dependencies.findConnector
    ?? ((organizationId: string) => prisma.emailConnector.findUnique({
      where: { orgId: organizationId },
    }));
  const connector = await findConnector(orgId);
  if (!connector || !connector.verifiedAt) {
    return (dependencies.sendAppEmail ?? sendAppEmail)(input);
  }
  return (dependencies.sendEmailWithConnector ?? sendEmailWithConnector)(connector, input);
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
