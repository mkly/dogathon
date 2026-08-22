import { deliverPupdate, dogPageUrl } from "@/lib/pupdate-delivery";
import { requireApiSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { renderPupdateEmail } from "@/lib/pupdate-email";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const unauthorized = await requireApiSession(request.headers);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const pupdate = await prisma.pupdate.findUnique({
    where: { id },
    include: {
      resident: {
        include: {
          sponsorships: { where: { status: "active" }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!pupdate) {
    return Response.json({ error: "Pupdate not found" }, { status: 404 });
  }
  if (pupdate.status !== "draft") {
    return Response.json({ error: "Only draft pupdates can be approved" }, { status: 409 });
  }

  const claimed = await prisma.pupdate.updateMany({
    where: { id, status: "draft" },
    data: { status: "approved" },
  });
  if (claimed.count !== 1) {
    return Response.json({ error: "Pupdate is already being approved" }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const dogUrl = dogPageUrl(origin, pupdate.residentId);
  const deliveries = await deliverPupdate(
    {
      ...pupdate,
      bodyHtml: renderPupdateEmail({
        dogName: pupdate.resident.name,
        subject: pupdate.subject,
        bodyText: pupdate.bodyText,
        dogUrl,
        origin,
        photoUrl: pupdate.photoUrl ?? pupdate.resident.photoUrls[0] ?? null,
        type: pupdate.type === "graduation" ? "graduation" : "regular",
      }),
    },
    pupdate.resident.sponsorships,
    dogUrl,
  );
  const sentAt = new Date();
  const sent = await prisma.pupdate.update({
    where: { id },
    data: { status: "sent", sentAt },
  });

  return Response.json({ pupdate: sent, deliveries });
}
