import {
  encryptEmailSecret,
  exchangeEmailConnectorCode,
  hashOAuthState,
  type EmailConnectorKind,
} from "@/lib/email-connectors";
import { z } from "zod";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

const oauthProviderSchema = z.enum(["gmail", "microsoft"] satisfies Array<Exclude<EmailConnectorKind, "smtp">>);
const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
});

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
  const provider = oauthProviderSchema.safeParse((await params).provider);
  const url = new URL(request.url);
  const query = oauthCallbackSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!provider.success || !query.success || query.data.error !== undefined) {
    return adminRedirect(request, null, "error");
  }
  const { code, state } = query.data;

  // The provider redirects the browser here without the organization header the
  // rest of the staff API carries, so the pending state hash — written by the
  // authorize route for exactly one organization — names the organization.
  const connector = await prisma.emailConnector.findFirst({
    where: { oauthProvider: provider.data, oauthStateHash: hashOAuthState(state) },
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
  const access = await getOrganizationAccessBySlug(request.headers, orgSlug, {
    settings: ["manage"],
  });
  if (!access?.context) return adminRedirect(request, orgSlug, "error");

  try {
    const tokens = await exchangeEmailConnectorCode(provider.data, code, url.origin);
    await prisma.emailConnector.update({
      where: { orgId: connector.orgId },
      data: {
        type: provider.data,
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
    console.error(`${provider.data} email connector callback failed`, error);
    return adminRedirect(request, orgSlug, "error");
  }
}
