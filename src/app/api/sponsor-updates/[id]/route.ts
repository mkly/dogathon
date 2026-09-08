import { z } from "zod";

import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { SPONSOR_UPDATE_BODY_MAX_LENGTH, sponsorUpdateBodyOverLimitMessage } from "@/lib/sponsor-update-body";
import { uuidSchema } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };

const draftInputSchema = z.object({
  subject: z.string(),
  emailBody: z.string(),
});
const trimmedDraftSchema = draftInputSchema.transform(({ subject, emailBody }) => ({
  subject: subject.trim(),
  bodyText: emailBody.trim(),
}));

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json({ error: "Update not found" }, { status: 404 });
  }

  const access = await requireApiOrganization(request.headers, { sponsorUpdate: ["manage"] });
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
    return Response.json({ error: "Subject and email body are required" }, { status: 400 });
  }
  if (!validated.data.subject || !validated.data.bodyText) {
    return Response.json({ error: "Subject and email body cannot be empty" }, { status: 400 });
  }
  if (validated.data.bodyText.length > SPONSOR_UPDATE_BODY_MAX_LENGTH) {
    return Response.json({ error: sponsorUpdateBodyOverLimitMessage() }, { status: 400 });
  }
  const updated = await prisma.sponsorUpdate.updateMany({
    where: { id, orgId, status: "draft" },
    data: validated.data,
  });

  if (updated.count !== 1) {
    const exists = await prisma.sponsorUpdate.findFirst({ where: { id, orgId }, select: { id: true } });
    return Response.json(
      { error: exists ? "Only draft updates can be edited" : "Update not found" },
      { status: exists ? 409 : 404 },
    );
  }

  const sponsorUpdate = await prisma.sponsorUpdate.findFirst({ where: { id, orgId } });
  return Response.json({ sponsorUpdate });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json({ error: "Update not found" }, { status: 404 });
  }

  const access = await requireApiOrganization(request.headers, { sponsorUpdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const dismissed = await prisma.sponsorUpdate.updateMany({
    where: { id, orgId, status: "draft", type: "graduation" },
    data: { status: "dismissed" },
  });
  const deleted = dismissed.count === 0
    ? await prisma.sponsorUpdate.deleteMany({
      where: { id, orgId, status: "draft", type: "regular" },
    })
    : dismissed;

  if (deleted.count !== 1) {
    const exists = await prisma.sponsorUpdate.findFirst({ where: { id, orgId }, select: { id: true } });
    return Response.json(
      { error: exists ? "Only draft updates can be denied" : "Update not found" },
      { status: exists ? 409 : 404 },
    );
  }

  return new Response(null, { status: 204 });
}
