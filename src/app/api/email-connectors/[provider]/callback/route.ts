import {
  encryptEmailSecret,
  exchangeEmailConnectorCode,
  hashOAuthState,
  type EmailConnectorKind,
} from "@/lib/email-connectors";
import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

type OAuthProvider = Exclude<EmailConnectorKind, "smtp">;

function providerFrom(value: string): OAuthProvider | null {
  return value === "gmail" || value === "microsoft" ? value : null;
}

function adminRedirect(request: Request, result: "connected" | "error") {
  return Response.redirect(new URL(`/admin?emailConnector=${result}`, request.url), 303);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const access = await requireApiOrganization(request.headers, ["owner", "admin"]);
  if (!access.ok) return access.response;

  const provider = providerFrom((await params).provider);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!provider || !code || !state || url.searchParams.has("error")) {
    return adminRedirect(request, "error");
  }

  const connector = await prisma.emailConnector.findUnique({
    where: { orgId: access.context.orgId },
  });
  if (
    !connector ||
    connector.oauthProvider !== provider ||
    !connector.oauthStateHash ||
    !connector.oauthStateExpiresAt ||
    connector.oauthStateExpiresAt <= new Date() ||
    connector.oauthStateHash !== hashOAuthState(state)
  ) {
    return adminRedirect(request, "error");
  }

  try {
    const tokens = await exchangeEmailConnectorCode(provider, code, url.origin);
    await prisma.emailConnector.update({
      where: { orgId: access.context.orgId },
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
    return adminRedirect(request, "connected");
  } catch (error) {
    console.error(`${provider} email connector callback failed`, error);
    return adminRedirect(request, "error");
  }
}
