import { SponsorUpdateEmail } from "@/emails/sponsor-update-email";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { env } from "@/lib/env";
import { requireApiOrganization } from "@/lib/organization-access";
import {
  deliverSponsorUpdate,
  companionPageUrl,
  isSponsorUpdateRecipient,
  type Delivery,
  type DeliverySponsorship,
  type SponsorUpdateType,
} from "@/lib/sponsor-update-delivery";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS } from "@/lib/rescue-settings";
import { uuidSchema } from "@/lib/uuid";
import { render } from "@react-email/render";
import { createElement } from "react";

type RouteContext = { params: Promise<{ id: string }> };

type ApprovalSponsorship = DeliverySponsorship & {
  monthlyCents: number;
  status: "active" | "ended";
  endedReason: "unavailable" | "canceled" | null;
};

type ApprovalUpdate = {
  id: string;
  orgId: string;
  residentId: string;
  type: SponsorUpdateType;
  subject: string;
  bodyText: string;
  photoUrl: string | null;
  status: "draft" | "approved" | "sent";
  organization: {
    slug: string;
  };
  resident: {
    name: string;
    photoUrls: string[];
    sponsorships: ApprovalSponsorship[];
  };
};

type ApprovalDependencies = {
  claimUpdate: (id: string, orgId: string) => Promise<number>;
  deliver: typeof deliverSponsorUpdate;
  findUpdate: (id: string, orgId: string) => Promise<ApprovalUpdate | null>;
  getConnectorStatus: typeof getEmailConnectorStatus;
  markSent: (id: string, orgId: string, sentAt: Date) => Promise<unknown>;
  now: () => Date;
  renderMessage: (update: ApprovalUpdate, monthlyCents: number) => Promise<{ bodyHtml: string; bodyText: string }>;
  requireOrganization: typeof requireApiOrganization;
  resetDraft: (id: string, orgId: string) => Promise<void>;
};

const approvalDependencies: ApprovalDependencies = {
  async claimUpdate(id, orgId) {
    const claimed = await prisma.sponsorUpdate.updateMany({
      where: { id, orgId, status: "draft" },
      data: { status: "approved" },
    });
    return claimed.count;
  },
  deliver: deliverSponsorUpdate,
  async findUpdate(id, orgId) {
    return prisma.sponsorUpdate.findFirst({
      where: { id, orgId },
      include: {
        organization: {
          select: {
            slug: true,
          },
        },
        resident: {
          include: {
            sponsorships: {
              where: {
                orgId,
                OR: [{ status: "active" }, { endedReason: "unavailable" }],
              },
              include: { sponsor: { select: { email: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });
  },
  getConnectorStatus: getEmailConnectorStatus,
  async markSent(id, orgId, sentAt) {
    return prisma.sponsorUpdate.update({
      where: { id_orgId: { id, orgId } },
      data: { status: "sent", sentAt },
    });
  },
  now: () => new Date(),
  async renderMessage(update, monthlyCents) {
    const origin = env.BETTER_AUTH_URL;
    const email = createElement(SponsorUpdateEmail, {
      companionName: update.resident.name,
      subject: update.subject,
      bodyText: update.bodyText,
      companionUrl: companionPageUrl(origin, update.organization.slug, update.residentId),
      monthlyCents,
      origin,
      photoUrl: update.photoUrl ?? update.resident.photoUrls[0] ?? null,
      type: update.type,
    });
    const [bodyHtml, bodyText] = await Promise.all([
      render(email),
      render(email, { plainText: true }),
    ]);
    return { bodyHtml, bodyText };
  },
  requireOrganization: requireApiOrganization,
  async resetDraft(id, orgId) {
    await prisma.sponsorUpdate.updateMany({
      where: { id, orgId, status: "approved" },
      data: { status: "draft", sentAt: null },
    });
  },
};

function deliveryCounts(deliveries: Delivery[]) {
  return {
    sent: deliveries.filter((delivery) => delivery.status === "sent").length,
    failed: deliveries.filter((delivery) => delivery.status === "failed").length,
  };
}

export function createApproveSponsorUpdateHandler(dependencies: ApprovalDependencies) {
  return async function approveSponsorUpdate(request: Request, { params }: RouteContext) {
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) {
      return Response.json({ error: "Update not found" }, { status: 404 });
    }

    const access = await dependencies.requireOrganization(request.headers, {
      sponsorUpdate: ["manage"],
    });
    if (!access.ok) return access.response;
    const { orgId } = access.context;

    const sponsorUpdate = await dependencies.findUpdate(id, orgId);
    if (!sponsorUpdate) {
      return Response.json({ error: "Update not found" }, { status: 404 });
    }
    if (sponsorUpdate.status !== "draft") {
      return Response.json({ error: "Only draft updates can be approved" }, { status: 409 });
    }

    const emailConnector = await dependencies.getConnectorStatus(orgId);
    if (!emailConnector.connected) {
      return Response.json(
        { error: "Connect the email address updates are sent from before approving them" },
        { status: 409 },
      );
    }

    if (await dependencies.claimUpdate(id, orgId) !== 1) {
      return Response.json({ error: "Update is already being approved" }, { status: 409 });
    }

    try {
      const sponsorships = sponsorUpdate.resident.sponsorships.filter((sponsorship) =>
        isSponsorUpdateRecipient(sponsorUpdate.type, sponsorship));
      const groups = Map.groupBy(sponsorships, ({ monthlyCents }) => monthlyCents);
      const deliveries = (await Promise.all([...groups].map(async ([monthlyCents, recipients]) => {
        const message = await dependencies.renderMessage(
          sponsorUpdate,
          monthlyCents ?? DEFAULT_SPONSORSHIP_MONTHLY_CENTS,
        );
        return dependencies.deliver(orgId, { ...sponsorUpdate, ...message }, recipients);
      }))).flat();
      const counts = deliveryCounts(deliveries);
      console.info("Sponsor update delivery completed", { id, orgId, ...counts });

      if (counts.sent === 0) {
        await dependencies.resetDraft(id, orgId);
        return Response.json(
          { error: "No sponsor updates were delivered", deliveries, counts },
          { status: 502 },
        );
      }

      const sentAt = dependencies.now();
      const sent = await dependencies.markSent(id, orgId, sentAt);
      return Response.json({ sponsorUpdate: sent, deliveries, counts });
    } catch (error) {
      await dependencies.resetDraft(id, orgId);
      console.error("Sponsor update approval failed", { id, orgId, error });
      return Response.json({ error: "Sending the update failed. Please try again." }, { status: 502 });
    }
  };
}

export const POST = createApproveSponsorUpdateHandler(approvalDependencies);
