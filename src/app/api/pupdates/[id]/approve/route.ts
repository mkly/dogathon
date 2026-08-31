import { deliverPupdate, dogPageUrl } from "@/lib/pupdate-delivery";
import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { renderPupdateEmail } from "@/lib/pupdate-email";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const access = await requireApiOrganization(request.headers, ["owner", "admin"]);
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const { id } = await params;
  const pupdate = await prisma.pupdate.findFirst({
    where: { id, orgId },
    include: {
      organization: { select: { slug: true } },
      resident: {
        include: {
          sponsorships: { where: { orgId, status: "active" }, orderBy: { createdAt: "asc" } },
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
    where: { id, orgId, status: "draft" },
    data: { status: "approved" },
  });
  if (claimed.count !== 1) {
    return Response.json({ error: "Pupdate is already being approved" }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const dogUrl = dogPageUrl(origin, pupdate.organization.slug, pupdate.residentId);
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
    where: { id_orgId: { id, orgId } },
    data: { status: "sent", sentAt },
  });

  return Response.json({ pupdate: sent, deliveries });
}
