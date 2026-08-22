import { requireApiSession } from "@/lib/auth-session";
import { MAX_SMS_LENGTH } from "@/lib/composer";
import { prisma } from "@/lib/prisma";

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

  if (!subject || !bodyText || !smsText) {
    return { error: "Subject, email body, and SMS text cannot be empty" };
  }
  if (smsText.length > MAX_SMS_LENGTH) {
    return { error: `SMS text must be ${MAX_SMS_LENGTH} characters or fewer` };
  }

  return { data: { subject, bodyText, smsText } };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const unauthorized = await requireApiSession(request.headers);
  if (unauthorized) return unauthorized;

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

  const { id } = await params;
  const updated = await prisma.pupdate.updateMany({
    where: { id, status: "draft" },
    data: validated.data,
  });

  if (updated.count !== 1) {
    const exists = await prisma.pupdate.findUnique({ where: { id }, select: { id: true } });
    return Response.json(
      { error: exists ? "Only draft pupdates can be edited" : "Pupdate not found" },
      { status: exists ? 409 : 404 },
    );
  }

  const pupdate = await prisma.pupdate.findUnique({ where: { id } });
  return Response.json({ pupdate });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const unauthorized = await requireApiSession(request.headers);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const deleted = await prisma.pupdate.deleteMany({ where: { id, status: "draft" } });

  if (deleted.count !== 1) {
    const exists = await prisma.pupdate.findUnique({ where: { id }, select: { id: true } });
    return Response.json(
      { error: exists ? "Only draft pupdates can be denied" : "Pupdate not found" },
      { status: exists ? 409 : 404 },
    );
  }

  return new Response(null, { status: 204 });
}
