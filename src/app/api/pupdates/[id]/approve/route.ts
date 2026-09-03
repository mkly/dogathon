import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { requireApiOrganization } from "@/lib/organization-access";
import { deliverPupdate, companionPageUrl } from "@/lib/pupdate-delivery";
import { prisma } from "@/lib/prisma";
import { renderPupdateEmail } from "@/lib/pupdate-email";
import { isUuid } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Pupdate not found" }, { status: 404 });
  }

  const access = await requireApiOrganization(request.headers, ["owner", "admin"]);
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const pupdate = await prisma.pupdate.findFirst({
    where: { id, orgId },
    include: {
      organization: { select: { slug: true } },
      resident: {
        include: {
          sponsorships: {
            where: { orgId, status: "active" },
            include: { sponsor: { select: { email: true, phone: true, channel: true } } },
            orderBy: { createdAt: "asc" },
          },
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

  const emailConnector = await getEmailConnectorStatus(orgId);
  if (!emailConnector.connected) {
    return Response.json(
      { error: "Connect and verify an organization email account before approving pupdates" },
      { status: 409 },
    );
  }

  const claimed = await prisma.pupdate.updateMany({
    where: { id, orgId, status: "draft" },
    data: { status: "approved" },
  });
  if (claimed.count !== 1) {
    return Response.json({ error: "Pupdate is already being approved" }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const companionUrl = companionPageUrl(origin, pupdate.organization.slug, pupdate.residentId);
  const deliveries = await deliverPupdate(
    orgId,
    {
      ...pupdate,
      bodyHtml: renderPupdateEmail({
        companionName: pupdate.resident.name,
        subject: pupdate.subject,
        bodyText: pupdate.bodyText,
        companionUrl,
        origin,
        photoUrl: pupdate.photoUrl ?? pupdate.resident.photoUrls[0] ?? null,
        type: pupdate.type === "graduation" ? "graduation" : "regular",
      }),
    },
    pupdate.resident.sponsorships,
  );
  const sentAt = new Date();
  const sent = await prisma.pupdate.update({
    where: { id_orgId: { id, orgId } },
    data: { status: "sent", sentAt },
  });

  return Response.json({ pupdate: sent, deliveries });
}
