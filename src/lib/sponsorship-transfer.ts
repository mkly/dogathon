import { render } from "@react-email/render";
import { createElement } from "react";

import type { Prisma } from "@/generated/prisma/client";
import { SponsorshipChoiceEmail } from "@/emails/sponsorship-choice-email";
import { createOrganizationEmailSender } from "@/lib/email-connectors";
import { prisma } from "@/lib/prisma";
import { revalidatePublicRoster } from "@/lib/public-roster-cache";
import { cancelStripeSubscription } from "@/lib/stripe-billing";

export type SponsorshipTransferErrorCode = "not_transferable" | "resident_unavailable";

export class SponsorshipTransferError extends Error {
  constructor(public readonly code: SponsorshipTransferErrorCode) {
    super(code === "not_transferable"
      ? "This sponsorship cannot be moved right now"
      : "This companion is no longer available");
    this.name = "SponsorshipTransferError";
  }
}

export type AwaitingEndReason = "adopted" | "unavailable";

type ChoiceResult = {
  monthlyCents: number;
  organization: { id: string; name: string; stripeAccountId: string | null };
  sponsor: { email: string; name: string };
};

type SponsorshipTransferDependencies = {
  cancel: typeof cancelStripeSubscription;
  revalidateRoster: () => void;
  sendEmail: typeof sendChoiceEmail;
  transaction: <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
};

async function sendChoiceEmail(
  result: ChoiceResult,
  input: { companionName?: string; type: "transferred" | "ended" },
) {
  const subject = input.type === "transferred"
    ? `Your sponsorship now supports ${input.companionName}`
    : `Thank you for sponsoring with ${result.organization.name}`;
  const email = createElement(SponsorshipChoiceEmail, {
    ...input,
    monthlyCents: result.monthlyCents,
    organizationName: result.organization.name,
    sponsorName: result.sponsor.name,
  });
  const [body, sendEmail] = await Promise.all([
    render(email),
    createOrganizationEmailSender(result.organization.id),
  ]);
  await sendEmail({ to: result.sponsor.email, subject, body, contentType: "html" });
}

const defaultDependencies: SponsorshipTransferDependencies = {
  cancel: cancelStripeSubscription,
  revalidateRoster: revalidatePublicRoster,
  sendEmail: sendChoiceEmail,
  transaction: (operation) => prisma.$transaction(operation, { timeout: 20_000 }),
};

export async function transferSponsorship(
  sponsorshipId: string,
  residentId: string,
  dependencies: SponsorshipTransferDependencies = defaultDependencies,
) {
  const result = await dependencies.transaction(async (tx) => {
    const sponsorship = await tx.sponsorship.findUnique({
      where: { id: sponsorshipId },
      include: {
        organization: { select: { id: true, name: true, stripeAccountId: true } },
        sponsor: { select: { email: true, name: true } },
      },
    });
    if (!sponsorship || !["active", "awaiting"].includes(sponsorship.status)) {
      throw new SponsorshipTransferError("not_transferable");
    }

    const resident = await tx.resident.findFirst({
      where: {
        id: { equals: residentId, not: sponsorship.residentId },
        orgId: sponsorship.orgId,
        available: true,
        sponsorships: { none: { status: "active" } },
      },
      select: { id: true, name: true },
    });
    if (!resident) throw new SponsorshipTransferError("resident_unavailable");

    const claimed = await tx.sponsorship.updateMany({
      where: { id: sponsorship.id, status: { in: ["active", "awaiting"] } },
      data: {
        residentId: resident.id,
        status: "active",
        endedAt: null,
        endedReason: null,
      },
    });
    if (claimed.count !== 1) throw new SponsorshipTransferError("not_transferable");

    return { ...sponsorship, companionName: resident.name };
  });

  dependencies.revalidateRoster();
  await dependencies.sendEmail(result, {
    companionName: result.companionName,
    type: "transferred",
  });
  return result;
}

export async function endAwaitingSponsorship(
  sponsorshipId: string,
  reason: AwaitingEndReason,
  dependencies: SponsorshipTransferDependencies = defaultDependencies,
) {
  const result = await dependencies.transaction(async (tx) => {
    const sponsorship = await tx.sponsorship.findUnique({
      where: { id: sponsorshipId },
      include: {
        organization: { select: { id: true, name: true, stripeAccountId: true } },
        sponsor: { select: { email: true, name: true } },
      },
    });
    if (!sponsorship || sponsorship.status !== "awaiting") {
      throw new SponsorshipTransferError("not_transferable");
    }

    const endedAt = new Date();
    const claimed = await tx.sponsorship.updateMany({
      where: { id: sponsorship.id, status: "awaiting" },
      data: { status: "ended", endedAt, endedReason: reason },
    });
    if (claimed.count !== 1) throw new SponsorshipTransferError("not_transferable");

    await dependencies.cancel({
      stripeAccountId: sponsorship.organization.stripeAccountId,
      subscriptionId: sponsorship.stripeSubscriptionId,
    });
    return { ...sponsorship, endedAt, endedReason: reason };
  });

  await dependencies.sendEmail(result, { type: "ended" });
  return result;
}
