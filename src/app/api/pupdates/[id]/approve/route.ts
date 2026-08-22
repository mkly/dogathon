import { deliverPupdate, dogPageUrl } from "@/lib/pupdate-delivery";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
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

  const deliveries = await deliverPupdate(
    pupdate,
    pupdate.resident.sponsorships,
    dogPageUrl(request.url, pupdate.residentId),
  );
  const sentAt = new Date();
  const sent = await prisma.pupdate.update({
    where: { id },
    data: { status: "sent", sentAt },
  });

  return Response.json({ pupdate: sent, deliveries });
}
