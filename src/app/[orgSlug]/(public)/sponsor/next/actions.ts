"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { verifySponsorshipSelectionToken } from "@/lib/sponsorship-selection-token";
import {
  endAwaitingSponsorship,
  SponsorshipTransferError,
  transferSponsorship,
} from "@/lib/sponsorship-transfer";
import { uuidSchema } from "@/lib/uuid";

const transferSchema = z.object({ residentId: uuidSchema });

function selection(token: string) {
  if (!env.BETTER_AUTH_SECRET) return null;
  return verifySponsorshipSelectionToken(token, env.BETTER_AUTH_SECRET);
}

function destination(orgSlug: string, token: string, error?: string) {
  const params = new URLSearchParams({ token });
  if (error) params.set("error", error);
  return `/${encodeURIComponent(orgSlug)}/sponsor/next?${params}`;
}

export async function transferSponsorshipAction(orgSlug: string, token: string, formData: FormData) {
  const authorized = selection(token);
  const parsed = transferSchema.safeParse({ residentId: formData.get("residentId") });
  if (!authorized || !parsed.success) redirect(destination(orgSlug, token, "invalid"));

  try {
    await transferSponsorship(authorized.sponsorshipId, parsed.data.residentId);
  } catch (error) {
    if (error instanceof SponsorshipTransferError) {
      redirect(destination(orgSlug, token, error.code));
    }
    throw error;
  }
  redirect(destination(orgSlug, token));
}

export async function endSponsorshipAction(orgSlug: string, token: string) {
  const authorized = selection(token);
  if (!authorized) redirect(destination(orgSlug, token, "invalid"));
  const sponsorship = await prisma.sponsorship.findFirst({
    where: { id: authorized.sponsorshipId, organization: { slug: orgSlug } },
    select: { resident: { select: { unavailabilityReason: true } } },
  });
  if (!sponsorship) redirect(destination(orgSlug, token, "invalid"));

  try {
    await endAwaitingSponsorship(
      authorized.sponsorshipId,
      sponsorship.resident.unavailabilityReason ?? "unavailable",
    );
  } catch (error) {
    if (error instanceof SponsorshipTransferError) {
      redirect(destination(orgSlug, token, error.code));
    }
    throw error;
  }
  redirect(destination(orgSlug, token));
}
