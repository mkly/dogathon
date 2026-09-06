import { z } from "zod";

import { requireApiOrganization } from "@/lib/organization-access";
import { MAX_SMS_LENGTH } from "@/lib/pupdate-sms";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };

const draftInputSchema = z.object({
  subject: z.string(),
  emailBody: z.string(),
  smsBody: z.string(),
});
const trimmedDraftSchema = draftInputSchema.transform(({ subject, emailBody, smsBody }) => ({
  subject: subject.trim(),
  bodyText: emailBody.trim(),
  smsText: smsBody.trim(),
}));

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json({ error: "Update not found" }, { status: 404 });
  }

  const access = await requireApiOrganization(request.headers, { pupdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const validated = trimmedDraftSchema.safeParse(body);
  if (!validated.success) {
    return Response.json({ error: "Subject, email body, and SMS text are required" }, { status: 400 });
  }
  if (!validated.data.subject || !validated.data.bodyText) {
    return Response.json({ error: "Subject and email body cannot be empty" }, { status: 400 });
  }
  if (validated.data.smsText.length > MAX_SMS_LENGTH) {
    return Response.json({ error: `SMS text must be ${MAX_SMS_LENGTH} characters or fewer` }, { status: 400 });
  }

  const updated = await prisma.pupdate.updateMany({
    where: { id, orgId, status: "draft" },
    data: validated.data,
  });

  if (updated.count !== 1) {
    const exists = await prisma.pupdate.findFirst({ where: { id, orgId }, select: { id: true } });
    return Response.json(
      { error: exists ? "Only draft updates can be edited" : "Update not found" },
      { status: exists ? 409 : 404 },
    );
  }

  const pupdate = await prisma.pupdate.findFirst({ where: { id, orgId } });
  return Response.json({ pupdate });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json({ error: "Update not found" }, { status: 404 });
  }

  const access = await requireApiOrganization(request.headers, { pupdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const deleted = await prisma.pupdate.deleteMany({ where: { id, orgId, status: "draft" } });

  if (deleted.count !== 1) {
    const exists = await prisma.pupdate.findFirst({ where: { id, orgId }, select: { id: true } });
    return Response.json(
      { error: exists ? "Only draft updates can be denied" : "Update not found" },
      { status: exists ? 409 : 404 },
    );
  }

  return new Response(null, { status: 204 });
}
