"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  endAwaitingSponsorship,
  SponsorshipTransferError,
  transferSponsorship,
} from "@/lib/sponsorship-transfer";
import { uuidSchema } from "@/lib/uuid";
import {
  sponsorAccountSignInPath,
  sponsorAccountSwitchPath,
} from "@/lib/sponsor-account-navigation";

import {
  resolveSponsorshipSelection,
  sponsorshipSelectionSchema,
  type SponsorshipSelection,
} from "./selection";

const transferSchema = z.object({ residentId: uuidSchema });

function destination(orgSlug: string, selection: unknown, error?: string) {
  const params = new URLSearchParams();
  const parsed = sponsorshipSelectionSchema.safeParse(selection);
  if (parsed.success && parsed.data.token)
    params.set("token", parsed.data.token);
  else if (parsed.success && parsed.data.sponsorshipId) {
    params.set("sponsorship", parsed.data.sponsorshipId);
  }
  if (error) params.set("error", error);
  return `/${encodeURIComponent(orgSlug)}/sponsor/next?${params}`;
}

export async function transferSponsorshipAction(
  orgSlug: string,
  selection: SponsorshipSelection,
  formData: FormData,
) {
  const sponsorship = await resolveSponsorshipSelection(orgSlug, selection);
  const parsed = transferSchema.safeParse({
    residentId: formData.get("residentId"),
  });
  if (!sponsorship || !parsed.success)
    redirect(destination(orgSlug, selection, "invalid"));

  try {
    await transferSponsorship(sponsorship.id, parsed.data.residentId);
  } catch (error) {
    if (error instanceof SponsorshipTransferError) {
      redirect(destination(orgSlug, selection, error.code));
    }
    throw error;
  }
  const accountPath = sponsorAccountSwitchPath(sponsorship.id);
  redirect(
    selection.token ? sponsorAccountSignInPath(accountPath) : accountPath,
  );
}

export async function endSponsorshipAction(
  orgSlug: string,
  selection: SponsorshipSelection,
) {
  const sponsorship = await resolveSponsorshipSelection(orgSlug, selection);
  if (!sponsorship) redirect(destination(orgSlug, selection, "invalid"));

  try {
    await endAwaitingSponsorship(
      sponsorship.id,
      sponsorship.resident.unavailabilityReason ?? "unavailable",
    );
  } catch (error) {
    if (error instanceof SponsorshipTransferError) {
      redirect(destination(orgSlug, selection, error.code));
    }
    throw error;
  }
  redirect(destination(orgSlug, selection));
}
