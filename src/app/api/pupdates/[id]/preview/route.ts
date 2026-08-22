import { requireApiSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { renderPupdateEmail } from "@/lib/pupdate-email";
import { dogPageUrl } from "@/lib/pupdate-delivery";

type RouteContext = { params: Promise<{ id: string }> };

/** Renders the sponsor email exactly as it will be sent, for staff to eyeball. */
export async function GET(request: Request, { params }: RouteContext) {
  const unauthorized = await requireApiSession(request.headers);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const pupdate = await prisma.pupdate.findUnique({
    where: { id },
    include: { resident: { select: { name: true, photoUrls: true } } },
  });

  if (!pupdate) {
    return Response.json({ error: "Pupdate not found" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const html = renderPupdateEmail({
    dogName: pupdate.resident.name,
    subject: pupdate.subject,
    bodyText: pupdate.bodyText,
    dogUrl: dogPageUrl(origin, pupdate.residentId),
    origin,
    photoUrl: pupdate.photoUrl ?? pupdate.resident.photoUrls[0] ?? null,
    type: pupdate.type === "graduation" ? "graduation" : "regular",
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
