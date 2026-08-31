import { encryptEmailSecret, verifySmtpConfiguration } from "@/lib/email-connectors";
import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

type SmtpInput = {
  host?: unknown;
  port?: unknown;
  secure?: unknown;
  user?: unknown;
  password?: unknown;
  fromEmail?: unknown;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const access = await requireApiOrganization(request.headers, ["owner", "admin"]);
  if (!access.ok) return access.response;

  const input = await request.json().catch(() => null) as SmtpInput | null;
  const host = text(input?.host);
  const port = Number(input?.port);
  const secure = input?.secure === true;
  const user = text(input?.user);
  const password = text(input?.password);
  const fromEmail = text(input?.fromEmail).toLowerCase();
  if (
    !host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !password ||
    !fromEmail.includes("@") ||
    /[\r\n]/u.test(fromEmail)
  ) {
    return Response.json({ error: "Enter valid SMTP host, port, credentials, and sender email" }, { status: 400 });
  }

  try {
    const config = { host, port, secure, user, password, fromEmail };
    await verifySmtpConfiguration(config);
    await prisma.emailConnector.upsert({
      where: { orgId: access.context.orgId },
      update: {
        type: "smtp",
        fromEmail,
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        accessTokenExpiresAt: null,
        smtpHost: host,
        smtpPort: port,
        smtpSecure: secure,
        smtpUser: user,
        smtpPasswordEncrypted: encryptEmailSecret(password),
        oauthProvider: null,
        oauthStateHash: null,
        oauthStateExpiresAt: null,
        verifiedAt: new Date(),
      },
      create: {
        orgId: access.context.orgId,
        type: "smtp",
        fromEmail,
        smtpHost: host,
        smtpPort: port,
        smtpSecure: secure,
        smtpUser: user,
        smtpPasswordEncrypted: encryptEmailSecret(password),
        verifiedAt: new Date(),
      },
    });
    return Response.json({ connected: true, type: "smtp", fromEmail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMTP verification failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
