import { requireApiOrganization } from "@/lib/organization-access";
import { MAX_SMS_LENGTH } from "@/lib/pupdate-sms";
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };

type DraftInput = {
  subject?: unknown;
  emailBody?: unknown;
  smsBody?: unknown;
};

function validateDraft(input: DraftInput) {
  if (
    typeof input.subject !== "string" ||
    typeof input.emailBody !== "string" ||
    typeof input.smsBody !== "string"
  ) {
    return { error: "Subject, email body, and SMS text are required" };
  }

  const subject = input.subject.trim();
  const bodyText = input.emailBody.trim();
  const smsText = input.smsBody.trim();

  // Composition no longer writes SMS text, so an empty legacy value is valid
  // until the delivery task drops the column.
  if (!subject || !bodyText) {
    return { error: "Subject and email body cannot be empty" };
  }
  if (smsText.length > MAX_SMS_LENGTH) {
    return { error: `SMS text must be ${MAX_SMS_LENGTH} characters or fewer` };
  }

  return { data: { subject, bodyText, smsText } };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Pupdate not found" }, { status: 404 });
  }

  const access = await requireApiOrganization(request.headers, { pupdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  let input: DraftInput;
  try {
    input = (await request.json()) as DraftInput;
  } catch {
    return Response.json({ error: "A JSON request body is required" }, { status: 400 });
  }

  const validated = validateDraft(input);
  if (!validated.data) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  const updated = await prisma.pupdate.updateMany({
    where: { id, orgId, status: "draft" },
    data: validated.data,
  });

  if (updated.count !== 1) {
    const exists = await prisma.pupdate.findFirst({ where: { id, orgId }, select: { id: true } });
    return Response.json(
      { error: exists ? "Only draft pupdates can be edited" : "Pupdate not found" },
      { status: exists ? 409 : 404 },
    );
  }

  const pupdate = await prisma.pupdate.findFirst({ where: { id, orgId } });
  return Response.json({ pupdate });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Pupdate not found" }, { status: 404 });
  }

  const access = await requireApiOrganization(request.headers, { pupdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const deleted = await prisma.pupdate.deleteMany({ where: { id, orgId, status: "draft" } });

  if (deleted.count !== 1) {
    const exists = await prisma.pupdate.findFirst({ where: { id, orgId }, select: { id: true } });
    return Response.json(
      { error: exists ? "Only draft pupdates can be denied" : "Pupdate not found" },
      { status: exists ? 409 : 404 },
    );
  }

  return new Response(null, { status: 204 });
}
