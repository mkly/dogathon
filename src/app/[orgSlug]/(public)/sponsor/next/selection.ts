import "server-only";

import { headers } from "next/headers";
import { z } from "zod";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getSponsorContext } from "@/lib/sponsor-access";
import { verifySponsorshipSelectionToken } from "@/lib/sponsorship-selection-token";
import { uuidSchema } from "@/lib/uuid";

export const sponsorshipSelectionSchema = z.object({
  sponsorshipId: z.string(),
  token: z.string(),
});

export type SponsorshipSelection = z.infer<typeof sponsorshipSelectionSchema>;

export async function resolveSponsorshipSelection(
  orgSlug: string,
  input: unknown,
) {
  const parsedSelection = sponsorshipSelectionSchema.safeParse(input);
  if (!parsedSelection.success) return null;
  const selection = parsedSelection.data;

  let sponsorshipId: string;
  let sponsorId: string | undefined;

  if (selection.token) {
    const verified = env.BETTER_AUTH_SECRET
      ? verifySponsorshipSelectionToken(selection.token, env.BETTER_AUTH_SECRET)
      : null;
    if (!verified) return null;
    sponsorshipId = verified.sponsorshipId;
  } else {
    const parsed = uuidSchema.safeParse(selection.sponsorshipId);
    if (!parsed.success) return null;

    const sponsor = await getSponsorContext(await headers());
    if (!sponsor) return null;
    sponsorshipId = parsed.data;
    sponsorId = sponsor.id;
  }

  return prisma.sponsorship.findFirst({
    where: {
      id: sponsorshipId,
      sponsorId,
      organization: { slug: orgSlug },
    },
    include: {
      resident: { select: { name: true, unavailabilityReason: true } },
    },
  });
}
