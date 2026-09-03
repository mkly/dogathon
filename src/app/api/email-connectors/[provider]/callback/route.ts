import {
  decryptEmailConnectorOAuthSession,
  EMAIL_CONNECTOR_OAUTH_COOKIE,
  EMAIL_CONNECTOR_OAUTH_COOKIE_PATH,
  encryptEmailSecret,
  exchangeEmailConnectorCode,
  type EmailConnectorKind,
} from "@/lib/email-connectors";
import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const oauthProviderSchema = z.enum(["gmail", "microsoft"] satisfies Array<Exclude<EmailConnectorKind, "smtp">>);
const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
});

function adminRedirect(request: NextRequest, orgSlug: string | null, result: "connected" | "error") {
  const path = orgSlug
    ? `/${orgSlug}/admin/settings?emailConnector=${result}`
    : `/staff/organizations?emailConnector=${result}`;
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  // The authorize route scopes the cookie to the connector API path, so the
  // expiry has to name that same path or the browser keeps the original.
  response.cookies.delete({
    name: EMAIL_CONNECTOR_OAUTH_COOKIE,
    path: EMAIL_CONNECTOR_OAUTH_COOKIE_PATH,
  });
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = oauthProviderSchema.safeParse((await params).provider);
  const url = new URL(request.url);
  const query = oauthCallbackSchema.safeParse(Object.fromEntries(url.searchParams));
  const cookie = request.cookies.get(EMAIL_CONNECTOR_OAUTH_COOKIE)?.value;
  if (!provider.success || !cookie || !query.success || query.data.error !== undefined) {
    return adminRedirect(request, null, "error");
  }

  let session;
  try {
    session = await decryptEmailConnectorOAuthSession(cookie);
  } catch {
    return adminRedirect(request, null, "error");
  }
  if (session.provider !== provider.data) return adminRedirect(request, null, "error");

  const organization = await prisma.organization.findUnique({
    where: { id: session.orgId },
    select: { slug: true },
  });
  if (!organization) return adminRedirect(request, null, "error");

  // OAuth redirects do not retain the staff UI's organization header. Restore
  // it from the encrypted session, then let the standard API gate re-check the
  // signed-in user's membership and permission.
  const accessHeaders = new Headers(request.headers);
  accessHeaders.set("x-organization-slug", organization.slug);
  const access = await requireApiOrganization(accessHeaders, { settings: ["manage"] });
  if (!access.ok || access.context.orgId !== session.orgId) {
    return adminRedirect(request, organization.slug, "error");
  }

  try {
    const tokens = await exchangeEmailConnectorCode(provider.data, url, url.origin, session);
    const accessTokenEncrypted = await encryptEmailSecret(tokens.accessToken);
    const refreshTokenEncrypted = await encryptEmailSecret(tokens.refreshToken);
    await prisma.emailConnector.upsert({
      where: { orgId: session.orgId },
      update: {
        type: provider.data,
        fromEmail: tokens.fromEmail,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        accessTokenExpiresAt: tokens.expiresAt,
        smtpHost: null,
        smtpPort: null,
        smtpSecure: null,
        smtpUser: null,
        smtpPasswordEncrypted: null,
        verifiedAt: new Date(),
      },
      create: {
        orgId: session.orgId,
        type: provider.data,
        fromEmail: tokens.fromEmail,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        accessTokenExpiresAt: tokens.expiresAt,
        verifiedAt: new Date(),
      },
    });
    return adminRedirect(request, organization.slug, "connected");
  } catch (error) {
    console.error(`${provider.data} email connector callback failed`, error);
    return adminRedirect(request, organization.slug, "error");
  }
}
