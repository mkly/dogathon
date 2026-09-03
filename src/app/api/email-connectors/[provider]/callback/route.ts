import {
  encryptEmailSecret,
  exchangeEmailConnectorCode,
  hashOAuthState,
  type EmailConnectorKind,
} from "@/lib/email-connectors";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

type OAuthProvider = Exclude<EmailConnectorKind, "smtp">;

function providerFrom(value: string): OAuthProvider | null {
  return value === "gmail" || value === "microsoft" ? value : null;
}

function adminRedirect(request: Request, orgSlug: string | null, result: "connected" | "error") {
  const path = orgSlug
    ? `/${orgSlug}/admin/settings?emailConnector=${result}`
    : `/staff/organizations?emailConnector=${result}`;
  return Response.redirect(new URL(path, request.url), 303);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const provider = providerFrom((await params).provider);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!provider || !code || !state || url.searchParams.has("error")) {
    return adminRedirect(request, null, "error");
  }

  // The provider redirects the browser here without the organization header the
  // rest of the staff API carries, so the pending state hash — written by the
  // authorize route for exactly one organization — names the organization.
  const connector = await prisma.emailConnector.findFirst({
    where: { oauthProvider: provider, oauthStateHash: hashOAuthState(state) },
    select: {
      orgId: true,
      oauthStateExpiresAt: true,
      organization: { select: { slug: true } },
    },
  });
  if (!connector || !connector.oauthStateExpiresAt || connector.oauthStateExpiresAt <= new Date()) {
    return adminRedirect(request, null, "error");
  }

  const orgSlug = connector.organization.slug;
  const access = await getOrganizationAccessBySlug(request.headers, orgSlug, ["owner", "admin"]);
  if (!access?.context) return adminRedirect(request, orgSlug, "error");

  try {
    const tokens = await exchangeEmailConnectorCode(provider, code, url.origin);
    await prisma.emailConnector.update({
      where: { orgId: connector.orgId },
      data: {
        type: provider,
        fromEmail: tokens.fromEmail,
        accessTokenEncrypted: encryptEmailSecret(tokens.accessToken),
        refreshTokenEncrypted: encryptEmailSecret(tokens.refreshToken),
        accessTokenExpiresAt: tokens.expiresAt,
        smtpHost: null,
        smtpPort: null,
        smtpSecure: null,
        smtpUser: null,
        smtpPasswordEncrypted: null,
        oauthProvider: null,
        oauthStateHash: null,
        oauthStateExpiresAt: null,
        verifiedAt: new Date(),
      },
    });
    return adminRedirect(request, orgSlug, "connected");
  } catch (error) {
    console.error(`${provider} email connector callback failed`, error);
    return adminRedirect(request, orgSlug, "error");
  }
}
