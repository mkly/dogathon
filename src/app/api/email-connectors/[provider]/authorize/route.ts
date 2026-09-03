import {
  createOAuthState,
  emailConnectorAuthorizationUrl,
  type EmailConnectorKind,
} from "@/lib/email-connectors";
import { z } from "zod";
import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

const oauthProviderSchema = z.enum(["gmail", "microsoft"] satisfies Array<Exclude<EmailConnectorKind, "smtp">>);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const access = await requireApiOrganization(request.headers, { settings: ["manage"] });
  if (!access.ok) return access.response;

  const provider = oauthProviderSchema.safeParse((await params).provider);
  if (!provider.success) return Response.json({ error: "Unknown email connector" }, { status: 404 });

  try {
    const oauthState = createOAuthState();
    const url = emailConnectorAuthorizationUrl(provider.data, new URL(request.url).origin, oauthState.state);
    await prisma.emailConnector.upsert({
      where: { orgId: access.context.orgId },
      update: {
        oauthProvider: provider.data,
        oauthStateHash: oauthState.hash,
        oauthStateExpiresAt: oauthState.expiresAt,
      },
      create: {
        orgId: access.context.orgId,
        type: provider.data,
        fromEmail: "",
        oauthProvider: provider.data,
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
