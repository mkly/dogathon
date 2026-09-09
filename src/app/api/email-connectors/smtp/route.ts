import { z } from "zod";

import {
  encryptEmailSecret,
  verifySmtpConfiguration,
} from "@/lib/email-connectors";
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

export function smtpVerificationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/auth|credential|password|login|535/u.test(message))
    return "SMTP authentication failed. Check the username and password.";
  if (/econnrefused|connection refused/u.test(message))
    return "The SMTP server refused the connection.";
  if (/tls|certificate|ssl/u.test(message))
    return "The SMTP server's TLS configuration could not be verified.";
  return "SMTP verification failed. Check the server settings and try again.";
}

export async function POST(request: Request) {
  const access = await requireApiOrganization(request.headers, {
    settings: ["manage"],
  });
  if (!access.ok) return access.response;

  const input = smtpInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return Response.json(
      {
        error:
          "Enter a valid SMTP host, port, credentials, and address sponsors will see",
      },
      { status: 400 },
    );
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
        smtpPasswordEncrypted: await encryptEmailSecret(password),
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
        smtpPasswordEncrypted: await encryptEmailSecret(password),
        verifiedAt: new Date(),
      },
    });
    return Response.json({ connected: true, type: "smtp", fromEmail });
  } catch (error) {
    console.error("SMTP verification failed", error);
    return Response.json(
      { error: smtpVerificationErrorMessage(error) },
      { status: 502 },
    );
  }
}
