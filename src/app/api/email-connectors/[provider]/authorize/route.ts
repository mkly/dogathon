import {
  createOAuthState,
  emailConnectorAuthorizationUrl,
  type EmailConnectorKind,
} from "@/lib/email-connectors";
import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

type OAuthProvider = Exclude<EmailConnectorKind, "smtp">;

function providerFrom(value: string): OAuthProvider | null {
  return value === "gmail" || value === "microsoft" ? value : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const access = await requireApiOrganization(request.headers, ["owner", "admin"]);
  if (!access.ok) return access.response;

  const provider = providerFrom((await params).provider);
  if (!provider) return Response.json({ error: "Unknown email connector" }, { status: 404 });

  try {
    const oauthState = createOAuthState();
    const url = emailConnectorAuthorizationUrl(provider, new URL(request.url).origin, oauthState.state);
    await prisma.emailConnector.upsert({
      where: { orgId: access.context.orgId },
      update: {
        oauthProvider: provider,
        oauthStateHash: oauthState.hash,
        oauthStateExpiresAt: oauthState.expiresAt,
      },
      create: {
        orgId: access.context.orgId,
        type: provider,
        fromEmail: "",
        oauthProvider: provider,
        oauthStateHash: oauthState.hash,
        oauthStateExpiresAt: oauthState.expiresAt,
      },
    });
    return Response.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email connector setup failed";
    return Response.json({ error: message }, { status: 503 });
  }
}
