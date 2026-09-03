import {
  createEmailConnectorAuthorization,
  EMAIL_CONNECTOR_OAUTH_COOKIE,
  EMAIL_CONNECTOR_OAUTH_COOKIE_PATH,
  type EmailConnectorKind,
} from "@/lib/email-connectors";
import { requireApiOrganization } from "@/lib/organization-access";
import { env } from "@/lib/env";
import { NextResponse, type NextRequest } from "next/server";

type OAuthProvider = Exclude<EmailConnectorKind, "smtp">;

function providerFrom(value: string): OAuthProvider | null {
  return value === "gmail" || value === "microsoft" ? value : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const access = await requireApiOrganization(request.headers, { settings: ["manage"] });
  if (!access.ok) return access.response;

  const provider = providerFrom((await params).provider);
  if (!provider) return Response.json({ error: "Unknown email connector" }, { status: 404 });

  try {
    const authorization = await createEmailConnectorAuthorization(
      provider,
      new URL(request.url).origin,
      access.context.orgId,
    );
    const response = NextResponse.json({ url: authorization.url });
    response.cookies.set(EMAIL_CONNECTOR_OAUTH_COOKIE, authorization.cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: EMAIL_CONNECTOR_OAUTH_COOKIE_PATH,
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email connector setup failed";
    return Response.json({ error: message }, { status: 503 });
  }
}
