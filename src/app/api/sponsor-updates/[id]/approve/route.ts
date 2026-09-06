import { SponsorUpdateEmail } from "@/emails/sponsor-update-email";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { requireApiOrganization } from "@/lib/organization-access";
import { deliverSponsorUpdate, companionPageUrl } from "@/lib/sponsor-update-delivery";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";
import { render } from "@react-email/render";
import { createElement } from "react";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json({ error: "Update not found" }, { status: 404 });
  }

  const access = await requireApiOrganization(request.headers, { sponsorUpdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const sponsorUpdate = await prisma.sponsorUpdate.findFirst({
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

  if (!sponsorUpdate) {
    return Response.json({ error: "Update not found" }, { status: 404 });
  }
  if (sponsorUpdate.status !== "draft") {
    return Response.json({ error: "Only draft updates can be approved" }, { status: 409 });
  }

  const emailConnector = await getEmailConnectorStatus(orgId);
  if (!emailConnector.connected) {
    return Response.json(
      { error: "Connect the email address updates are sent from before approving them" },
      { status: 409 },
    );
  }

  const claimed = await prisma.sponsorUpdate.updateMany({
    where: { id, orgId, status: "draft" },
    data: { status: "approved" },
  });
  if (claimed.count !== 1) {
    return Response.json({ error: "Update is already being approved" }, { status: 409 });
  }

  const origin = new URL(request.url).origin;
  const companionUrl = companionPageUrl(origin, sponsorUpdate.organization.slug, sponsorUpdate.residentId);
  const email = createElement(SponsorUpdateEmail, {
    companionName: sponsorUpdate.resident.name,
    subject: sponsorUpdate.subject,
    bodyText: sponsorUpdate.bodyText,
    companionUrl,
    origin,
    photoUrl: sponsorUpdate.photoUrl ?? sponsorUpdate.resident.photoUrls[0] ?? null,
    type: sponsorUpdate.type === "graduation" ? "graduation" : "regular",
  });
  const [bodyHtml, bodyText] = await Promise.all([
    render(email),
    render(email, { plainText: true }),
  ]);
  const deliveries = await deliverSponsorUpdate(
    orgId,
    {
      ...sponsorUpdate,
      bodyHtml,
      bodyText,
    },
    sponsorUpdate.resident.sponsorships,
  );
  const sentAt = new Date();
  const sent = await prisma.sponsorUpdate.update({
    where: { id_orgId: { id, orgId } },
    data: { status: "sent", sentAt },
  });

  return Response.json({ sponsorUpdate: sent, deliveries });
}
