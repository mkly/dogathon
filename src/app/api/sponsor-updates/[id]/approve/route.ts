import { SponsorUpdateEmail } from "@/emails/sponsor-update-email";
import { getEmailConnectorStatus } from "@/lib/email-connectors";
import { env } from "@/lib/env";
import { requireApiOrganization } from "@/lib/organization-access";
import {
  deliverSponsorUpdate,
  companionPageUrl,
  isRegularSponsorUpdateRecipient,
  type Delivery,
  type DeliverySponsorship,
  type SponsorUpdateType,
} from "@/lib/sponsor-update-delivery";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS } from "@/lib/rescue-settings";
import { sponsorshipSelectionUrl } from "@/lib/sponsorship-selection-token";
import { pauseStripeCollection } from "@/lib/stripe-billing";
import { uuidSchema } from "@/lib/uuid";
import { render } from "@react-email/render";
import { createElement } from "react";

type RouteContext = { params: Promise<{ id: string }> };

type ApprovalSponsorship = DeliverySponsorship & {
  monthlyCents: number;
  residentId: string;
  status: "active" | "awaiting" | "ended";
  stripeSubscriptionId: string | null;
};

type ApprovalUpdate = {
  id: string;
  orgId: string;
  residentId: string;
  type: SponsorUpdateType;
  subject: string;
  bodyText: string;
  photoUrl: string | null;
  status: "draft" | "approved" | "sent" | "dismissed";
  sponsorshipId: string | null;
  awaitingTransitionedAt: Date | null;
  isAwaitingReminder: boolean;
  organization: {
    slug: string;
    stripeAccountId: string | null;
  };
  resident: {
    name: string;
    available: boolean;
    photoUrls: string[];
    sponsorships: ApprovalSponsorship[];
  };
  sponsorship: ApprovalSponsorship | null;
};

type ApprovalDependencies = {
  claimUpdate: (update: ApprovalUpdate, claimedAt: Date) => Promise<boolean>;
  deliver: typeof deliverSponsorUpdate;
  findUpdate: (id: string, orgId: string) => Promise<ApprovalUpdate | null>;
  getConnectorStatus: typeof getEmailConnectorStatus;
  markSent: (id: string, orgId: string, sentAt: Date) => Promise<unknown>;
  now: () => Date;
  pauseCollection: typeof pauseStripeCollection;
  renderMessage: (
    update: ApprovalUpdate,
    monthlyCents: number,
    renderedAt: Date,
  ) => Promise<{ bodyHtml: string; bodyText: string }>;
  requireOrganization: typeof requireApiOrganization;
  resetDraft: (id: string, orgId: string) => Promise<void>;
};

function sponsorshipTokenSecret() {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required for sponsor selection links");
  }
  return env.BETTER_AUTH_SECRET;
}

const approvalDependencies: ApprovalDependencies = {
  async claimUpdate(update, claimedAt) {
    if (update.type !== "graduation") {
      const claimed = await prisma.sponsorUpdate.updateMany({
        where: { id: update.id, orgId: update.orgId, status: "draft" },
        data: { status: "approved" },
      });
      return claimed.count === 1;
    }
    if (!update.sponsorshipId) return false;

    return prisma.$transaction(async (tx) => {
      const sponsorship = await tx.sponsorship.updateMany({
        where: {
          id: update.sponsorshipId!,
          orgId: update.orgId,
          residentId: update.residentId,
          status: update.isAwaitingReminder || update.awaitingTransitionedAt
            ? "awaiting"
            : "active",
        },
        data: update.isAwaitingReminder || update.awaitingTransitionedAt
          ? { status: "awaiting" }
          : {
            status: "awaiting",
            awaitingSince: claimedAt,
            awaitingReminderDraftedAt: null,
          },
      });
      if (sponsorship.count !== 1) return false;

      const claimed = await tx.sponsorUpdate.updateMany({
        where: {
          id: update.id,
          orgId: update.orgId,
          status: "draft",
          sponsorshipId: update.sponsorshipId,
          isAwaitingReminder: update.isAwaitingReminder,
          awaitingTransitionedAt: update.awaitingTransitionedAt ? { not: null } : null,
        },
        data: {
          status: "approved",
          ...(!update.isAwaitingReminder && !update.awaitingTransitionedAt
            ? { awaitingTransitionedAt: claimedAt }
            : {}),
        },
      });
      if (claimed.count !== 1) throw new Error("Sponsor update approval claim was lost");
      return true;
    }).catch((error) => {
      if (error instanceof Error && error.message === "Sponsor update approval claim was lost") return false;
      throw error;
    });
  },
  deliver: deliverSponsorUpdate,
  async findUpdate(id, orgId) {
    return prisma.sponsorUpdate.findFirst({
      where: { id, orgId },
      include: {
        organization: {
          select: {
            slug: true,
            stripeAccountId: true,
          },
        },
        sponsorship: {
          include: { sponsor: { select: { email: true } } },
        },
        resident: {
          include: {
            sponsorships: {
              where: {
                orgId,
                status: "active",
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
  pauseCollection: pauseStripeCollection,
  async renderMessage(update, monthlyCents, renderedAt) {
    const origin = env.BETTER_AUTH_URL;
    const actionUrl = update.type === "graduation"
      ? sponsorshipSelectionUrl(
        origin,
        update.organization.slug,
        update.sponsorshipId!,
        sponsorshipTokenSecret(),
        renderedAt,
      )
      : companionPageUrl(origin, update.organization.slug, update.residentId);
    const email = createElement(SponsorUpdateEmail, {
      companionName: update.resident.name,
      subject: update.subject,
      bodyText: update.bodyText,
      actionUrl,
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
    if (
      sponsorUpdate.type === "graduation"
      && (!sponsorUpdate.sponsorshipId
        || !sponsorUpdate.sponsorship
        || sponsorUpdate.sponsorship.residentId !== sponsorUpdate.residentId
        || (sponsorUpdate.isAwaitingReminder
          ? sponsorUpdate.sponsorship.status !== "awaiting"
          : (
            sponsorUpdate.sponsorship.status !== "active"
            && !(sponsorUpdate.sponsorship.status === "awaiting" && sponsorUpdate.awaitingTransitionedAt)
          )))
    ) {
      return Response.json(
        { error: "This sponsorship is no longer active" },
        { status: 409 },
      );
    }

    const emailConnector = await dependencies.getConnectorStatus(orgId);
    if (!emailConnector.connected) {
      return Response.json(
        { error: "Connect the email address updates are sent from before approving them" },
        { status: 409 },
      );
    }

    const approvedAt = dependencies.now();
    if (!(await dependencies.claimUpdate(sponsorUpdate, approvedAt))) {
      return Response.json({ error: "Update or sponsorship is no longer available for approval" }, { status: 409 });
    }

    try {
      const sponsorships = sponsorUpdate.type === "graduation"
        ? [sponsorUpdate.sponsorship!]
        : sponsorUpdate.resident.sponsorships.filter((sponsorship) =>
          isRegularSponsorUpdateRecipient(sponsorship, sponsorUpdate.resident.available));
      if (sponsorUpdate.type === "graduation" && !sponsorUpdate.isAwaitingReminder) {
        await dependencies.pauseCollection({
          stripeAccountId: sponsorUpdate.organization.stripeAccountId,
          subscriptionId: sponsorUpdate.sponsorship!.stripeSubscriptionId,
        });
      }
      const groups = Map.groupBy(sponsorships, ({ monthlyCents }) => monthlyCents);
      const deliveries = (await Promise.all([...groups].map(async ([monthlyCents, recipients]) => {
        const message = await dependencies.renderMessage(
          sponsorUpdate,
          monthlyCents ?? DEFAULT_SPONSORSHIP_MONTHLY_CENTS,
          approvedAt,
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
