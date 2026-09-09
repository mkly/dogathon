import { env } from "./env.ts";
import { prisma } from "./prisma.ts";
import { sponsorshipSelectionUrl } from "./sponsorship-selection-token.ts";
import {
  endAwaitingSponsorship,
  SponsorshipTransferError,
  type AwaitingEndReason,
} from "./sponsorship-transfer.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export const AWAITING_SPONSORSHIP_REMINDER_DAYS = 14;
export const AWAITING_SPONSORSHIP_END_DAYS = 30;

type AwaitingSponsorship = {
  id: string;
  orgId: string;
  awaitingSince: Date;
  organization: { slug: string };
  resident: {
    id: string;
    name: string;
    unavailabilityReason: AwaitingEndReason | null;
  };
  sponsor: { name: string };
};

export type SponsorshipGracePeriodResult = {
  drafted: number;
  ended: number;
  skipped: number;
};

type GracePeriodDependencies = {
  draftReminder: (sponsorship: AwaitingSponsorship, draftedAt: Date) => Promise<boolean>;
  endSponsorship: (id: string, reason: AwaitingEndReason) => Promise<unknown>;
  listAwaiting: (orgId: string, cutoff: Date) => Promise<AwaitingSponsorship[]>;
  now: () => Date;
};

function tokenSecret() {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required for sponsorship reminder links");
  }
  return env.BETTER_AUTH_SECRET;
}

async function draftReminder(
  sponsorship: AwaitingSponsorship,
  draftedAt: Date,
): Promise<boolean> {
  const actionUrl = sponsorshipSelectionUrl(
    env.BETTER_AUTH_URL,
    sponsorship.organization.slug,
    sponsorship.id,
    tokenSecret(),
    draftedAt,
  );

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.sponsorship.updateMany({
      where: {
        id: sponsorship.id,
        status: "awaiting",
        awaitingReminderDraftedAt: null,
      },
      data: { awaitingReminderDraftedAt: draftedAt },
    });
    if (claimed.count !== 1) return false;

    await tx.sponsorUpdate.create({
      data: {
        orgId: sponsorship.orgId,
        residentId: sponsorship.resident.id,
        sponsorshipId: sponsorship.id,
        type: "graduation",
        isAwaitingReminder: true,
        status: "draft",
        subject: `Choose the next companion for your sponsorship`,
        teaser: `${sponsorship.resident.name} left the rescue two weeks ago — pick who your sponsorship helps next.`,
        bodyText: `${sponsorship.sponsor.name}, it has been two weeks since ${sponsorship.resident.name} left the rescue. Please choose a new companion for your sponsorship using this secure link: ${actionUrl}`,
      },
    });
    return true;
  });
}

const defaultDependencies: GracePeriodDependencies = {
  draftReminder,
  endSponsorship: endAwaitingSponsorship,
  async listAwaiting(orgId, cutoff) {
    return prisma.sponsorship.findMany({
      where: {
        orgId,
        status: "awaiting",
        awaitingSince: { not: null, lte: cutoff },
      },
      select: {
        id: true,
        orgId: true,
        awaitingSince: true,
        organization: { select: { slug: true } },
        resident: { select: { id: true, name: true, unavailabilityReason: true } },
        sponsor: { select: { name: true } },
      },
      orderBy: [{ awaitingSince: "asc" }, { id: "asc" }],
    }) as Promise<AwaitingSponsorship[]>;
  },
  now: () => new Date(),
};

export function createSponsorshipGracePeriodProcessor(
  dependencies: GracePeriodDependencies = defaultDependencies,
) {
  return async function process(orgId: string): Promise<SponsorshipGracePeriodResult> {
    const now = dependencies.now();
    const reminderCutoff = new Date(
      now.getTime() - AWAITING_SPONSORSHIP_REMINDER_DAYS * DAY_MS,
    );
    const endCutoff = new Date(
      now.getTime() - AWAITING_SPONSORSHIP_END_DAYS * DAY_MS,
    );
    const sponsorships = await dependencies.listAwaiting(orgId, reminderCutoff);
    const result: SponsorshipGracePeriodResult = { drafted: 0, ended: 0, skipped: 0 };

    for (const sponsorship of sponsorships) {
      if (sponsorship.awaitingSince <= endCutoff) {
        try {
          await dependencies.endSponsorship(
            sponsorship.id,
            sponsorship.resident.unavailabilityReason ?? "unavailable",
          );
          result.ended += 1;
        } catch (error) {
          if (!(error instanceof SponsorshipTransferError) || error.code !== "not_awaiting") {
            throw error;
          }
          result.skipped += 1;
        }
        continue;
      }

      if (await dependencies.draftReminder(sponsorship, now)) result.drafted += 1;
      else result.skipped += 1;
    }

    return result;
  };
}

export async function processSponsorshipGracePeriod(orgId: string) {
  return createSponsorshipGracePeriodProcessor()(orgId);
}
