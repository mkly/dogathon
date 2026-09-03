import { z } from "zod";

import { encryptEmailSecret, verifySmtpConfiguration } from "@/lib/email-connectors";
import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

const smtpInputSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65_535),
  secure: z.boolean(),
  user: z.string().trim().min(1),
  password: z.string().trim().min(1),
  fromEmail: z.string().trim().toLowerCase().email(),
});

export async function POST(request: Request) {
  const access = await requireApiOrganization(request.headers, { settings: ["manage"] });
  if (!access.ok) return access.response;

  const input = smtpInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json({ error: "Enter valid SMTP host, port, credentials, and sender email" }, { status: 400 });
  }
  const { host, port, secure, user, password, fromEmail } = input.data;

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
